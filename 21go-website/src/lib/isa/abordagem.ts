import 'server-only'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { sql, registrarEvento } from '@/lib/isa/banco'
import { enviarTemplate, destinoPermitido, qualidadeDoNumero, statusDoTemplate, numeroDeAlerta, EnvioBloqueado } from '@/lib/isa/cloud'
import { alertarDono } from '@/lib/isa/alertas'
import { dentroDoHorario } from '@/lib/isa/hora.regras'
import { DOMINIOS_DA_CASA } from '@/lib/isa/popup.regras'
import { numerosDeTeste } from '@/lib/isa/dono.regras'
import {
  TEMPLATE_5MIN,
  TEMPLATE_RETOMADA,
  telefoneDeAbordagem,
  variaveisDoTemplate,
  textoDoTemplate,
  textoDaRetomada,
  paradosPelaQualidade,
  templatePodeSair,
} from '@/lib/isa/abordagem.regras'

/**
 * Mensagem dos 5 min: quem simulou num .site da casa, nao clicou em "Quero contratar" nem em
 * "Tenho uma duvida" (nem no popup) e passou 5 min recebe o template `resultado_simulacao_isa` (a entrega do resultado, com o PDF).
 *
 * Travas:
 *   - ISA_5MIN=on no env (padrao desligado) e so das 8h as 22h;
 *   - so lead criado DEPOIS de a chave ser ligada (isa_config.5min.ligado_em) e ha menos de 24 h;
 *   - uma vez por telefone: o INSERT em isa_contatos e a reivindicacao — quem ja falou com a Isa
 *     (tem contato) nunca recebe;
 *   - nunca lead de consultor (consultor_slug) — REGRA 0.1;
 *   - so lead dos .site da casa (leads.dominio): o .com.br fica de fora (dono, 13/09/2026);
 *   - qualidade do numero YELLOW/RED na Meta suspende sozinha e avisa o dono;
 *   - destinoPermitido: em modo teste so a allowlist.
 */

const POR_RODADA = 5
// slsmnNwId da Leticya no Power: negociacao com outro responsavel = placa presa com outro consultor.
const RESPONSAVEL_DA_CASA = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
const SITE = 'https://21go.site'
// Origens que o formulario do site grava (deriveOrigem). Fica de fora o que o CRM espelha
// (power_crm, manual, seja_consultor) e o que a propria Isa cria (isa_whatsapp).
const ORIGENS_DO_SITE = ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro']

interface Config5min {
  ligado_em?: string
  suspenso_em?: string | null
  motivo?: string
}

export async function lerConfig<T>(chave: string): Promise<T | null> {
  const r = await sql<{ valor: T }>(`SELECT valor FROM public.isa_config WHERE chave = $1`, [chave])
  return r[0]?.valor ?? null
}

/** Mescla no valor que ja existe — gravar a qualidade nao apaga o "ligado_em". */
export async function gravarConfig(chave: string, valor: Record<string, unknown>): Promise<void> {
  await sql(
    `INSERT INTO public.isa_config (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = isa_config.valor || EXCLUDED.valor, updated_at = now()`,
    [chave, JSON.stringify(valor)],
  )
}

interface LeadAbordagem {
  id: string
  nome: string | null
  telefone: string | null
  marca_interesse: string | null
  modelo_interesse: string | null
  ano_interesse: number | null
}

