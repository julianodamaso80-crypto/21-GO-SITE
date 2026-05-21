import { NextResponse } from 'next/server'
import { sendMetaCapi, sendGa4Mp } from '@/lib/conversion-apis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = [
  // Comerciais — vão pra Meta CAPI E GA4 MP
  'page_view',
  'whatsapp_click',
  'cotacao_inicio',
  'cotacao_completa',
  'pedido_orcamento',
  // Blog/SEO — vão SÓ pra GA4 MP. Meta é pulado intencionalmente:
  // engajamento de blog não é sinal de conversão pra otimização de ads
  // e enviar isso pra Meta poluiria audiências e o algoritmo. WhatsApp
  // clicado dentro do blog dispara também `whatsapp_click` (Contact) em
  // paralelo pelo client → Meta segue recebendo a conversão correta.
  'blog_article_view',
  'blog_scroll_depth',
  'blog_cta_click',
  'blog_internal_link_click',
] as const
type AllowedEvent = (typeof ALLOWED_EVENTS)[number]

// Mapeamento evento interno → nome esperado pelo Meta CAPI.
// `null` = pula Meta CAPI (eventos de blog). Comerciais usam nomes Meta
// canônicos pra dedup correta com o Pixel client (event_id em comum).
// Mapeamento Meta CAPI:
// - cotacao_inicio → Lead (dispara cedo no Ver Simulação — captura mesmo
//   se backend FIPE/PowerCRM falhar; algoritmo otimiza pra clique do form)
// - cotacao_completa → CompleteRegistration (sinal de qualidade — viu o
//   preço; nao infla Lead pra manter ROAS preciso)
const META_EVENT_NAME: Record<AllowedEvent, string | null> = {
  page_view: 'PageView',
  whatsapp_click: 'Contact',
  cotacao_inicio: 'Lead',
  cotacao_completa: 'CompleteRegistration',
  pedido_orcamento: 'Purchase',
  blog_article_view: null,
  blog_scroll_depth: null,
  blog_cta_click: null,
  blog_internal_link_click: null,
}

// Mapeamento pra GA4 MP. Comerciais usam nomes oficiais GA4
// (page_view/generate_lead/begin_checkout). Blog usa o próprio nome pra
// aparecer cru no DebugView e nos relatórios de engajamento.
const GA4_EVENT_NAME: Record<AllowedEvent, string> = {
  page_view: 'page_view',
  whatsapp_click: 'whatsapp_click',
  cotacao_inicio: 'begin_checkout',
  cotacao_completa: 'generate_lead',
  pedido_orcamento: 'purchase',
  blog_article_view: 'blog_article_view',
  blog_scroll_depth: 'blog_scroll_depth',
  blog_cta_click: 'blog_cta_click',
  blog_internal_link_click: 'blog_internal_link_click',
}

// SHA-256 hex tem exatamente 64 caracteres hexadecimais. Qualquer outra coisa
// é considerada PII em texto puro ou inválida — rejeitada silenciosamente.
const SHA256_HEX = /^[a-f0-9]{64}$/i

function isValidHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value)
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (!rawName) continue
    out[rawName] = decodeURIComponent(rest.join('=') || '')
  }
  return out
}

function extractGa4ClientId(gaCookie: string | undefined): string | undefined {
  if (!gaCookie) return undefined
  const parts = gaCookie.split('.')
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined
}

function clientIpFromHeaders(h: Headers): string | null {
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  )
}

interface TrackPayload {
  event_name?: string
  event_id?: string
  event_time?: number
  value?: number
  currency?: string
  email_hash?: string
  phone_hash?: string
  // metadados livres (não vão pra Meta/GA4 — só pro log estruturado)
  click_origin?: string
  page_path?: string
  page_url?: string
  button_text?: string
  plan_name?: string
  plan_value?: number
  form_name?: string
  vehicle_marca?: string
  vehicle_modelo?: string
  vehicle_ano?: string
  content_category?: string
}

export async function POST(req: Request) {
  let body: TrackPayload
  try {
    body = (await req.json()) as TrackPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const eventName = body.event_name
  if (!eventName || !ALLOWED_EVENTS.includes(eventName as AllowedEvent)) {
    return NextResponse.json(
      { ok: false, error: 'event_not_allowed', allowed: ALLOWED_EVENTS },
      { status: 400 },
    )
  }
  const event = eventName as AllowedEvent

  if (!body.event_id || typeof body.event_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'missing_event_id' }, { status: 400 })
  }

  const cookies = parseCookies(req.headers.get('cookie'))
  const fbp = cookies['_fbp'] || undefined
  const fbc = cookies['_fbc'] || cookies['_21go_fbc'] || undefined
  const gclid = cookies['_21go_gclid'] || undefined
  const fbclid = cookies['_21go_fbclid'] || undefined
  const gaClientId = extractGa4ClientId(cookies['_ga'])

  const userAgent = req.headers.get('user-agent') || undefined
  const ip = clientIpFromHeaders(req.headers) || undefined

  // Aceita só hash válido (64 hex). Qualquer outra coisa é descartada —
  // protege contra cliente mandar PII em texto puro acidentalmente.
  const emailHash = isValidHash(body.email_hash) ? body.email_hash.toLowerCase() : null
  const phoneHash = isValidHash(body.phone_hash) ? body.phone_hash.toLowerCase() : null

  const eventTime = body.event_time ?? Math.floor(Date.now() / 1000)
  const value = typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : undefined

  // lead_id sintético — eventos do site público não têm lead persistido ainda.
  // Mantém auditoria em conversion_events_log sem colidir com leads reais.
  const syntheticLeadId = `anon:${body.event_id}`

  const baseData = {
    lead_id: syntheticLeadId,
    event_id: body.event_id,
    event_time: eventTime,
    value_brl: value ?? null,
    currency: body.currency || 'BRL',
    email_hash: emailHash,
    phone_hash: phoneHash,
    gclid: gclid ?? null,
    fbclid: fbclid ?? null,
    fbp: fbp ?? null,
    fbc: fbc ?? null,
    ga_client_id: gaClientId ?? null,
    ip: ip ?? null,
    user_agent: userAgent ?? null,
  }

  const metaEventName = META_EVENT_NAME[event]

  const [metaResult, ga4Result] = await Promise.all([
    metaEventName === null
      ? Promise.resolve({ ok: false, skipped: true, error: 'blog_event_meta_skipped_by_policy' })
      : sendMetaCapi({ ...baseData, event_name: metaEventName }).catch((err) => ({
          ok: false,
          skipped: false,
          error: err instanceof Error ? err.message : 'meta_throw',
        })),
    sendGa4Mp({ ...baseData, event_name: GA4_EVENT_NAME[event] }).catch((err) => ({
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : 'ga4_throw',
    })),
  ])

  // Log sem PII: nome do evento, event_id, hashes (não reversíveis), status.
  console.log('[track]', {
    event,
    event_id: body.event_id,
    has_email_hash: Boolean(emailHash),
    has_phone_hash: Boolean(phoneHash),
    has_fbp: Boolean(fbp),
    has_fbc: Boolean(fbc),
    has_gclid: Boolean(gclid),
    meta: { ok: metaResult.ok, skipped: metaResult.skipped },
    ga4: { ok: ga4Result.ok, skipped: ga4Result.skipped },
  })

  return NextResponse.json({
    ok: true,
    event,
    event_id: body.event_id,
    meta: { ok: metaResult.ok, skipped: metaResult.skipped },
    ga4: { ok: ga4Result.ok, skipped: ga4Result.skipped },
  })
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405 })
}
