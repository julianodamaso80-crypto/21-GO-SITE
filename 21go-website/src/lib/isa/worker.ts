import 'server-only'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { mensagensDoNumero } from '@/lib/whatsapp-cloud'
import {
  reivindicarPendentes,
  liberar,
  soltarSemProcessar,
  chegouMensagemNova,
  inboundsNovas,
  gravarTranscricao,
  registrarEvento,
  type ContatoIsa,
  type MensagemHistorico,
} from '@/lib/isa/banco'
import {
  enviarTexto,
  marcarLidaEDigitando,
  baixarMidia,
  destinoPermitido,
  numeroDeAlerta,
  EnvioBloqueado,
} from '@/lib/isa/cloud'
import { transcrever } from '@/lib/isa/transcrever'
import { dividirEmPartes, pausaEntreSegundos } from '@/lib/isa/envio.regras'
import { cumprimento, dentroDoHorario } from '@/lib/isa/hora.regras'

/**
 * A fila da Isa. Roda disparada pelo webhook (10,5 s depois da mensagem) e por um cron de 1 em
 * 1 minuto, que pega o que o webhook perdeu (deploy no meio, container reiniciado) e a fila das
 * 8h. O estado mora no banco — dois workers ao mesmo tempo nunca respondem o mesmo cliente.
 */

const SILENCIO_SEG = 10 // cliente parou de digitar: as mensagens picadas viram uma resposta so
const LOCK_SEG = 300
const LIMITE = 10

const dormir = (s: number) => new Promise((r) => setTimeout(r, Math.round(s * 1000)))

export interface ResultadoFila {
  processados: number
  respondidos: number
  foraDoHorario?: boolean
}

export async function processarFila(): Promise<ResultadoFila> {
  const agora = new Date()
  if (!dentroDoHorario(agora)) return { processados: 0, respondidos: 0, foraDoHorario: true }

  const contatos = await reivindicarPendentes({ silencioSeg: SILENCIO_SEG, lockSeg: LOCK_SEG, limite: LIMITE })
  const resultados = await Promise.all(contatos.map((c) => atender(c).catch(async (err) => {
    console.error('[isa] erro atendendo', c.telefone.slice(0, 6), err)
    await registrarEvento(c.telefone, 'erro', { mensagem: err instanceof Error ? err.message : String(err) }, 'sistema')
    await liberar(c.telefone, c.ultimo_inbound_em, false).catch(() => {})
    return false
  })))
  return { processados: contatos.length, respondidos: resultados.filter(Boolean).length }
}

/** Devolve true se respondeu o cliente. */
async function atender(c: ContatoIsa): Promise<boolean> {
  const visto = c.ultimo_inbound_em
  if (!c.conversation_id) {
    await liberar(c.telefone, visto, false)
    return false
  }

  const novas = await inboundsNovas(c.conversation_id, c.processado_ate)
  await transcreverAudios(novas)

  // O numero de alertas do dono conversa com a Isa pelo mesmo canal, mas nao e cliente.
  if (c.telefone === numeroDeAlerta()) {
    await liberar(c.telefone, visto, false)
    return false
  }

  if (!c.ligada) {
    await liberar(c.telefone, visto, false)
    return false
  }

  // Modo teste: quem nao esta na allowlist fica gravado e sem resposta. Marca como processado
  // de proposito — quando a trava sair, a Isa nao responde mensagem de dias atras.
  if (!destinoPermitido(c.telefone)) {
    await registrarEvento(c.telefone, 'silenciado_modo_teste', { mensagens: novas.length }, 'sistema')
    await liberar(c.telefone, visto, false)
    return false
  }

  if (!dentroDoHorario(new Date())) {
    await soltarSemProcessar(c.telefone)
    return false
  }

  const resposta = responderEco(novas)
  const ultimaInbound = novas[novas.length - 1]?.whatsapp_message_id
  const enviou = await enviarComoGente(c, resposta, ultimaInbound, visto)
  await liberar(c.telefone, visto, enviou)
  return enviou
}

/** FASE 1: so ecoa, pra provar fila, agrupamento, horario, digitando e partes. */
function responderEco(novas: MensagemHistorico[]): string {
  const textos = novas.map((m) => m.content).filter(Boolean)
  return `${cumprimento(new Date())}! 😃\n\nrecebi ${textos.length} mensagem(ns):\n${textos.join('\n')}`
}

async function transcreverAudios(novas: MensagemHistorico[]): Promise<void> {
  const phoneId = process.env.WA_PHONE_ID ?? ''
  for (const m of novas) {
    if (m.message_type !== 'audio' || !m.content.startsWith('[')) continue
    const original = mensagensDoNumero(m.raw_payload, phoneId).find((x) => x.id === m.whatsapp_message_id)
    if (!original?.mediaId) continue
    const midia = await baixarMidia(original.mediaId)
    const texto = midia ? await transcrever(midia.bytes, midia.mime) : null
    if (texto) {
      await gravarTranscricao(m.id, texto)
      m.content = `🎤 ${texto}`
    }
  }
}

/**
 * Tique azul → pausa curta → "digitando..." → partes, com pausa entre elas pela formula do
 * Parlant. Antes de cada parte confere se o cliente escreveu de novo: se escreveu, para e deixa a
 * proxima rodada responder lendo tudo — e o que uma pessoa faria.
 */
export async function enviarComoGente(
  c: ContatoIsa,
  texto: string,
  ultimaInboundWamid: string | undefined,
  visto: string | null,
  sender = 'isa',
): Promise<boolean> {
  const partes = dividirEmPartes(texto)
  if (partes.length === 0) return false

  if (ultimaInboundWamid) await marcarLidaEDigitando(ultimaInboundWamid)
  await dormir(1 + Math.random())

  let enviadas = 0
  for (let i = 0; i < partes.length; i++) {
    if (i > 0 && (await chegouMensagemNova(c.telefone, visto))) {
      await registrarEvento(c.telefone, 'interrompida', { enviadas, total: partes.length })
      break
    }
    try {
      const wamid = await enviarTexto(c.telefone, partes[i])
      enviadas++
      await upsertMessage({
        conversation_id: c.conversation_id,
        whatsapp_message_id: wamid,
        evolution_instance: 'cloud_isa',
        jid: phoneToJid(c.telefone) ?? `${c.telefone}@s.whatsapp.net`,
        direction: 'outbound',
        status: 'SENT',
        sender,
        message_type: 'text',
        content: partes[i],
        sent_at: new Date().toISOString(),
      }).catch((err) => console.error('[isa] resposta enviada mas nao gravada:', err))
    } catch (err) {
      const bloqueado = err instanceof EnvioBloqueado
      await registrarEvento(c.telefone, bloqueado ? 'envio_bloqueado' : 'envio_falhou', {
        parte: i,
        erro: err instanceof Error ? err.message : String(err),
      })
      break
    }
    const proxima = partes[i + 1]
    if (proxima) {
      if (ultimaInboundWamid) await marcarLidaEDigitando(ultimaInboundWamid) // o indicador some em 25 s
      await dormir(pausaEntreSegundos(partes[i], proxima))
    }
  }
  return enviadas > 0
}