export async function abordarLeadsNovos(): Promise<{ enviados: number; motivo?: string }> {
  if (process.env.ISA_5MIN !== 'on') return { enviados: 0, motivo: 'desligada' }
  const agora = new Date()
  if (!dentroDoHorario(agora)) return { enviados: 0, motivo: 'fora_do_horario' }

  await vigiarQualidade().catch((err) => console.error('[isa] qualidade do numero:', err))
  const cfg = (await lerConfig<Config5min>('5min')) ?? {}
  if (cfg.suspenso_em) return { enviados: 0, motivo: 'suspensa' }
  if (!cfg.ligado_em) {
    await gravarConfig('5min', { ligado_em: agora.toISOString() })
    return { enviados: 0, motivo: 'ligou_agora' }
  }
  if (!(await templateLiberado())) return { enviados: 0, motivo: 'template_nao_liberado' }

  // Numeros de teste do dono: recebem de novo a cada /reiniciar (cliente, uma vez so).
  const teste = numerosDeTeste({ allowlist: process.env.ISA_ALLOWLIST, alerta: numeroDeAlerta() })

  // leads.created_at e timestamp sem fuso gravado em UTC.
  const candidatos = await sql<LeadAbordagem>(
    `SELECT DISTINCT ON (l.telefone) l.id, l.nome, l.telefone, l.marca_interesse, l.modelo_interesse, l.ano_interesse
     FROM public.leads l
     WHERE l.consultor_slug IS NULL
       AND l.cotacao_planos IS NOT NULL
       AND l.origem = ANY($3::text[])
       -- so os .site da casa (dono, 13/09/2026): lead sem dominio (antes desta coluna) fica de fora
       AND l.dominio = ANY($5::text[])
       -- placa presa com outro consultor (dono, 14/09/2026): a negociacao nasceu no nome dele
       AND (l.power_responsavel IS NULL OR l.power_responsavel = $6)
       AND COALESCE(l.whatsapp_valido, true) = true
       -- BYD e todo da Leticya, pelo 4824 (dono, 16/09/2026): a Isa nao aborda
       AND upper(trim(COALESCE(l.marca_interesse, ''))) NOT LIKE 'BYD%'
       -- Quem clica no botao do site cai no 4824, chip que a Isa nao enxerga. Antes ela ignorava
       -- TODO mundo que clicou; em 14/09/2026 o dono mostrou a Camila (PWR9883), que clicou e
       -- nunca escreveu: 17 dos 22 que clicaram em 2 dias ficaram sem atendimento de ninguem.
       -- Agora quem clicou espera 10 min (dono) em vez de 5, e so entra se ninguem estiver falando.
       AND l.created_at < (now() AT TIME ZONE 'UTC')
             - (CASE WHEN COALESCE(l.whatsapp_clicado, false) THEN interval '10 minutes' ELSE interval '5 minutes' END)
       AND l.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'
       AND l.created_at > ($1::timestamptz AT TIME ZONE 'UTC')
       AND NOT EXISTS (
         SELECT 1 FROM public.isa_contatos c WHERE c.telefone = l.telefone
           -- numero de teste do dono recebe de novo depois de cada /reiniciar
           AND NOT (c.telefone = ANY($4::text[]) AND c.abordagem5min_em IS NULL)
       )
       -- Conversa de verdade em QUALQUER chip (o 4824 da Leticya inclusive): a Isa nao fala por
       -- cima. Compara os 8 ultimos digitos porque o 9 do celular diverge entre o formulario e o
       -- numero real do WhatsApp. O corte por created_at vem primeiro: olha so o dia, nao a tabela
       -- inteira. Numero de teste do dono fica de fora da trava, senao ele nao consegue testar.
       AND (
         l.telefone = ANY($4::text[])
         OR NOT EXISTS (
           SELECT 1 FROM public.messages m
           WHERE m.created_at > now() - interval '24 hours'
             AND right(split_part(m.jid, '@', 1), 8) = right(l.telefone, 8)
         )
       )
     ORDER BY l.telefone, l.created_at DESC
     LIMIT $2`,
    [cfg.ligado_em, POR_RODADA * 4, ORIGENS_DO_SITE, teste, DOMINIOS_DA_CASA, RESPONSAVEL_DA_CASA],
  )

  let enviados = 0
  for (const l of candidatos) {
    if (enviados >= POR_RODADA) break
    const tel = telefoneDeAbordagem(l.telefone)
    if (!tel || !destinoPermitido(tel)) continue
    const nv = variaveisDoTemplate({ nome: l.nome, marca: l.marca_interesse, modelo: l.modelo_interesse, ano: l.ano_interesse })
    if (!nv) continue
    const vars: [string, string, string] = [...nv, `${SITE}/api/pdfs/${l.id}`]

    // O INSERT e a trava: dois workers nunca mandam pro mesmo telefone, e quem ja tem contato
    // com a Isa (conversou, recebeu antes) fica de fora.
    const reivindicou = await sql(
      `INSERT INTO public.isa_contatos (telefone, lead_id, nome, entrada, abordagem5min_em)
       VALUES ($1, $2, $3, '5min', now())
       ON CONFLICT (telefone) DO UPDATE SET entrada = '5min', abordagem5min_em = now(), lead_id = EXCLUDED.lead_id, updated_at = now()
         WHERE isa_contatos.telefone = ANY($4::text[]) AND isa_contatos.abordagem5min_em IS NULL
       RETURNING telefone`,
      [tel, l.id, l.nome, teste],
    )
    if (reivindicou.length === 0) continue

    try {
      const jid = phoneToJid(tel) ?? `${tel}@s.whatsapp.net`
      const conversa = await upsertConversation({
        jid,
        evolution_instance: 'cloud_isa',
        contact_phone: tel,
        contact_name: l.nome,
        lead_id: l.id,
      })
      await sql(`UPDATE public.isa_contatos SET conversation_id = $2, updated_at = now() WHERE telefone = $1`, [tel, conversa.id])
      const wamid = await enviarTemplate(tel, TEMPLATE_5MIN, vars)
      await upsertMessage({
        conversation_id: conversa.id,
        whatsapp_message_id: wamid,
        evolution_instance: 'cloud_isa',
        jid,
        direction: 'outbound',
        status: 'SENT',
        sender: 'isa',
        message_type: 'text',
        content: textoDoTemplate(vars),
        sent_at: new Date().toISOString(),
      }).catch((err) => console.error('[isa] 5 min enviado mas nao gravado:', err))
      await registrarEvento(tel, '5min', { lead: l.id })
      enviados++
    } catch (err) {
      // Fica reivindicado de proposito: sem nova tentativa, sem rajada quando o erro passar.
      await registrarEvento(
        tel,
        err instanceof EnvioBloqueado ? 'envio_bloqueado' : '5min_falhou',
        { lead: l.id, erro: err instanceof Error ? err.message : String(err) },
        'sistema',
      )
    }
  }
  return { enviados }
}

