import 'server-only'
import crypto from 'crypto'
import { logConversionEvent } from './supabase-store'

/**
 * Conversion APIs — devolve evento de "lead quente" / "venda fechada" pro
 * Google Ads, Meta (Pixel CAPI) e GA4 (Measurement Protocol).
 *
 * Cada provedor é OPCIONAL: se a env de credencial não estiver setada,
 * a função retorna { ok: false, skipped: true } sem chamar nada.
 *
 * Todas chamadas registram em conversion_events_log no Supabase pra auditoria.
 *
 * Variáveis de ambiente esperadas:
 *
 * Google Ads:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (MCC, sem traços)
 *   GOOGLE_ADS_CUSTOMER_ID        (conta target, sem traços)
 *   GOOGLE_ADS_OAUTH_REFRESH_TOKEN
 *   GOOGLE_ADS_OAUTH_CLIENT_ID
 *   GOOGLE_ADS_OAUTH_CLIENT_SECRET
 *   GOOGLE_ADS_CONVERSION_ACTION_ID
 *
 * Meta CAPI:
 *   META_PIXEL_ID
 *   META_CAPI_ACCESS_TOKEN
 *   META_TEST_EVENT_CODE          (opcional, pra testar)
 *
 * GA4 MP:
 *   GA4_MEASUREMENT_ID            (G-XXXXXXX)
 *   GA4_API_SECRET
 */

export interface ConversionLeadData {
  lead_id: string
  event_name: string                          // 'Lead' | 'Purchase' | 'CompleteRegistration'
  event_id?: string | null                    // pra dedup
  event_time?: number                         // unix seconds; default = agora
  value_brl?: number | null                   // valor em reais
  currency?: string                           // default 'BRL'

  // identidade do usuário
  email?: string | null
  phone_e164?: string | null                  // só dígitos com 55: 5521987654321
  first_name?: string | null
  last_name?: string | null
  cpf?: string | null
  cidade?: string | null
  estado?: string | null
  ip?: string | null
  user_agent?: string | null

  // tracking
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  fbp?: string | null
  fbc?: string | null
  ga_client_id?: string | null
  external_id?: string | null
}

export interface ConversionResult {
  ok: boolean
  skipped: boolean
  status?: number
  body?: unknown
  error?: string
}

/* ─── Helpers ─── */

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s.trim().toLowerCase()).digest('hex')
}

function hashOrNull(v: string | null | undefined): string | null {
  return v && v.trim() ? sha256(v) : null
}

/* ─── Google Ads — Enhanced Conversions for Leads ─── */
/**
 * Doc: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 *      https://developers.google.com/google-ads/api/docs/conversions/upload-identifiers
 *
 * Estratégia: usa "uploadClickConversions" se houver gclid, senão
 * "uploadCallConversions"/"uploadConversionAdjustments" — pra simplificar
 * v1 implementamos só o caso gclid (ClickConversion) que cobre 95% dos leads
 * vindos do Google Ads.
 */
