/**
 * Envio de WhatsApp via Evolution API.
 * Instância em produção: 4240 @ evolution.sinistro21go.site
 * (número 5521965774240). Atualizado em 2026-06-02.
 *
 * Instância anterior 4240 (5521965774240) foi BANIDA pelo WhatsApp —
 * trocada por 4240, que estava de backup no painel.
 */

import crypto from 'crypto'

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '4240'
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

/* ───────────────── Ritmo humano (anti-ban) ───────────────── */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Inteiro aleatório inclusivo em [min, max]. */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/**
 * Envia presença ("digitando…") antes de uma mensagem, pra simular
 * comportamento humano. Best-effort: se a Evolution não suportar ou falhar,
 * apenas loga e segue — nunca quebra o envio.
 */
export async function sendPresence(
  phone: string,
  presence: 'composing' | 'recording' | 'available' | 'paused' = 'composing',
  delayMs = 2500,
): Promise<void> {
  if (!EVOLUTION_API_KEY) return
  try {
    const url = `${EVOLUTION_API_URL}/chat/sendPresence/${EVOLUTION_INSTANCE}`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, delay: delayMs, presence }),
    })
  } catch (err) {
    console.warn('[WhatsApp] sendPresence falhou (ignorado):', err instanceof Error ? err.message : err)
  }
}

/* ───────────────── Variação de conteúdo (Spintax anti-ban) ───────────────── */

/**
 * Escolhe uma variante de forma determinística pelo `seed` (ex: leadId).
 * Mesmo lead → sempre a mesma combinação (idempotente em retries);
 * leads diferentes → combinações diferentes, sem repetir o mesmo texto.
 */
function pickVariant<T>(arr: T[], seed: string, salt: string): T {
  const h = crypto.createHash('md5').update(`${seed}|${salt}`).digest()
  return arr[h[0] % arr.length]
}

interface FollowUpInput {
  nome: string
  marca?: string | null
  modelo?: string | null
  placa?: string | null
  /** Semente pra variação determinística (use o leadId). */
  seed?: string | null
}

function resolveVeiculo(input: { marca?: string | null; modelo?: string | null }): {
  veiculoText: string
  prep: 'da' | 'do'
} {
  const isMoto =
    (input.marca || '').toLowerCase().includes('moto') ||
    (input.modelo || '').toLowerCase().includes('moto')
  const veiculoText =
    input.modelo && input.modelo !== '(manual)' && input.modelo !== '(informado manualmente)'
      ? `${input.marca || ''} ${input.modelo}`.trim()
      : isMoto
        ? 'sua moto'
        : 'seu carro'
  return { veiculoText, prep: isMoto ? 'da' : 'do' }
}

const FU_SAUDACOES: ((n: string) => string)[] = [
  (n) => `Oi *${n}*! Tudo bem? 😊`,
  (n) => `Olá, *${n}*! Como você está?`,
  (n) => `Oi *${n}*, tudo certo por aí? 🙌`,
  (n) => `E aí *${n}*, beleza?`,
  (n) => `Oiê *${n}*! Espero que esteja tudo bem 🙂`,
]

const FU_APRESENTACOES: string[] = [
  `Aqui é a Letycia, da 21Go.`,
  `Sou a Letycia e vou te acompanhar por aqui 🙂`,
  `Me chamo Letycia, do time da 21Go.`,
  `Quem fala é a Letycia, da 21Go.`,
]

const FU_CORPOS: ((v: string, p: string) => string)[] = [
  (v, p) => `Terminei de montar a sua *simulação* ${p} *${v}* e vou te enviar o PDF completo agora 👇`,
  (v, p) => `Já preparei o *orçamento* ${p} *${v}* — te mando o arquivo aqui embaixo 📄`,
  (v, p) => `Fiz a *cotação completa* ${p} *${v}* que você simulou. Segue o PDF logo abaixo 👇`,
  (v, p) => `Deixei pronta a *proposta* ${p} *${v}*, te envio em PDF agora mesmo.`,
]

const FU_FECHOS: string[] = [
  `Qualquer dúvida é só me chamar por aqui 😉`,
  `Me conta o que achou, tô à disposição!`,
  `Se quiser, te explico cada cobertura. Pode perguntar 🙂`,
  `Ficou alguma dúvida? Respondo rapidinho.`,
]

