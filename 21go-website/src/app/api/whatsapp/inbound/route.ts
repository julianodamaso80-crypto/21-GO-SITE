// @ts-nocheck — modulo Leticya v2 em shadow mode (nao dispara WhatsApp). Validacao TS desativada ate refactor da tipagem do AI SDK.
import { NextRequest, NextResponse } from 'next/server'
import { leticyaDb } from '@/lib/leticya/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Webhook Evolution API — recebe eventos do WhatsApp da 21Go.
 *
 * MODO ATUAL: shadow / receive-only.
 *   - Persiste tudo em chat.messages
 *   - Loga raw payload em ai.inbound_log
 *   - NÃO chama a IA
 *   - NÃO envia mensagem pro cliente
 *
 * Eventos esperados (config feita pelo dono na Evolution):
 *   - MESSAGES_UPSERT     (mensagem nova)
 *   - MESSAGES_UPDATE     (status: entregue, lido)
 *   - CONNECTION_UPDATE   (WhatsApp conectou/desconectou)
 *   - PRESENCE_UPDATE     (cliente digitando)
 */

const COMPANY_ID = 'company-21go'
const EXPECTED_INSTANCE = process.env.EVOLUTION_INSTANCE || 'site4240'
const WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN || ''

interface EvolutionPayload {
  event?: string
  instance?: string
  data?: {
    key?: {
      id?: string
      remoteJid?: string
      fromMe?: boolean
    }
    pushName?: string
    messageType?: string
    message?: Record<string, unknown>
    messageTimestamp?: number | { low: number; high: number }
    status?: string
    presence?: string
  }
  date_time?: string
  server_url?: string
  apikey?: string
}

function extractTextFromMessage(message: Record<string, unknown> | undefined): string {
  if (!message) return ''
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text
  const img = message.imageMessage as { caption?: string } | undefined
  if (img?.caption) return img.caption
  const doc = message.documentMessage as { caption?: string; fileName?: string } | undefined
  if (doc?.caption) return doc.caption
  return ''
}

function inferMessageType(message: Record<string, unknown> | undefined, evMessageType?: string): string {
  if (!message) return (evMessageType || 'UNKNOWN').toUpperCase()
  if (message.conversation || message.extendedTextMessage) return 'TEXT'
  if (message.imageMessage) return 'IMAGE'
  if (message.audioMessage) return 'AUDIO'
  if (message.documentMessage) return 'DOCUMENT'
  if (message.videoMessage) return 'VIDEO'
  if (message.stickerMessage) return 'STICKER'
  if (message.reactionMessage) return 'REACTION'
  if (message.locationMessage) return 'LOCATION'
  if (message.contactMessage) return 'CONTACT'
  return (evMessageType || 'UNKNOWN').toUpperCase()
}

function jidToPhone(jid: string | undefined): string {
  if (!jid) return ''
  return jid.split('@')[0].replace(/[^0-9]/g, '')
}

function normalizeTimestamp(ts: number | { low: number; high: number } | undefined): Date {
  if (!ts) return new Date()
  if (typeof ts === 'number') return new Date(ts * 1000)
  return new Date(ts.low * 1000)
}