export async function sendGoogleAdsConversion(
  data: ConversionLeadData,
): Promise<ConversionResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  const refreshToken = process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET
  const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID

  if (
    !developerToken ||
    !customerId ||
    !refreshToken ||
    !clientId ||
    !clientSecret ||
    !conversionActionId
  ) {
    return { ok: false, skipped: true, error: 'google_ads_env_missing' }
  }

  if (!data.gclid && !data.gbraid && !data.wbraid) {
    // Sem clickId nenhum, Google Ads não consegue atribuir.
    // Poderia cair em Enhanced Conversions for Leads via email/phone hashado,
    // mas isso requer endpoint diferente — fica pra v2.
    return { ok: false, skipped: true, error: 'no_click_id' }
  }

  try {
    // 1) Trocar refresh_token por access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })
    const tokenJson = (await tokenRes.json().catch(() => null)) as
      | { access_token?: string }
      | null
    const accessToken = tokenJson?.access_token
    if (!accessToken) {
      const result = { ok: false, skipped: false, error: 'oauth_failed' }
      await logConversionEvent({
        lead_id: data.lead_id,
        destino: 'google_ads',
        event_name: data.event_name,
        event_id: data.event_id ?? null,
        success: false,
        error_message: 'oauth_failed',
      })
      return result
    }

    // 2) Montar conversion
    const eventTime = data.event_time ?? Math.floor(Date.now() / 1000)
    const conversionDateTime = formatGoogleAdsDateTime(eventTime)
    const conversion: Record<string, unknown> = {
      conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
      conversionDateTime,
      currencyCode: data.currency || 'BRL',
    }
    if (typeof data.value_brl === 'number') conversion.conversionValue = data.value_brl
    if (data.gclid) conversion.gclid = data.gclid
    if (data.gbraid) conversion.gbraid = data.gbraid
    if (data.wbraid) conversion.wbraid = data.wbraid
    if (data.event_id) conversion.orderId = data.event_id

    // Enhanced Conversions: identificadores hashados
    const userIdentifiers: Array<Record<string, unknown>> = []
    const emailHash = hashOrNull(data.email)
    const phoneHash = hashOrNull(data.phone_e164 ? `+${data.phone_e164}` : null)
    if (emailHash) userIdentifiers.push({ hashedEmail: emailHash })
    if (phoneHash) userIdentifiers.push({ hashedPhoneNumber: phoneHash })
    if (userIdentifiers.length > 0) conversion.userIdentifiers = userIdentifiers

    // 3) Upload
    const url = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'developer-token': developerToken,
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversions: [conversion],
        partialFailure: true,
        validateOnly: false,
      }),
    })
    const respBody = await res.json().catch(() => null)
    const success = res.ok && !(respBody as Record<string, unknown> | null)?.partialFailureError

    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'google_ads',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      payload: { conversion },
      response_status: res.status,
      response_body: respBody,
      success,
      error_message: success ? null : 'see_response_body',
    })
    return { ok: success, skipped: false, status: res.status, body: respBody }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'google_ads',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      success: false,
      error_message: msg,
    })
    return { ok: false, skipped: false, error: msg }
  }
}

function formatGoogleAdsDateTime(unixSeconds: number): string {
  // YYYY-MM-DD HH:mm:ss-03:00 (timezone offset; usamos -03:00 BRT)
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getUTCFullYear()
  // Convertendo pra BRT (-03)
  const brt = new Date(d.getTime() - 3 * 3600 * 1000)
  return `${y}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())} ${pad(brt.getUTCHours())}:${pad(
    brt.getUTCMinutes(),
  )}:${pad(brt.getUTCSeconds())}-03:00`
}

/* ─── Meta Conversions API ─── */
/**
 * Doc: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * Suporta envio simultaneo pra ate 2 pixels (cada um com seu proprio access token).
 * Configurar via env: META_PIXEL_ID/META_CAPI_ACCESS_TOKEN (principal) e
 * META_PIXEL_ID_2/META_CAPI_ACCESS_TOKEN_2 (secundario, opcional).
 */