/**
 * A segunda e ULTIMA mensagem de quem nao respondeu (dono, 14/09/2026): 10 min depois do
 * resultado, o template `duvida_valores_isa` pergunta se ficou duvida nos valores ou nas
 * coberturas. Quem nao responder nem a essa nao recebe mais nada.
 *
 * Travas, as mesmas do primeiro: ISA_RETOMADA=on, 8h-22h, template APPROVED+UTILITY, qualidade
 * do numero e allowlist.
 *
 * Pega TODO mundo que passou dos 10 min, inclusive quem ja estava parado antes de isto existir
 * (dono, 14/09/2026: "pode disparar para todos com mais de 10 minutos"). Nao ha corte por data
 * de proposito: o freio e o POR_RODADA do cron de 1 min (5 por minuto) e o
 * `retomada_sem_resposta_em`, que garante uma vez por pessoa para sempre.
 */
export async function retomarSemResposta(): Promise<{ enviados: number; motivo?: string }> {
  if (process.env.ISA_RETOMADA !== 'on') return { enviados: 0, motivo: 'desligada' }
  const agora = new Date()
  if (!dentroDoHorario(agora)) return { enviados: 0, motivo: 'fora_do_horario' }

  // Tambem aqui: se o 5 min estiver desligado, e esta a unica que olharia a qualidade do numero.
  await vigiarQualidade().catch((err) => console.error('[isa] qualidade do numero:', err))
  const cfg = (await lerConfig<Config5min>('retomada')) ?? {}
  if (cfg.suspenso_em) return { enviados: 0, motivo: 'suspensa' }
  if (!(await templateLiberado(TEMPLATE_RETOMADA, 'templateRetomada', 'a retomada dos 10 min'))) {
    return { enviados: 0, motivo: 'template_nao_liberado' }
  }

  const candidatos = await sql<LeadAbordagem & { conversation_id: string | null }>(
    `SELECT l.id, l.nome, c.telefone, l.marca_interesse, l.modelo_interesse, l.ano_interesse, c.conversation_id
       FROM public.isa_contatos c
       JOIN public.leads l ON l.id = c.lead_id
      WHERE c.entrada = '5min'
        AND c.ligada
        AND c.retomada_sem_resposta_em IS NULL
        AND c.abordagem5min_em < now() - interval '10 minutes'
        -- So ate 24 h depois da 1a mensagem. Sem este teto, depois de 4 dias suspensa (17-21/09/2026)
        -- a retomada varreu todo mundo que nunca respondeu desde o dia 13 — gente que simulou ha
        -- dias recebendo "ficou alguma duvida?" do nada.
        AND c.abordagem5min_em > now() - interval '24 hours'
        -- Quem nunca respondeu, e tambem quem respondeu e deixou a janela fechar (dono,
        -- 14/09/2026: "pode disparar para todos que a Isa atendeu desde ontem"). Dentro da
        -- janela nao entra: ali ela fala por texto livre, sem template e sem custo.
        AND (c.ultimo_inbound_em IS NULL OR c.janela_ate IS NULL OR c.janela_ate < now())
        -- Conversa que virou assunto de gente nao leva template de robo por cima.
        AND c.humano_em IS NULL
        AND c.pausa_motivo IS NULL
        -- BYD e todo da Leticya (dono, 16/09/2026)
        AND upper(trim(COALESCE(l.marca_interesse, ''))) NOT LIKE 'BYD%'
      ORDER BY c.abordagem5min_em
      LIMIT $1`,
    [POR_RODADA],
  )

  let enviados = 0
  for (const l of candidatos) {
    const tel = telefoneDeAbordagem(l.telefone)
    if (!tel || !destinoPermitido(tel)) continue
    const nv = variaveisDoTemplate({ nome: l.nome, marca: l.marca_interesse, modelo: l.modelo_interesse, ano: l.ano_interesse })
    if (!nv) continue
    const vars: [string, string, string] = [...nv, `${SITE}/api/pdfs/${l.id}`]

    // Marcar ANTES de enviar: erro no meio nao vira segunda tentativa, e dois workers nunca
    // mandam pro mesmo telefone.
    const reivindicou = await sql(
      `UPDATE public.isa_contatos SET retomada_sem_resposta_em = now(), updated_at = now()
        WHERE telefone = $1 AND retomada_sem_resposta_em IS NULL
          -- se ele escreveu entre a fila e agora, a janela abriu: a Isa fala livre, sem template
          AND (ultimo_inbound_em IS NULL OR janela_ate IS NULL OR janela_ate < now())
        RETURNING telefone`,
      [tel],
    )
    if (reivindicou.length === 0) continue

    try {
      const wamid = await enviarTemplate(tel, TEMPLATE_RETOMADA, vars)
      if (l.conversation_id) {
        await upsertMessage({
          conversation_id: l.conversation_id,
          whatsapp_message_id: wamid,
          evolution_instance: 'cloud_isa',
          jid: phoneToJid(tel) ?? `${tel}@s.whatsapp.net`,
          direction: 'outbound',
          status: 'SENT',
          sender: 'isa',
          message_type: 'text',
          content: textoDaRetomada(vars),
          sent_at: new Date().toISOString(),
        }).catch((err) => console.error('[isa] retomada enviada mas nao gravada:', err))
      }
      await registrarEvento(tel, 'retomada10min', { lead: l.id })
      enviados++
    } catch (err) {
      await registrarEvento(
        tel,
        err instanceof EnvioBloqueado ? 'envio_bloqueado' : 'retomada_falhou',
        { lead: l.id, erro: err instanceof Error ? err.message : String(err) },
        'sistema',
      )
    }
  }
  return { enviados }
}