export async function POST(req: NextRequest) {
  const t0 = Date.now()

  // Valida token (query param ?token=... ou header x-webhook-token)
  if (WEBHOOK_TOKEN) {
    const url = new URL(req.url)
    const queryToken = url.searchParams.get('token')
    const headerToken = req.headers.get('x-webhook-token')
    const provided = queryToken || headerToken
    if (provided !== WEBHOOK_TOKEN) {
      console.warn('[whatsapp-inbound] token inválido')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  let body: EvolutionPayload
  try {
    body = (await req.json()) as EvolutionPayload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const event = body.event || 'unknown'
  const instance = body.instance || 'unknown'

  // Guard: ignora eventos de instância diferente da configurada
  if (instance !== EXPECTED_INSTANCE) {
    console.warn(`[whatsapp-inbound] ignorando instância "${instance}" (esperado "${EXPECTED_INSTANCE}")`)
    return NextResponse.json({ ok: true, ignored: 'wrong_instance' })
  }

  const db = leticyaDb()

  // Sempre loga raw payload — debug/auditoria
  try {
    await db.schema('ai').from('inbound_log').insert({
      company_id: COMPANY_ID,
      event,
      instance,
      raw_payload: body as unknown as Record<string, unknown>,
    })
  } catch (e) {
    console.error('[whatsapp-inbound] falha ao logar raw:', (e as Error).message)
  }

  // Roteia por tipo de evento
  switch (event) {
    case 'messages.upsert':
    case 'MESSAGES_UPSERT': {
      const data = body.data
      const key = data?.key
      const jid = key?.remoteJid
      const phone = jidToPhone(jid)
      const fromMe = key?.fromMe ?? false
      const direction = fromMe ? 'OUTBOUND' : 'INBOUND'
      const messageText = extractTextFromMessage(data?.message)
      const messageType = inferMessageType(data?.message, data?.messageType)
      const ts = normalizeTimestamp(data?.messageTimestamp)
      const pushName = data?.pushName

      // Identifica/cria contato (lookup por telefone)
      let contactId: string | null = null
      try {
        const { data: existing } = await db
          .schema('core')
          .from('contacts')
          .select('id')
          .eq('telefone', phone)
          .eq('company_id', COMPANY_ID)
          .limit(1)
          .maybeSingle()
        if (existing) {
          contactId = existing.id
        } else if (phone) {
          const { data: created } = await db
            .schema('core')
            .from('contacts')
            .insert({
              company_id: COMPANY_ID,
              nome: pushName || `Contato ${phone}`,
              telefone: phone,
              whatsapp: phone,
              primeiro_contato_origem: 'whatsapp_inbound',
              primeiro_contato_em: ts.toISOString(),
            })
            .select('id')
            .single()
          contactId = created?.id ?? null
        }
      } catch (e) {
        console.error('[whatsapp-inbound] contact upsert falhou:', (e as Error).message)
      }

      // Identifica/cria conversation
      let conversationId: string | null = null
      if (contactId && jid) {
        try {
          const { data: existingConv } = await db
            .schema('chat')
            .from('conversations')
            .select('id')
            .eq('contact_id', contactId)
            .eq('channel', 'WHATSAPP_EVOLUTION')
            .eq('evolution_instance', instance)
            .eq('jid', jid)
            .limit(1)
            .maybeSingle()
          if (existingConv) {
            conversationId = existingConv.id
            await db
              .schema('chat')
              .from('conversations')
              .update({
                last_message_at: ts.toISOString(),
                ...(direction === 'INBOUND' ? { last_inbound_at: ts.toISOString() } : { last_outbound_at: ts.toISOString() }),
              })
              .eq('id', conversationId)
          } else {
            const { data: createdConv } = await db
              .schema('chat')
              .from('conversations')
              .insert({
                company_id: COMPANY_ID,
                contact_id: contactId,
                channel: 'WHATSAPP_EVOLUTION',
                evolution_instance: instance,
                jid,
                status: 'OPEN',
                contact_phone: phone,
                contact_name: pushName || null,
                pushname: pushName || null,
                last_message_at: ts.toISOString(),
                first_inbound_at: direction === 'INBOUND' ? ts.toISOString() : null,
                last_inbound_at: direction === 'INBOUND' ? ts.toISOString() : null,
              })
              .select('id')
              .single()
            conversationId = createdConv?.id ?? null
          }
        } catch (e) {
          console.error('[whatsapp-inbound] conversation upsert falhou:', (e as Error).message)
        }
      }

      // Persiste a mensagem
      if (contactId && conversationId) {
        try {
          await db
            .schema('chat')
            .from('messages')
            .insert({
              company_id: COMPANY_ID,
              conversation_id: conversationId,
              contact_id: contactId,
              direction,
              sender_type: fromMe ? 'HUMAN' : 'CONTACT',
              message_type: messageType,
              content: messageText || null,
              whatsapp_message_id: key?.id,
              evolution_instance: instance,
              jid,
              pushname: pushName || null,
              status: 'RECEIVED',
              raw_payload: data as unknown as Record<string, unknown>,
              created_at: ts.toISOString(),
            })
        } catch (e) {
          console.error('[whatsapp-inbound] message insert falhou:', (e as Error).message)
        }
      }

      console.log(
        `[whatsapp-inbound] ${event} ${direction} ${phone} "${messageText.slice(0, 50)}" (${Date.now() - t0}ms)`,
      )
      // SHADOW MODE: não chama IA, não responde
      return NextResponse.json({
        ok: true,
        shadow_mode: true,
        contact_id: contactId,
        conversation_id: conversationId,
        latency_ms: Date.now() - t0,
      })
    }

    case 'messages.update':
    case 'MESSAGES_UPDATE': {
      // Atualiza status (DELIVERED, READ, etc) — só persiste, não dispara nada
      const data = body.data
      const key = data?.key
      const status = data?.status
      if (key?.id && status) {
        try {
          const patch: Record<string, unknown> = { status }
          if (status === 'DELIVERED' || status === 'DELIVERY_ACK') patch.delivered_at = new Date().toISOString()
          if (status === 'READ') patch.read_at = new Date().toISOString()
          await db
            .schema('chat')
            .from('messages')
            .update(patch)
            .eq('whatsapp_message_id', key.id)
            .eq('evolution_instance', instance)
        } catch (e) {
          console.error('[whatsapp-inbound] status update falhou:', (e as Error).message)
        }
      }
      return NextResponse.json({ ok: true, event })
    }

    case 'connection.update':
    case 'CONNECTION_UPDATE': {
      const state = (body.data as unknown as { state?: string })?.state
      console.warn(`[whatsapp-inbound] CONNECTION ${instance}: ${state}`)
      return NextResponse.json({ ok: true, state })
    }

    case 'presence.update':
    case 'PRESENCE_UPDATE': {
      // Ignora por enquanto (alto volume, baixo valor)
      return NextResponse.json({ ok: true, event })
    }

    default:
      return NextResponse.json({ ok: true, event, ignored: true })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'whatsapp/inbound',
    mode: 'shadow (receive-only)',
    instance_expected: EXPECTED_INSTANCE,
  })
}
