import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { mapWebhookStatus, getNegotiation } from '@/lib/powercrm'
import { updateLeadStatus } from '@/lib/supabase-store'
import { leadEhDeParceiro } from '@/lib/parceiro.regras'
import { fireAllConversionApis, type ConversionLeadData } from '@/lib/conversion-apis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PowerCRMWebhookPayload {
  negotiationCode?: string
  quotationCode?: string
  status?: string
  hash?: string
  [key: string]: unknown
}

const WEBHOOK_SLUG = process.env.POWERCRM_WEBHOOK_SLUG

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params

  if (!WEBHOOK_SLUG || slug !== WEBHOOK_SLUG) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let payload: PowerCRMWebhookPayload
  let rawText = ''
  try {
    rawText = await req.text()
    payload = rawText ? (JSON.parse(rawText) as PowerCRMWebhookPayload) : {}
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' })
  }

  const headersObj: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie') return
    headersObj[k] = v
  })

  const supa = supabaseAdmin()
  const payloadHash = crypto.createHash('sha256').update(rawText || '').digest('hex')

  // Idempotência: dedup por (source, payload_hash). Se mesmo payload chegar 2x, ignora.
  const { data: logRow, error: logErr } = await supa
    .from('webhook_inbound_log')
    .insert({
      source: 'powercrm',
      path: req.nextUrl.pathname,
      headers: headersObj,
      payload: payload as object,
      payload_hash: payloadHash,
      status: 'received',
    })
    .select('id')
    .single()

  if (logErr) {
    if (logErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.error('[powercrm-webhook] log insert falhou:', logErr.message)
    return NextResponse.json({ ok: true, log: 'failed' })
  }

  const logId = logRow!.id as string

  // Processa em background — responde rápido pra Evolution não reentregar
  process.nextTick(() => {
    void processWebhook(logId, payload).catch((err) => {
      console.error('[powercrm-webhook] async processing falhou:', err)
      void supa
        .from('webhook_inbound_log')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
        .eq('id', logId)
    })
  })

  return NextResponse.json({ ok: true })
}

async function processWebhook(logId: string, payload: PowerCRMWebhookPayload): Promise<void> {
  const supa = supabaseAdmin()
  const { negotiationCode, quotationCode, status, hash } = payload

  // 1) Resolver lead — tenta hash (trk), depois quotationCode, depois negotiationCode
  let leadId: string | null = null
  if (hash) {
    const { data } = await supa.from('leads').select('id').eq('trk', hash).maybeSingle()
    if (data) leadId = data.id as string
  }
  if (!leadId && quotationCode) {
    const { data } = await supa
      .from('leads')
      .select('id')
      .eq('quotation_code', quotationCode)
      .maybeSingle()
    if (data) leadId = data.id as string
  }
  if (!leadId && negotiationCode) {
    const { data } = await supa
      .from('leads')
      .select('id')
      .eq('negotiation_code', negotiationCode)
      .maybeSingle()
    if (data) leadId = data.id as string
  }

  const mappedStatus = status ? mapWebhookStatus(status) : null

  if (!leadId) {
    await supa
      .from('webhook_inbound_log')
      .update({
        status: 'ignored',
        processed_at: new Date().toISOString(),
        error: 'lead_not_found',
      })
      .eq('id', logId)
    return
  }

  // 2) Atualizar campos básicos no lead (códigos do PowerCRM)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (negotiationCode) updates.negotiation_code = negotiationCode
  if (quotationCode) updates.quotation_code = quotationCode
  if (Object.keys(updates).length > 1) {
    await supa.from('leads').update(updates).eq('id', leadId)
  }

  // 3) Atualizar status (etapa_funil) + history
  let conversionValueCents: number | null = null
  if (mappedStatus) {
    const liberadoCadastro = mappedStatus === 'RELEASED_FOR_REGISTRATION'

    // Pra venda concretizada, busca valor real via getNegotiation
    if (mappedStatus === 'COMPLETED' && negotiationCode) {
      const neg = await getNegotiation(negotiationCode, leadId)
      if (neg.ok && neg.raw && typeof neg.raw === 'object') {
        const rawObj = neg.raw as Record<string, unknown>
        const val = pickNumber(
          rawObj.totalValue,
          rawObj.value,
          rawObj.totalAmount,
          rawObj.protectedValue,
        )
        if (typeof val === 'number') conversionValueCents = Math.round(val * 100)
      }
    }

    await updateLeadStatus({
      lead_id: leadId,
      to_status: mappedStatus,
      source: 'powercrm_webhook',
      raw_payload: payload,
      liberado_cadastro: liberadoCadastro,
      conversion_value_cents: conversionValueCents,
    })
  }

  // 4) Disparar Conversion APIs nos pontos certos:
  //    - RELEASED_FOR_REGISTRATION → evento "Lead" (lead quente — Google/Meta otimizam)
  //    - COMPLETED                 → evento "Purchase" (venda fechada)
  if (mappedStatus === 'RELEASED_FOR_REGISTRATION' || mappedStatus === 'COMPLETED') {
    await dispatchConversions(leadId, mappedStatus, conversionValueCents)
  }

  await supa
    .from('webhook_inbound_log')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      lead_id: leadId,
    })
    .eq('id', logId)
}

