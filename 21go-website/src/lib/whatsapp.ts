/**
 * Envio de WhatsApp via Evolution API.
 * Instância em produção: 21 go 0741 @ evolution.sinistro21go.site
 * (número 5521969620781). Atualizado em 2026-06-02.
 *
 * Instância anterior 21 go 0741 (5521969620781) foi BANIDA pelo WhatsApp —
 * trocada por 21 go 0741, que estava de backup no painel.
 */

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '21 go 0741'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''

export function isWhatsappConfigured(): boolean {
  return Boolean(EVOLUTION_API_URL && EVOLUTION_INSTANCE && EVOLUTION_API_KEY)
}

export function getEvolutionInstance(): string {
  return EVOLUTION_INSTANCE
}

export function formatPhone(whatsapp: string): string {
  const raw = whatsapp.replace(/\D/g, '')
  return raw.startsWith('55') ? raw : `55${raw}`
}

/**
 * Resposta normalizada da Evolution após envio.
 * `whatsapp_message_id` é o id retornado pela API (key.id),
 * usado pra dedup no Supabase.
 */
export interface SendResult {
  ok: boolean
  whatsapp_message_id: string | null
  remote_jid: string | null
  status: string | null
  raw: unknown
}

function parseEvolutionResponse(raw: unknown): SendResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const key = obj.key as { id?: string; remoteJid?: string } | undefined
  return {
    ok: true,
    whatsapp_message_id: key?.id ?? null,
    remote_jid: key?.remoteJid ?? null,
    status: (obj.status as string) ?? null,
    raw,
  }
}

export async function sendText(phone: string, text: string): Promise<SendResult> {
  if (!EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_KEY não configurada')
  }
  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`
  console.log('[WhatsApp] sendText →', phone, '(', text.length, 'chars )')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number: phone, text }),
  })
  const bodyText = await res.text().catch(() => '')
  console.log('[WhatsApp] sendText resp:', res.status, bodyText.slice(0, 300))
  if (!res.ok) throw new Error(`sendText falhou ${res.status}: ${bodyText.slice(0, 200)}`)
  let parsed: unknown = null
  try { parsed = JSON.parse(bodyText) } catch { parsed = bodyText }
  return parseEvolutionResponse(parsed)
}

export async function sendPdfMedia(
  phone: string,
  media: string,
  caption: string,
  filename: string,
): Promise<SendResult> {
  if (!EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_KEY não configurada')
  }
  const url = `${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`
  const isUrl = media.startsWith('http')
  console.log(
    '[WhatsApp] sendPdfMedia →',
    phone,
    isUrl ? `URL=${media.slice(0, 80)}` : `base64=${media.length} chars`,
    'file=',
    filename,
  )
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({
      number: phone,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media,
      caption,
      fileName: filename,
    }),
  })
  const bodyText = await res.text().catch(() => '')
  console.log('[WhatsApp] sendPdfMedia resp:', res.status, bodyText.slice(0, 300))
  if (!res.ok) throw new Error(`sendPdfMedia falhou ${res.status}: ${bodyText.slice(0, 200)}`)
  let parsed: unknown = null
  try { parsed = JSON.parse(bodyText) } catch { parsed = bodyText }
  return parseEvolutionResponse(parsed)
}

/**
 * Constrói a mensagem padrão de follow-up (idêntica ao CRM).
 * Quando o lead é normal (com PDF), serve como caption do PDF.
 */
export function buildFollowUpMessage(input: {
  nome: string
  marca?: string | null
  modelo?: string | null
  placa?: string | null
}): string {
  const firstName = input.nome.split(' ')[0]
  const isMoto =
    (input.marca || '').toLowerCase().includes('moto') ||
    (input.modelo || '').toLowerCase().includes('moto')
  const tipo = isMoto ? 'moto' : 'carro'
  const veiculoText =
    input.modelo && input.modelo !== '(manual)' && input.modelo !== '(informado manualmente)'
      ? `${input.marca || ''} ${input.modelo}`.trim()
      : tipo === 'moto'
        ? 'sua moto'
        : 'seu carro'
  const placaText = input.placa ? `, placa *${input.placa}*` : ''

  return [
    `Oi *${firstName}*! Tudo bem? 😊`,
    ``,
    `Me chamo Letycia e estou aqui para dar sequência no seu atendimento.`,
    ``,
    `Preparei sua *simulação completa* em PDF d${isMoto ? 'a' : 'o'} *${veiculoText}*${placaText}.`,
    ``,
    `Ficou com alguma dúvida que eu possa te ajudar? Se sim, qual dúvida?`,
  ].join('\n')
}

/**
 * Fallback quando dados pra gerar PDF estão incompletos (ex: FIPE = 0,
 * marca/modelo/plano ausente). Não promete PDF que não vai chegar.
 */
export function buildIncompleteDataMessage(input: {
  nome: string
  marca?: string | null
  modelo?: string | null
  placa?: string | null
}): string {
  const firstName = input.nome.split(' ')[0]
  const veiculoBits = [input.marca, input.modelo].filter(Boolean).join(' ').trim()
  const placaText = input.placa ? ` (placa *${input.placa}*)` : ''
  const veiculoText = veiculoBits ? `do *${veiculoBits}*${placaText}` : 'do seu veículo'

  return [
    `Oi *${firstName}*! Tudo bem? 😊`,
    ``,
    `Me chamo Letycia e recebi a sua simulação ${veiculoText}.`,
    ``,
    `Preciso confirmar alguns dados pra finalizar o seu orçamento personalizado. Pode me responder por aqui pra eu te ajudar?`,
  ].join('\n')
}

/**
 * Mensagem para veículos da lista de exclusão (sem cotação automática).
 */
export function buildExcludedMessage(input: {
  nome: string
  whatsapp: string
  placa?: string | null
  marca?: string | null
  modelo?: string | null
  ano?: string | number | null
  fipe?: number | null
}): string {
  const firstName = input.nome.split(' ')[0]
  const fipeFormatted =
    input.fipe && input.fipe > 0
      ? input.fipe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : ''
  const veiculoLabel = [input.marca, input.modelo, input.ano].filter(Boolean).join(' ').trim()

  const lines: string[] = [
    `Oi *${firstName}*! Tudo bem? 😊`,
    ``,
    `Vi que você fez uma simulação no nosso site, mas o seu veículo precisa de uma *cotação especial*`,
    ``,
    `• Nome: *${input.nome}*`,
    `• WhatsApp: *${input.whatsapp}*`,
  ]
  if (input.placa) lines.push(`• Placa: *${input.placa}*`)
  if (veiculoLabel) lines.push(`• Veículo: *${veiculoLabel}*`)
  if (fipeFormatted) lines.push(`• FIPE: *R$ ${fipeFormatted}*`)
  lines.push('', 'Confirma os dados por favor')
  return lines.join('\n')
}
