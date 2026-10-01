import 'server-only'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { sql, registrarEvento } from '@/lib/isa/banco'
import { enviarTemplate, qualidadeDoNumero, numeroDeAlerta, EnvioBloqueado } from '@/lib/isa/cloud'
import { alertarDono } from '@/lib/isa/alertas'
import { horaNoRio } from '@/lib/isa/hora.regras'
import { lerConfig, gravarConfig, templateLiberado } from '@/lib/isa/abordagem'
import {
  TEMPLATE_PROMO,
  PAYLOADS_PROMO,
  variaveisDaPromocao,
  textoDaPromocao,
  primeiroNomePromo,
  type Promocao,
} from '@/lib/isa/promocao.regras'

/**
 * Disparo da promocao "40% na ativacao" (dono, 29/09/2026). A lista e montada fora daqui (Power +
 * registros do site) e gravada em `isa_promocoes`; o cron da Isa manda um pouco por minuto, em
 * ordem de dia de contato.
 *
 * Travas: isa_config.promo40 ligado e ate_dia; 9h-19h no Rio; template APPROVED+UTILITY; qualidade
 * do numero GREEN (conferida de 5 em 5 min — saiu do verde, suspende e avisa o dono); na hora do
 * envio, quem ja fechou, foi transferido ou e consultor e pulado.
 */

interface ConfigPromo {
  ligado?: boolean
  /** AAAA-MM-DD: manda os contatos ate este dia (inclusive). */
  ate_dia?: string
  por_minuto?: number
  suspenso_em?: string | null
  motivo?: string | null
  qualidade?: string | null
  qualidade_em?: string
}

interface LinhaPromo {
  telefone: string
  nome: string | null
  veiculo: string
  valor_anterior: string
  valor_novo: string
  validade: string
  lote_dia: string
  ordem: number
  resposta: string | null
}

export type PromocaoDoContato = Promocao & { nome: string | null; resposta: string | null }

function paraPromocao(l: LinhaPromo): PromocaoDoContato {
  return {
    veiculo: l.veiculo,
    valorAnterior: Number(l.valor_anterior),
    valorNovo: Number(l.valor_novo),
    validade: String(l.validade).slice(0, 10),
    nome: l.nome,
    resposta: l.resposta,
  }
}

/** A promocao que este telefone RECEBEU (so conta depois de enviada). */
export async function promocaoDoContato(telefone: string): Promise<PromocaoDoContato | null> {
  const r = await sql<LinhaPromo>(
    `SELECT telefone, nome, veiculo, valor_anterior, validade::text AS validade, valor_novo, lote_dia::text AS lote_dia, ordem, resposta
       FROM public.isa_promocoes WHERE telefone = $1 AND status = 'enviada' LIMIT 1`,
    [telefone],
  )
  return r[0] ? paraPromocao(r[0]) : null
}

/** "seguir" nunca e rebaixado: quem ja quis seguir e depois escreveu continua "seguir". */
export async function registrarRespostaPromo(telefone: string, resposta: 'seguir' | 'agora_nao' | 'texto'): Promise<void> {
  await sql(
    `UPDATE public.isa_promocoes SET resposta = $2, respondido_em = now()
      WHERE telefone = $1 AND COALESCE(resposta, '') <> 'seguir'`,
    [telefone, resposta],
  )
}

/** Aba URGENTE (antiga "Precisa de voce"): fica ate o "ja cuidei" ou a janela de 24 h fechar. */
export async function marcarUrgente(telefone: string, motivo = 'promocao'): Promise<void> {
  // Sinal novo joga pra aba URGENTE e desfaz o "ja cuidei" (dono, 01/10/2026: "se eu coloquei no
  // ja cuidei ou outra tag e ele volta a conversar e fica quente, vc volta ele pro urgente").
  await sql(
    `UPDATE public.isa_contatos SET precisa_desde = now(), resolvido_em = NULL, updated_at = now()
      WHERE telefone = $1`,
    [telefone],
  )
  await registrarEvento(telefone, 'urgente', { motivo }, 'isa')
}

async function suspender(motivo: string): Promise<void> {
  await gravarConfig('promo40', { suspenso_em: new Date().toISOString(), motivo })
  await registrarEvento('sistema', 'promo40_suspensa', { motivo }, 'sistema')
  await alertarDono({ telefone: numeroDeAlerta() ?? 'sistema', nome: 'Isa', motivo: 'promocao', detalhe: `o disparo da promoção de 40% parou: ${motivo}` })
}