const FU_CAPTIONS: string[] = [
  `Segue a sua simulação completa 👆`,
  `Aqui está o PDF com todos os detalhes 📄`,
  `Prontinho! Tá tudo aí no arquivo 😉`,
  `Esse é o resumo completo da sua proteção 👆`,
]

/**
 * Constrói a mensagem de follow-up variada (Spintax). É a mensagem de texto
 * que vai ANTES do PDF. Cada lead recebe uma combinação diferente pra não
 * deixar "impressão digital" de spam no WhatsApp.
 */
export function buildFollowUpMessage(input: FollowUpInput): string {
  const firstName = input.nome.split(' ')[0]
  const { veiculoText, prep } = resolveVeiculo(input)
  const seed = input.seed || `${input.nome}|${input.modelo || ''}`

  const saudacao = pickVariant(FU_SAUDACOES, seed, 'saud')(firstName)
  const apresentacao = pickVariant(FU_APRESENTACOES, seed, 'apres')
  const corpo = pickVariant(FU_CORPOS, seed, 'corpo')(veiculoText, prep)
  const fecho = pickVariant(FU_FECHOS, seed, 'fecho')

  const lines = [saudacao, ``, apresentacao, ``, corpo]
  if (input.placa) lines.push(``, `Placa *${input.placa}*.`)
  lines.push(``, fecho)
  return lines.join('\n')
}

/**
 * Caption curto e variado pro PDF (que vai DEPOIS do texto). Curto de
 * propósito: a mensagem de valor já foi no texto anterior.
 */
export function buildPdfCaption(input: FollowUpInput): string {
  const seed = input.seed || `${input.nome}|${input.modelo || ''}`
  return pickVariant(FU_CAPTIONS, seed, 'cap')
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
const EXC_CORPOS: ((v: string, p: string) => string)[] = [
  (v, p) => `Recebi aqui a sua simulação ${p} *${v}*.`,
  (v, p) => `Chegou a sua simulação ${p} *${v}* aqui pra mim.`,
  (v, p) => `Vi que você fez uma simulação ${p} *${v}* no nosso site.`,
]

const EXC_STATUS: string[] = [
  `No momento a 21Go ainda não está fazendo proteção pra esse tipo de veículo, mas já *guardei o seu contato* com todo cuidado 🙌`,
  `Esse tipo de veículo a gente ainda não está aceitando por enquanto — mas já deixei o seu *contato salvo* aqui 🙌`,
  `Ainda não estamos cobrindo esse tipo de veículo neste momento, porém o seu *contato já ficou guardado* com a gente 🙌`,
]

const EXC_FECHOS: string[] = [
  `Assim que voltarmos a aceitar, eu te aviso por aqui. Obrigada pelo interesse! 💛`,
  `Quando liberar pra esse veículo, eu entro em contato com você. Valeu por simular com a gente! 💛`,
  `Assim que abrir pra esse tipo de veículo, te chamo por aqui. Obrigada! 💛`,
]

/**
 * Mensagem para veículos da lista de exclusão. NÃO pede confirmação nem chama
 * o cliente pra responder — só avisa que o contato ficou salvo e que a 21Go
 * entra em contato quando voltar a aceitar o veículo. Variada por leadId.
 */
export function buildExcludedMessage(input: {
  nome: string
  whatsapp?: string
  placa?: string | null
  marca?: string | null
  modelo?: string | null
  ano?: string | number | null
  fipe?: number | null
  seed?: string | null
}): string {
  const firstName = input.nome.split(' ')[0]
  const { veiculoText, prep } = resolveVeiculo(input)
  const seed = input.seed || `${input.nome}|${input.modelo || ''}`

  const saudacao = pickVariant(FU_SAUDACOES, seed, 'exc-saud')(firstName)
  const corpo = pickVariant(EXC_CORPOS, seed, 'exc-corpo')(veiculoText, prep)
  const status = pickVariant(EXC_STATUS, seed, 'exc-status')
  const fecho = pickVariant(EXC_FECHOS, seed, 'exc-fecho')

  return [saudacao, ``, corpo, ``, status, ``, fecho].join('\n')
}