interface EstadoTemplate {
  status: string | null
  categoria: string | null
  verificado_em?: string
}

/**
 * O template so sai APPROVED e UTILITY (dono: "tem que ser sempre utilidade"). A Meta recategoriza
 * sozinha — o primeiro texto virou MARKETING ainda na analise — entao confere de 10 em 10 min e,
 * se deixar de poder sair, para e avisa o dono uma vez.
 */
async function templateLiberado(
  nome: string = TEMPLATE_5MIN,
  chave: string = 'template5min',
  rotulo: string = 'a mensagem dos 5 min',
): Promise<boolean> {
  const antes = await lerConfig<EstadoTemplate>(chave)
  if (antes?.verificado_em && Date.now() - Date.parse(antes.verificado_em) < 10 * 60_000) return templatePodeSair(antes)
  const agora = await statusDoTemplate(nome)
  await gravarConfig(chave, { ...agora, verificado_em: new Date().toISOString() })
  const pode = templatePodeSair(agora)
  if (!pode && antes && templatePodeSair(antes)) {
    await registrarEvento('sistema', `template_bloqueado`, { template: nome, ...agora }, 'sistema')
    await alertarDono({
      telefone: numeroDeAlerta() ?? 'sistema',
      nome: 'Isa',
      motivo: 'template',
      detalhe: `o template ${nome} ficou ${agora.status}/${agora.categoria} na Meta — ${rotulo} parou`,
    })
  }
  return pode
}

