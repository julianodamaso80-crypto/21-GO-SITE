/**
 * Envio de WhatsApp via Evolution API.
 *
 * IMPORTANTE: usa curl via child_process. Tentei fetch nativo, fetch global
 * com cache:no-store, undici Agent dedicado — TODOS retornavam 500
 * "Connection Closed" da Evolution. Mas curl direto do mesmo container
 * funciona perfeito. Causa raiz desconhecida (provavelmente algo do
 * runtime Next.js/Undici interno que conflita com Evolution Baileys),
 * mas curl é solução pragmática e robusta. Validado 2026-05-08.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'

const execFileP = promisify(execFile)

interface CurlResult {
  status: number
  body: string
}

async function curlPost(url: string, headers: Record<string, string>, body: string): Promise<CurlResult> {
  // Escreve body em arquivo temp pra evitar problema com escape de aspas
  const tmpFile = join(tmpdir(), `evo-${crypto.randomBytes(6).toString('hex')}.json`)
  await writeFile(tmpFile, body, 'utf-8')
  const args: string[] = ['-s', '-X', 'POST', '--max-time', '30', '-w', '\n__HTTP__:%{http_code}']
  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`)
  }
  args.push('--data-binary', `@${tmpFile}`, url)
  try {
    const { stdout } = await execFileP('curl', args, { maxBuffer: 10 * 1024 * 1024 })
    const m = stdout.match(/\n__HTTP__:(\d+)$/)
    const status = m ? Number(m[1]) : 0
    const responseBody = m ? stdout.slice(0, m.index) : stdout
    return { status, body: responseBody }
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://automacoes-evolution-api.klo3fa.easypanel.host'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '21gosite'
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
  const { status, body: bodyText } = await curlPost(
    url,
    { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    JSON.stringify({ number: phone, text }),
  )
  console.log('[WhatsApp] sendText resp:', status, bodyText.slice(0, 300))
  if (status < 200 || status >= 300) {
    throw new Error(`sendText falhou ${status}: ${bodyText.slice(0, 200)}`)
  }
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
  const { status, body: bodyText } = await curlPost(
    url,
    { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    JSON.stringify({
      number: phone,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media,
      caption,
      fileName: filename,
    }),
  )
  console.log('[WhatsApp] sendPdfMedia resp:', status, bodyText.slice(0, 300))
  if (status < 200 || status >= 300) {
    throw new Error(`sendPdfMedia falhou ${status}: ${bodyText.slice(0, 200)}`)
  }
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