async function sendMetaCapiSingle(
  pixelId: string,
  accessToken: string,
  testEventCode: string | undefined,
  eventPayload: Record<string, unknown>,
  data: ConversionLeadData,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(
    accessToken,
  )}`
  const body: Record<string, unknown> = { data: [eventPayload] }
  if (testEventCode) body.test_event_code = testEventCode

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const respBody = await res.json().catch(() => null)
    const success = res.ok && !(respBody as Record<string, unknown> | null)?.error

    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'meta_capi',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      payload: { pixel_id: pixelId, ...eventPayload },
      response_status: res.status,
      response_body: respBody,
      success,
      error_message: success ? null : 'see_response_body',
    })
    return { ok: success, status: res.status, body: respBody }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'meta_capi',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      payload: { pixel_id: pixelId },
      success: false,
      error_message: msg,
    })
    return { ok: false, status: 0, body: { error: msg } }
  }
}

export async function sendMetaCapi(data: ConversionLeadData): Promise<ConversionResult> {
  const pixels = [
    { id: process.env.META_PIXEL_ID, token: process.env.META_CAPI_ACCESS_TOKEN },
    { id: process.env.META_PIXEL_ID_2, token: process.env.META_CAPI_ACCESS_TOKEN_2 },
  ].filter((p): p is { id: string; token: string } => Boolean(p.id && p.token))

  const testEventCode = process.env.META_TEST_EVENT_CODE

  if (pixels.length === 0) {
    return { ok: false, skipped: true, error: 'meta_capi_env_missing' }
  }

  const eventTime = data.event_time ?? Math.floor(Date.now() / 1000)
  const userData: Record<string, unknown> = {}
  const emailHash = hashOrNull(data.email)
  const phoneHash = hashOrNull(data.phone_e164)
  const fnHash = hashOrNull(data.first_name)
  const lnHash = hashOrNull(data.last_name)
  const ctHash = hashOrNull(data.cidade)
  const stHash = hashOrNull(data.estado)
  const externalIdHash = hashOrNull(data.external_id)
  if (emailHash) userData.em = [emailHash]
  if (phoneHash) userData.ph = [phoneHash]
  if (fnHash) userData.fn = [fnHash]
  if (lnHash) userData.ln = [lnHash]
  if (ctHash) userData.ct = [ctHash]
  if (stHash) userData.st = [stHash]
  if (externalIdHash) userData.external_id = [externalIdHash]
  if (data.fbp) userData.fbp = data.fbp
  if (data.fbc) userData.fbc = data.fbc
  else if (data.fbclid) {
    userData.fbc = `fb.1.${eventTime}.${data.fbclid}`
  }
  if (data.ip) userData.client_ip_address = data.ip
  if (data.user_agent) userData.client_user_agent = data.user_agent

  const eventPayload: Record<string, unknown> = {
    event_name: data.event_name,
    event_time: eventTime,
    action_source: 'website',
    user_data: userData,
  }
  if (data.event_id) eventPayload.event_id = data.event_id
  if (typeof data.value_brl === 'number') {
    eventPayload.custom_data = {
      value: data.value_brl,
      currency: data.currency || 'BRL',
    }
  }

  const results = await Promise.all(
    pixels.map((p) => sendMetaCapiSingle(p.id, p.token, testEventCode, eventPayload, data)),
  )

  const allOk = results.every((r) => r.ok)
  return {
    ok: allOk,
    skipped: false,
    status: results[0].status,
    body: results.map((r, i) => ({ pixel_id: pixels[i].id, status: r.status, body: r.body })),
  }
}

/* ─── GA4 Measurement Protocol ─── */
/**
 * Doc: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function sendGa4Mp(data: ConversionLeadData): Promise<ConversionResult> {
  const measurementId = process.env.GA4_MEASUREMENT_ID
  const apiSecret = process.env.GA4_API_SECRET

  if (!measurementId || !apiSecret) {
    return { ok: false, skipped: true, error: 'ga4_mp_env_missing' }
  }

  try {
    const clientId =
      data.ga_client_id ||
      `${Math.floor(Math.random() * 2 ** 32)}.${Math.floor(Date.now() / 1000)}`

    const eventName =
      data.event_name === 'Lead'
        ? 'generate_lead'
        : data.event_name === 'Purchase'
          ? 'purchase'
          : data.event_name.toLowerCase()

    const params: Record<string, unknown> = {
      currency: data.currency || 'BRL',
    }
    if (typeof data.value_brl === 'number') params.value = data.value_brl
    if (data.event_id) params.transaction_id = data.event_id

    const body = {
      client_id: clientId,
      events: [{ name: eventName, params }],
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      measurementId,
    )}&api_secret=${encodeURIComponent(apiSecret)}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    // GA4 MP retorna 204 No Content em sucesso
    const success = res.status === 204 || res.ok

    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'ga4_mp',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      payload: body,
      response_status: res.status,
      response_body: null,
      success,
      error_message: success ? null : `status_${res.status}`,
    })
    return { ok: success, skipped: false, status: res.status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logConversionEvent({
      lead_id: data.lead_id,
      destino: 'ga4_mp',
      event_name: data.event_name,
      event_id: data.event_id ?? null,
      success: false,
      error_message: msg,
    })
    return { ok: false, skipped: false, error: msg }
  }
}

/**
 * Dispara as 3 APIs em paralelo. Retorna um resumo.
 */
export async function fireAllConversionApis(data: ConversionLeadData): Promise<{
  google_ads: ConversionResult
  meta_capi: ConversionResult
  ga4_mp: ConversionResult
}> {
  const [google_ads, meta_capi, ga4_mp] = await Promise.all([
    sendGoogleAdsConversion(data).catch((err) => ({
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    })),
    sendMetaCapi(data).catch((err) => ({
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    })),
    sendGa4Mp(data).catch((err) => ({
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    })),
  ])
  return { google_ads, meta_capi, ga4_mp }
}