/**
 * De hora em hora: qualidade do numero na Meta. Amarelo para a 2a mensagem, vermelho para as duas
 * (`paradosPelaQualidade`), e quando volta a verde RELIGA SOZINHO. So mexe no que ela mesma parou
 * (motivo "qualidade ..."): suspensao manual continua valendo. O dono e avisado a cada mudanca.
 */
async function vigiarQualidade(): Promise<void> {
  const q = await lerConfig<{ verificado_em?: string }>('qualidade')
  if (q?.verificado_em && Date.now() - Date.parse(q.verificado_em) < 60 * 60_000) return
  const { rating, limite } = await qualidadeDoNumero()
  await gravarConfig('qualidade', { rating, limite, verificado_em: new Date().toISOString() })
  // Meta fora do ar ou sem resposta: nao decide nada as cegas.
  if (!rating) return
  const parar = paradosPelaQualidade(rating)
  const mudancas: string[] = []
  for (const [chave, deveParar, rotulo] of [
    ['5min', parar.cincoMin, 'a mensagem dos 5 min'],
    ['retomada', parar.retomada, 'a retomada dos 10 min'],
  ] as const) {
    const cfg = (await lerConfig<Config5min>(chave)) ?? {}
    const paradaPelaQualidade = !!cfg.suspenso_em && (cfg.motivo || '').startsWith('qualidade')
    if (deveParar && !cfg.suspenso_em) {
      await gravarConfig(chave, { suspenso_em: new Date().toISOString(), motivo: `qualidade ${rating}` })
      mudancas.push(`${rotulo} parou`)
    } else if (!deveParar && paradaPelaQualidade) {
      await gravarConfig(chave, { suspenso_em: null, motivo: null, religado_em: new Date().toISOString(), religado_por: 'qualidade voltou' })
      mudancas.push(`${rotulo} voltou`)
    }
  }
  if (!mudancas.length) return
  await registrarEvento('sistema', 'qualidade_mudou', { rating, limite, mudancas }, 'sistema')
  await alertarDono({
    telefone: numeroDeAlerta() ?? 'sistema',
    nome: 'Isa',
    motivo: 'qualidade',
    detalhe: `a qualidade do 98004-0964 na Meta esta ${rating}: ${mudancas.join(', ')}`,
  })
}