export async function dispararPromocao(agora = new Date()): Promise<{ enviados: number; motivo?: string }> {
  const cfg = (await lerConfig<ConfigPromo>('promo40')) ?? {}
  if (!cfg.ligado || !cfg.ate_dia) return { enviados: 0, motivo: 'desligado' }
  if (cfg.suspenso_em) return { enviados: 0, motivo: `suspenso: ${cfg.motivo ?? ''}` }
  const h = horaNoRio(agora)
  if (h < 9 || h >= 19) return { enviados: 0, motivo: 'fora do horario' }
  if (!(await templateLiberado(TEMPLATE_PROMO, 'templatePromo40', 'o disparo da promoção'))) return { enviados: 0, motivo: 'template' }

  if (!cfg.qualidade_em || agora.getTime() - Date.parse(cfg.qualidade_em) > 5 * 60_000) {
    const { rating } = await qualidadeDoNumero()
    await gravarConfig('promo40', { qualidade: rating, qualidade_em: agora.toISOString() })
    // Meta sem resposta: nao manda as cegas nesta rodada.
    if (!rating) return { enviados: 0, motivo: 'qualidade desconhecida' }
    if (rating !== 'GREEN') {
      await suspender(`qualidade do 98004-0964 ficou ${rating}`)
      return { enviados: 0, motivo: `qualidade ${rating}` }
    }
  }

  // Reivindica a rodada: dois crons nunca mandam pro mesmo telefone.
  const lote = (
    await sql<LinhaPromo>(
      `UPDATE public.isa_promocoes SET status = 'enviando'
        WHERE telefone IN (
          SELECT telefone FROM public.isa_promocoes
           WHERE status = 'fila' AND lote_dia <= $1::date
           ORDER BY lote_dia, ordem LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING telefone, nome, veiculo, valor_anterior, valor_novo, validade::text AS validade, lote_dia::text AS lote_dia, ordem, resposta`,
      [cfg.ate_dia, Math.min(Math.max(cfg.por_minuto ?? 15, 1), 40)],
    )
  ).sort((a, b) => a.lote_dia.localeCompare(b.lote_dia) || a.ordem - b.ordem)

  let enviados = 0
  for (const l of lote) {
    const tel = l.telefone
    const p = paraPromocao(l)
    try {
      // Na hora do envio: fechou, foi pro 4824 ou e consultor = nao recebe.
      const [atual] = await sql<{ etiquetas: string[] | null; transferido_em: string | null }>(
        `SELECT etiquetas, transferido_em FROM public.isa_contatos WHERE telefone = $1`,
        [tel],
      )
      const barrado = atual && ((atual.etiquetas ?? []).some((e) => e === 'fechou' || e === 'consultor' || e === 'vistoria') || atual.transferido_em)
      if (barrado) {
        await sql(`UPDATE public.isa_promocoes SET status = 'pulada', motivo = 'contato da Isa fechou/transferido/consultor' WHERE telefone = $1`, [tel])
        continue
      }
      const nome = primeiroNomePromo(l.nome) ?? 'tudo bem'
      // A cotacao da epoca recriada do Power (lead_promo40_<tel>): e dela que a Isa tira os planos e o PDF.
      await sql(
        `INSERT INTO public.isa_contatos (telefone, nome, entrada, lead_id)
         VALUES ($1, $2, 'promo40', (SELECT id FROM public.leads WHERE id = 'lead_promo40_' || $1))
         ON CONFLICT (telefone) DO UPDATE SET lead_id = COALESCE(EXCLUDED.lead_id, isa_contatos.lead_id), updated_at = now()`,
        [tel, l.nome],
      )
      const jid = phoneToJid(tel) ?? `${tel}@s.whatsapp.net`
      const conversa = await upsertConversation({ jid, evolution_instance: 'cloud_isa', contact_phone: tel, contact_name: l.nome ?? undefined })
      await sql(`UPDATE public.isa_contatos SET conversation_id = COALESCE(conversation_id, $2), updated_at = now() WHERE telefone = $1`, [tel, conversa.id])
      const wamid = await enviarTemplate(tel, TEMPLATE_PROMO, variaveisDaPromocao(nome, p), PAYLOADS_PROMO)
      await sql(`UPDATE public.isa_promocoes SET status = 'enviada', wamid = $2, enviado_em = now() WHERE telefone = $1`, [tel, wamid])
      await upsertMessage({
        conversation_id: conversa.id,
        whatsapp_message_id: wamid,
        evolution_instance: 'cloud_isa',
        jid,
        direction: 'outbound',
        status: 'SENT',
        sender: 'isa',
        message_type: 'text',
        content: textoDaPromocao(nome, p),
        sent_at: new Date().toISOString(),
      }).catch((err) => console.error('[isa] promo enviada mas nao gravada:', err))
      await registrarEvento(tel, 'promo40_enviada', { de: p.valorAnterior, para: p.valorNovo, dia: l.lote_dia })
      enviados++
    } catch (err) {
      // Fica marcado de proposito: sem nova tentativa em rajada.
      const msg = err instanceof Error ? err.message : String(err)
      await sql(`UPDATE public.isa_promocoes SET status = 'falhou', motivo = $2 WHERE telefone = $1`, [tel, msg.slice(0, 300)])
      await registrarEvento(tel, err instanceof EnvioBloqueado ? 'envio_bloqueado' : 'promo40_falhou', { erro: msg }, 'sistema')
    }
  }
  return { enviados }
}
