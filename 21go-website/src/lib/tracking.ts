/**
 * 21Go — DataLayer & Tracking Helper
 *
 * 5 eventos críticos do funil (definidos pelo TrackMaster):
 * 1. page_view        — visitante chega
 * 2. cotacao_inicio    — clica em "Ver Cotação"
 * 3. cotacao_completa  — vê resultado com preços
 * 4. whatsapp_click    — clica em botão WhatsApp
 * 5. adesao_offline    — vendedor fecha no CRM (server-side, não aqui)
 *
 * Cada evento gera um event_id (UUID) para deduplicação client/server.
 */

import { getClickIds, type ClickIds } from './cookies'
import { getUtms, type UtmParams } from './cookies'

/* ─── Types ─── */
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
    fbq?: (...args: unknown[]) => void
  }
}

/* ─── UUID generator ─── */
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/* ─── SHA-256 hash (for PII — LGPD compliant) ─── */
export async function hashSHA256(value: string): Promise<string> {
  if (!value) return ''
  const normalized = value.trim().toLowerCase()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(normalized)
    const buffer = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  return normalized // fallback: unhashed (should not happen in browsers)
}

/* ─── Base push ─── */
function pushEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return

  window.dataLayer = window.dataLayer || []

  const clickIds = getClickIds()
  const utms = getUtms()
  const eventId = generateEventId()

  window.dataLayer.push({
    event: eventName,
    event_id: eventId,
    timestamp: new Date().toISOString(),
    page_url: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    // Click IDs (for server-side & offline)
    ...prefixKeys(clickIds as Record<string, unknown>, ''),
    // UTMs
    ...prefixKeys(utms as Record<string, unknown>, ''),
    // Custom params
    ...params,
  })

  return eventId
}

function prefixKeys(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value) result[`${prefix}${key}`] = value
  }
  return result
}

/* ─── Event 1: Page View ─── */
export function trackPageView() {
  const eventId = pushEvent('page_view', {
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  })

  // Meta Pixel: PageView
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView', {}, { eventID: eventId })
  }
}

/* ─── Event 2: Cotação Início ─── */
export function trackCotacaoInicio() {
  const eventId = pushEvent('cotacao_inicio')

  // Meta Pixel: InitiateCheckout
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      content_category: 'protecao_veicular',
    }, { eventID: eventId })
  }
}

/* ─── Event 3: Cotação Completa ─── */
export function trackCotacaoCompleta(data: {
  marca: string
  modelo: string
  ano: string
  plano: string
  valorMensal: number
  valorFipe: number
  email?: string
  phone?: string
}) {
  const eventId = pushEvent('cotacao_completa', {
    vehicle_marca: data.marca,
    vehicle_modelo: data.modelo,
    vehicle_ano: data.ano,
    plan_name: data.plano,
    plan_value: data.valorMensal,
    fipe_value: data.valorFipe,
    currency: 'BRL',
  })

  // Meta Pixel: Lead
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: `${data.marca} ${data.modelo} ${data.ano}`,
      content_category: data.plano,
      value: data.valorMensal,
      currency: 'BRL',
    }, { eventID: eventId })
  }

  // Hash and push user data for server-side (async, non-blocking)
  if (data.email || data.phone) {
    Promise.all([
      data.email ? hashSHA256(data.email) : Promise.resolve(''),
      data.phone ? hashSHA256(data.phone.replace(/\D/g, '')) : Promise.resolve(''),
    ]).then(([emailHash, phoneHash]) => {
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || []
        window.dataLayer.push({
          event: 'user_data_update',
          user_data: {
            email_hash: emailHash,
            phone_hash: phoneHash,
          },
        })
      }
    })
  }

  return eventId
}

/* ─── Event 4: WhatsApp Click ─── */
export function trackWhatsAppClick(origem: string, data?: {
  plano?: string
  valor?: number
  buttonText?: string
}) {
  const eventId = pushEvent('whatsapp_click', {
    click_origin: origem,
    plan_name: data?.plano,
    plan_value: data?.valor,
    button_text: data?.buttonText,
  })

  // Meta Pixel: Contact
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Contact', {
      content_category: data?.plano || 'geral',
      value: data?.valor,
      currency: 'BRL',
    }, { eventID: eventId })
  }

  return eventId
}

/* ─── Event 5: Phone Click ─── */
export function trackPhoneClick() {
  pushEvent('phone_click')
}

/* ─── Event 6: Pedido de Orcamento (Purchase) ───
 * Dispara quando o cliente clica em "Quero contratar" apos preencher tudo
 * e ver o plano selecionado. Mapeia pra Purchase no Meta pra otimizacao
 * de campanhas de Vendas/Conversoes. Dispara nos 2 pixels inicializados.
 */
export function trackPedidoOrcamento(data: {
  plano: string
  valor: number
  marca?: string
  modelo?: string
  ano?: string
}) {
  const eventId = pushEvent('pedido_orcamento', {
    plan_name: data.plano,
    plan_value: data.valor,
    vehicle_marca: data.marca,
    vehicle_modelo: data.modelo,
    vehicle_ano: data.ano,
    currency: 'BRL',
  })

  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', {
      content_name: data.marca && data.modelo ? `${data.marca} ${data.modelo} ${data.ano ?? ''}`.trim() : data.plano,
      content_category: data.plano,
      value: data.valor,
      currency: 'BRL',
    }, { eventID: eventId })
  }

  return eventId
}

/* ─── Utility: Get all tracking data for form submission ─── */
export function getTrackingData(): {
  clickIds: ClickIds
  utms: UtmParams
  landingPage: string
} {
  return {
    clickIds: getClickIds(),
    utms: getUtms(),
    landingPage: typeof window !== 'undefined' ? window.location.href : '',
  }
}
