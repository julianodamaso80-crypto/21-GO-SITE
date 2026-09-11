import 'server-only'
import { podeResponder } from '@/lib/whatsapp-cloud'
import { mediaIdValido } from '@/lib/isa/envio.regras'

/**
 * Tudo que sai da Isa pela WhatsApp Cloud API (numero 98004-0964).
 *
 * TODO envio passa por `destinoPermitido`. Em modo teste so a allowlist recebe; o numero de
 * alertas do dono (ISA_ALERTA_PARA) e a unica excecao, porque e interno e e justamente por ele
 * que a Isa pede socorro. Nenhuma funcao aqui envia sem essa checagem.
 *
 * "Digitando" e leitura vem do adaptador whatsapp_cloud do Hermes (NousResearch/hermes-agent):
 * um POST so marca como lida E mostra digitando; o indicador some sozinho em 25 s ou quando a
 * resposta sai. Erro 131009 = wamid com mais de 30 dias.
 */

const VERSAO = 'v22.0'
const graph = (path: string) => `https://graph.facebook.com/${VERSAO}/${path}`

function token(): string {
  const t = process.env.WA_TOKEN
  if (!t) throw new Error('WA_TOKEN ausente')
  return t
}

function phoneId(): string {
  const p = process.env.WA_PHONE_ID
  if (!p) throw new Error('WA_PHONE_ID ausente')
  return p
}

export function numeroDeAlerta(): string | null {
  return process.env.ISA_ALERTA_PARA || null
}

export function destinoPermitido(to: string): boolean {
  if (to === numeroDeAlerta()) return true
  return podeResponder(to, { modoTeste: process.env.ISA_MODO_TESTE, allowlist: process.env.ISA_ALLOWLIST })
}

export class EnvioBloqueado extends Error {}

async function postarMensagem(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(graph(`${phoneId()}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { code?: number; message?: string }
  }
  if (!res.ok || !corpo.messages?.[0]?.id) {
    throw new Error(`Cloud API ${res.status} ${corpo.error?.code ?? ''}: ${corpo.error?.message ?? 'sem id'}`)
  }
  return corpo.messages[0].id
}

/** Texto livre — so dentro da janela de 24 h que o cliente abriu. Devolve o wamid. */
export async function enviarTexto(to: string, texto: string): Promise<string> {
  if (!destinoPermitido(to)) throw new EnvioBloqueado(`destino fora da allowlist: ${to.slice(0, 6)}***`)
  return postarMensagem({ to, type: 'text', text: { body: texto, preview_url: true } })
}

/** Template aprovado (UTILITY). `variaveis` na ordem dos {{1}}, {{2}}... do corpo. */
export async function enviarTemplate(to: string, nome: string, variaveis: string[]): Promise<string> {
  if (!destinoPermitido(to)) throw new EnvioBloqueado(`destino fora da allowlist: ${to.slice(0, 6)}***`)
  return postarMensagem({
    to,
    type: 'template',
    template: {
      name: nome,
      language: { code: 'pt_BR' },
      components: variaveis.length
        ? [{ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: v.slice(0, 900) })) }]
        : [],
    },
  })
}

/** Tique azul + "digitando...". Melhor esforco: nunca derruba a resposta. */
export async function marcarLidaEDigitando(wamid: string): Promise<void> {
  try {
    const res = await fetch(graph(`${phoneId()}/messages`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
        typing_indicator: { type: 'text' },
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      const c = (await res.json().catch(() => ({}))) as { error?: { code?: number } }
      if (c.error?.code === 131009) console.info('[isa] digitando recusado: wamid com mais de 30 dias')
      else console.warn('[isa] digitando falhou', res.status, c.error?.code)
    }
  } catch {
    /* melhor esforco */
  }
}

/**
 * Baixa midia recebida: GET /<media_id> devolve URL assinada (~5 min), que tambem exige o token.
 * O media_id vem de payload externo — validado antes de virar URL.
 */
export async function baixarMidia(mediaId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!mediaIdValido(mediaId)) {
    console.warn('[isa] media_id recusado:', String(mediaId).slice(0, 40))
    return null
  }
  const auth = { Authorization: `Bearer ${token()}` }
  const meta = await fetch(graph(mediaId), { headers: auth, signal: AbortSignal.timeout(10_000) })
  if (!meta.ok) return null
  const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string }
  if (!info.url) return null
  const arq = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(20_000) })
  if (!arq.ok) return null
  return { bytes: Buffer.from(await arq.arrayBuffer()), mime: info.mime_type || 'application/octet-stream' }
}