async function dispatchConversions(
  leadId: string,
  mappedStatus: 'RELEASED_FOR_REGISTRATION' | 'COMPLETED',
  conversionValueCents: number | null,
) {
  const supa = supabaseAdmin()

  const { data: lead } = await supa
    .from('leads')
    .select(
      'id, dominio, origem, nome, email, telefone, whatsapp, cpf, cidade, estado, ip_address, user_agent, gclid, gbraid, wbraid, fbclid, fbp, fbc, ga_client_id, external_id, event_id, valor_fipe_consultado, cotacao_valor, conversion_value_cents, meta_capi_sent, google_ads_sent, ga4_mp_sent',
    )
    .eq('id', leadId)
    .single()

  if (!lead) return

  // Lead de parceiro (21go.app): as contas de anuncio sao da casa, nao dele.
  if (leadEhDeParceiro(lead as { dominio?: string | null; origem?: string | null })) {
    console.log(`[powercrm-webhook] lead ${leadId} e de parceiro: conversao da casa nao disparada`)
    return
  }

  // Idempotência: se todos já foram enviados, não reenvia
  const alreadyAll = lead.meta_capi_sent && lead.google_ads_sent && lead.ga4_mp_sent
  if (alreadyAll) return

  const eventName = mappedStatus === 'COMPLETED' ? 'Purchase' : 'Lead'
  const valueCents = conversionValueCents ?? (lead.conversion_value_cents as number | null)
  const valueBrl = typeof valueCents === 'number' ? valueCents / 100 : null

  const phone = ((lead.telefone as string) || (lead.whatsapp as string) || '').replace(/\D/g, '')
  const phoneE164 = phone ? (phone.startsWith('55') ? phone : `55${phone}`) : null

  const fullName = ((lead.nome as string) || '').trim()
  const [first_name, ...rest] = fullName.split(/\s+/)
  const last_name = rest.join(' ') || null

  const eventId = (lead.event_id as string | null) ?? `lead-${leadId}-${mappedStatus}`

  const conversionData: ConversionLeadData = {
    lead_id: leadId,
    event_name: eventName,
    event_id: eventId,
    value_brl: valueBrl,
    currency: 'BRL',
    email: (lead.email as string | null) ?? null,
    phone_e164: phoneE164,
    first_name: first_name || null,
    last_name,
    cpf: (lead.cpf as string | null) ?? null,
    cidade: (lead.cidade as string | null) ?? null,
    estado: (lead.estado as string | null) ?? null,
    ip: (lead.ip_address as string | null) ?? null,
    user_agent: (lead.user_agent as string | null) ?? null,
    gclid: (lead.gclid as string | null) ?? null,
    gbraid: (lead.gbraid as string | null) ?? null,
    wbraid: (lead.wbraid as string | null) ?? null,
    fbclid: (lead.fbclid as string | null) ?? null,
    fbp: (lead.fbp as string | null) ?? null,
    fbc: (lead.fbc as string | null) ?? null,
    ga_client_id: (lead.ga_client_id as string | null) ?? null,
    external_id: (lead.external_id as string | null) ?? null,
  }

  const results = await fireAllConversionApis(conversionData)

  // Marcar timestamps de envio (sucesso OU skipped por env missing — evita reenvio em cada webhook)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  if (results.google_ads.ok || results.google_ads.skipped) {
    patch.google_ads_sent = true
    patch.google_ads_sent_at = now
  }
  if (results.meta_capi.ok || results.meta_capi.skipped) {
    patch.meta_capi_sent = true
    patch.meta_capi_sent_at = now
  }
  if (results.ga4_mp.ok || results.ga4_mp.skipped) {
    patch.ga4_mp_sent = true
    patch.ga4_mp_sent_at = now
  }
  if (Object.keys(patch).length > 0) {
    await supa.from('leads').update(patch).eq('id', leadId)
  }

  console.log('[powercrm-webhook] conversions:', {
    leadId,
    mappedStatus,
    google_ads: results.google_ads.ok ? 'ok' : results.google_ads.skipped ? 'skipped' : 'failed',
    meta_capi: results.meta_capi.ok ? 'ok' : results.meta_capi.skipped ? 'skipped' : 'failed',
    ga4_mp: results.ga4_mp.ok ? 'ok' : results.ga4_mp.skipped ? 'skipped' : 'failed',
  })
}

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

export async function GET() {
  return new NextResponse('Not Found', { status: 404 })
}
