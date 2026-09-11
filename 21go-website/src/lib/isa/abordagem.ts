import 'server-only'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { sql, registrarEvento } from '@/lib/isa/banco'
import { enviarTemplate, destinoPermitido, qualidadeDoNumero, statusDoTemplate, numeroDeAlerta, EnvioBloqueado } from '@/lib/isa/cloud'
import { alertarDono } from '@/lib/isa/alertas'
import { dentroDoHorario } from '@/lib/isa/hora.regras'
import { numerosDeTeste } from '@/lib/isa/dono.regras'
import {
  TEMPLATE_5MIN,
  telefoneDeAbordagem,
  variaveisDoTemplate,
  textoDoTemplate,
  qualidadeRuim,
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
 *   - qualidade do numero YELLOW/RED na Meta suspende sozinha e avisa o dono;
 *   - destinoPermitido: em modo teste so a allowlist.
 */

const POR_RODADA = 5
const SITE = 'https://21go.site'
// Origens que o formulario do site grava (deriveOrigem). Fica de fora o que o CRM espelha
// (power_crm, manual, seja_consultor) e o que a propria Isa cria (isa_whatsapp).
const ORIGENS_DO_SITE = ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro']

interface Config5min {
  ligado_em?: string
  suspenso_em?: string | null
  motivo?: string
}

async function lerConfig<T>(chave: string): Promise<T | null> {
  const r = await sql<{ valor: T }>(`SELECT valor FROM public.isa_config WHERE chave = $1`, [chave])
  return r[0]?.valor ?? null
}

/** Mescla no valor que ja existe — gravar a qualidade nao apaga o "ligado_em". */
async function gravarConfig(chave: string, valor: Record<string, unknown>): Promise<void> {
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
       AND COALESCE(l.whatsapp_clicado, false) = false
       AND COALESCE(l.whatsapp_valido, true) = true
       AND l.created_at < (now() AT TIME ZONE 'UTC') - interval '5 minutes'
       AND l.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'
       AND l.created_at > ($1::timestamptz AT TIME ZONE 'UTC')
       AND NOT EXISTS (
         SELECT 1 FROM public.isa_contatos c WHERE c.telefone = l.telefone
           -- numero de teste do dono recebe de novo depois de cada /reiniciar
           AND NOT (c.telefone = ANY($4::text[]) AND c.abordagem5min_em IS NULL)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.leads o
         WHERE o.telefone = l.telefone AND o.whatsapp_clicado
           AND o.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'
       )
     ORDER BY l.telefone, l.created_at DESC
     LIMIT $2`,
    [cfg.ligado_em, POR_RODADA * 4, ORIGENS_DO_SITE, teste],
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
async function templateLiberado(): Promise<boolean> {
  const antes = await lerConfig<EstadoTemplate>('template5min')
  if (antes?.verificado_em && Date.now() - Date.parse(antes.verificado_em) < 10 * 60_000) return templatePodeSair(antes)
  const agora = await statusDoTemplate(TEMPLATE_5MIN)
  await gravarConfig('template5min', { ...agora, verificado_em: new Date().toISOString() })
  const pode = templatePodeSair(agora)
  if (!pode && antes && templatePodeSair(antes)) {
    await registrarEvento('sistema', 'template_5min_bloqueado', agora, 'sistema')
    await alertarDono({
      telefone: numeroDeAlerta() ?? 'sistema',
      nome: 'Isa',
      motivo: 'template',
      detalhe: `o template ${TEMPLATE_5MIN} ficou ${agora.status}/${agora.categoria} na Meta — a mensagem dos 5 min parou`,
    })
  }
  return pode
}

/**
 * De hora em hora: qualidade do numero na Meta. YELLOW/RED = a mensagem dos 5 min para (fica
 * suspensa ate alguem tirar `suspenso_em` de isa_config.5min) e o dono e avisado uma vez.
 */
async function vigiarQualidade(): Promise<void> {
  const q = await lerConfig<{ verificado_em?: string }>('qualidade')
  if (q?.verificado_em && Date.now() - Date.parse(q.verificado_em) < 60 * 60_000) return
  const { rating, limite } = await qualidadeDoNumero()
  await gravarConfig('qualidade', { rating, limite, verificado_em: new Date().toISOString() })
  if (!qualidadeRuim(rating)) return
  const cfg = await lerConfig<Config5min>('5min')
  if (cfg?.suspenso_em) return
  await gravarConfig('5min', { suspenso_em: new Date().toISOString(), motivo: `qualidade ${rating}` })
  await registrarEvento('sistema', 'qualidade_suspendeu', { rating, limite }, 'sistema')
  await alertarDono({
    telefone: numeroDeAlerta() ?? 'sistema',
    nome: 'Isa',
    motivo: 'qualidade',
    detalhe: `a qualidade do 98004-0964 na Meta ficou ${rating} — a mensagem dos 5 min foi suspensa`,
  })
}
