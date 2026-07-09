import { NextRequest, NextResponse } from 'next/server'
import {
  upsertConversation,
  upsertMessage,
  updateMessageStatus,
  jidToPhone,
  type Direction,
  type MessageStatus,
} from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook Evolution API.
 *
 * Recebe eventos de TODA conversa (in + out) na instância 21gosite e persiste
 * em conversations + messages no Supabase. É a fonte primária pra clientes que
 * iniciam conversa direto pelo WhatsApp (sem passar pelo formulário do site).
 *
 * Eventos relevantes:
 *   - messages.upsert  → nova mensagem (envio nosso ou recebida do cliente)
 *   - messages.update  → mudança de status (DELIVERED, READ, etc)
 *   - send.message     → confirmação de envio (alguns clientes Evolution enviam)
 *
 * Idempotência: a UNIQUE (whatsapp_message_id, evolution_instance) bloqueia
 * gravação duplicada caso o webhook seja entregue 2x.
 *
 * Segurança: a Evolution permite configurar um header "apikey" no webhook.
 * Validamos via env EVOLUTION_WEBHOOK_TOKEN (se configurada).
 */

const EVOLUTION_WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN || ''

interface EvolutionEvent {
  event?: string
  instance?: string
  data?: EvolutionEventData
  date_time?: string
  destination?: string
  sender?: string
  apikey?: string
}

interface EvolutionEventData {
  key?: {
    id?: string
    remoteJid?: string
    fromMe?: boolean
    participant?: string
  }
  pushName?: string
  status?: string
  message?: Record<string, unknown>
  messageType?: string
  messageTimestamp?: number
  // updates
  keyId?: string
  remoteJid?: string
  // outros campos podem aparecer
  [key: string]: unknown
}

export async function POST(req: NextRequest) {
  // Auth opcional — se a env estiver setada, exigimos que bata
  if (EVOLUTION_WEBHOOK_TOKEN) {
    const provided = req.headers.get('apikey') || req.headers.get('x-api-key') || ''
    if (provided !== EVOLUTION_WEBHOOK_TOKEN) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  let payload: EvolutionEvent
  try {
    payload = (await req.json()) as EvolutionEvent
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const event = (payload.event || '').toLowerCase()
  const instance = payload.instance || process.env.EVOLUTION_INSTANCE || '21 go 0741'
  const data = payload.data || {}

  try {
    if (event === 'messages.upsert' || event === 'messages-upsert') {
      await handleMessageUpsert(instance, data)
    } else if (event === 'messages.update' || event === 'messages-update') {
      await handleMessageUpdate(instance, data)
    } else if (event === 'send.message' || event === 'send-message') {
      await handleMessageUpsert(instance, data)
    } else {
      // Outros eventos (connection.update, contacts.upsert, chats.upsert, etc) — só log
      console.log('[evolution-webhook] evento ignorado:', event)
    }
  } catch (err) {
    console.error('[evolution-webhook] erro:', err instanceof Error ? err.message : err)
    // Mesmo com erro, retornamos 200 pra Evolution não ficar reentregando
    // (idempotência cobre eventual duplicata)
  }

  return NextResponse.json({ ok: true })
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'evolution-webhook', method: 'POST esperado' })
}

/* ───────────────── Handlers ───────────────── */

async function handleMessageUpsert(instance: string, data: EvolutionEventData) {
  const key = data.key
  if (!key?.id || !key?.remoteJid) {
    console.warn('[evolution-webhook] upsert sem key.id/remoteJid')
    return
  }

  const jid = key.remoteJid
  const fromMe = !!key.fromMe
  const direction: Direction = fromMe ? 'outbound' : 'inbound'
  const phone = jidToPhone(jid)
  if (!phone) {
    console.warn('[evolution-webhook] jid sem phone:', jid)
    return
  }

  const messageType = (data.messageType as string) || detectMessageType(data.message)
  const { content, caption, media_url, media_filename, media_mime_type } =
    extractContent(data.message)

  const conv = await upsertConversation({
    jid,
    evolution_instance: instance,
    contact_phone: phone,
    pushname: data.pushName ?? null,
    contact_name: data.pushName ?? null,
  })

  const status = mapStatus(data.status, direction)
  const sentAt = data.messageTimestamp
    ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString()

  await upsertMessage({
    conversation_id: conv.id,
    whatsapp_message_id: key.id,
    evolution_instance: instance,
    jid,
    direction,
    status,
    message_type: messageType,
    content,
    caption,
    media_url,
    media_filename,
    media_mime_type,
    pushname: data.pushName ?? null,
    raw_payload: data,
    sent_at: sentAt,
  })
}

async function handleMessageUpdate(instance: string, data: EvolutionEventData) {
  // Estrutura típica: { keyId, status, remoteJid }
  const wid = (data.keyId as string) || (data.key?.id as string)
  if (!wid) {
    console.warn('[evolution-webhook] update sem keyId')
    return
  }
  const status = mapStatus(data.status, 'outbound') // updates são quase sempre de outbound
  const now = new Date().toISOString()
  await updateMessageStatus({
    whatsapp_message_id: wid,
    evolution_instance: instance,
    status,
    delivered_at: status === 'DELIVERED' ? now : undefined,
    read_at: status === 'READ' ? now : undefined,
    raw_payload: data,
  })
}

/* ───────────────── Helpers ───────────────── */

function mapStatus(raw: string | undefined, direction: Direction): MessageStatus {
  const s = (raw || '').toUpperCase()
  if (s === 'PENDING') return 'PENDING'
  if (s === 'SERVER_ACK' || s === 'SENT') return direction === 'inbound' ? 'RECEIVED' : 'SENT'
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED') return 'DELIVERED'
  if (s === 'READ' || s === 'READ_SELF') return 'READ'
  if (s === 'FAILED' || s === 'ERROR') return 'FAILED'
  return direction === 'inbound' ? 'RECEIVED' : 'PENDING'
}

function detectMessageType(message: Record<string, unknown> | undefined): string {
  if (!message) return 'text'
  if ('conversation' in message || 'extendedTextMessage' in message) return 'text'
  if ('imageMessage' in message) return 'image'
  if ('audioMessage' in message) return 'audio'
  if ('videoMessage' in message) return 'video'
  if ('documentMessage' in message) return 'document'
  if ('stickerMessage' in message) return 'sticker'
  if ('locationMessage' in message) return 'location'
  if ('contactMessage' in message) return 'contact'
  if ('reactionMessage' in message) return 'reaction'
  return 'text'
}

interface ExtractedContent {
  content: string | null
  caption: string | null
  media_url: string | null
  media_filename: string | null
  media_mime_type: string | null
}

function extractContent(message: Record<string, unknown> | undefined): ExtractedContent {
  if (!message)
    return { content: null, caption: null, media_url: null, media_filename: null, media_mime_type: null }

  const get = (obj: unknown, key: string): unknown => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key]
    return undefined
  }

  if (typeof message.conversation === 'string') {
    return { content: message.conversation, caption: null, media_url: null, media_filename: null, media_mime_type: null }
  }
  if (message.extendedTextMessage) {
    const text = get(message.extendedTextMessage, 'text') as string | undefined
    return { content: text || null, caption: null, media_url: null, media_filename: null, media_mime_type: null }
  }
  if (message.imageMessage) {
    const m = message.imageMessage
    return {
      content: (get(m, 'caption') as string) || null,
      caption: (get(m, 'caption') as string) || null,
      media_url: (get(m, 'url') as string) || null,
      media_filename: null,
      media_mime_type: (get(m, 'mimetype') as string) || 'image/jpeg',
    }
  }
  if (message.documentMessage) {
    const m = message.documentMessage
    return {
      content: (get(m, 'caption') as string) || (get(m, 'fileName') as string) || null,
      caption: (get(m, 'caption') as string) || null,
      media_url: (get(m, 'url') as string) || null,
      media_filename: (get(m, 'fileName') as string) || null,
      media_mime_type: (get(m, 'mimetype') as string) || 'application/pdf',
    }
  }
  if (message.audioMessage) {
    const m = message.audioMessage
    return {
      content: '[áudio]',
      caption: null,
      media_url: (get(m, 'url') as string) || null,
      media_filename: null,
      media_mime_type: (get(m, 'mimetype') as string) || 'audio/ogg',
    }
  }
  if (message.videoMessage) {
    const m = message.videoMessage
    return {
      content: (get(m, 'caption') as string) || '[vídeo]',
      caption: (get(m, 'caption') as string) || null,
      media_url: (get(m, 'url') as string) || null,
      media_filename: null,
      media_mime_type: (get(m, 'mimetype') as string) || 'video/mp4',
    }
  }
  if (message.stickerMessage) {
    return { content: '[figurinha]', caption: null, media_url: null, media_filename: null, media_mime_type: 'image/webp' }
  }
  if (message.locationMessage) {
    return { content: '[localização]', caption: null, media_url: null, media_filename: null, media_mime_type: null }
  }
  if (message.reactionMessage) {
    const text = get(message.reactionMessage, 'text') as string | undefined
    return { content: text || '[reação]', caption: null, media_url: null, media_filename: null, media_mime_type: null }
  }
  return { content: null, caption: null, media_url: null, media_filename: null, media_mime_type: null }
}
