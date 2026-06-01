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
    gtag?: (...args: unknown[]) => void
    __21GO_GADS?: { CONVERSION_ID: string; LEAD_LABEL: string }
  }
}

/* ─── Google Ads Conversion helper ───
 * Dispara gtag('event', 'conversion', {...}) direto pro Google Ads.
 * Config + IDs vêm de <GoogleAdsConversionScripts /> (SSR) que injeta
 * window.__21GO_GADS no <body>. Não depende de GTM publicado.
 *
 * Why direto via gtag: GTM-WQ9L62XN tem a tag de conversion com placeholder
 * AW-0000000000 (não publicado corretamente). Bypass o GTM evita race
 * condition de publicação e garante sinal pro Google Ads.
 */
function fireGoogleAdsConversion(
  kind: 'lead',
  value: number | undefined,
  transactionId: string | undefined,
) {
  if (typeof window === 'undefined' || !window.gtag) return
  const gads = window.__21GO_GADS
  if (!gads) return

  const sendTo = `AW-${gads.CONVERSION_ID}/${gads.LEAD_LABEL}`
  const params: Record<string, unknown> = { send_to: sendTo }
  if (typeof value === 'number' && Number.isFinite(value)) {
    params.value = value
    params.currency = 'BRL'
  }
  if (transactionId) params.transaction_id = transactionId

  try {
    window.gtag('event', 'conversion', params)
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[21go-track] gads_conversion', kind, sendTo, params)
    }
  } catch {
    // silencioso: se gtag falhar, não derruba o resto do fluxo
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

  const payload = {
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
  }

  window.dataLayer.push(payload)

  // Visibilidade no DevTools (nivel debug — nao polui console; filtre por
  // "21go-track" na aba Console pra inspecionar). Ajuda a confirmar
  // ponta-a-ponta que o handler foi chamado, antes de olhar pro GTM.
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[21go-track] push', eventName, eventId, params)
  }

  return eventId
}

function prefixKeys(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value) result[`${prefix}${key}`] = value
  }
  return result
}

/* ─── Server-side dispatch ───
 * Encaminha o evento pro /api/track, que fala com Meta CAPI + GA4 MP.
 * O mesmo event_id usado no fbq client vai aqui — Meta deduplica por
 * (event_id, event_name) em janela de 7 dias.
 *
 * Hashes de PII (email_hash/phone_hash) só são aceitos pelo endpoint
 * quando já vierem SHA-256 (64 hex). Nunca enviar dado em texto puro.
 *
 * keepalive: true garante envio mesmo se o usuário navegar logo após
 * o clique (caso clássico do botão WhatsApp que abre nova aba).
 */
type ServerSideEventName =
  | 'page_view'
  | 'whatsapp_click'
  | 'cotacao_inicio'
  | 'cotacao_completa'
  | 'pedido_orcamento'
  | 'blog_article_view'
  | 'blog_scroll_depth'
  | 'blog_cta_click'
  | 'blog_internal_link_click'

function sendServerSide(
  eventName: ServerSideEventName,
  eventId: string | undefined,
  params: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined' || !eventId) return
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        page_path: window.location.pathname,
        page_url: window.location.href,
        ...params,
      }),
    })
      .then((r) => {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[21go-track] server', eventName, eventId, 'status', r.status)
        }
      })
      .catch(() => {})
  } catch {}
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

  sendServerSide('page_view', eventId, {
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  })
}

/* ─── Event 2: Cotação Início ─── */
export function trackCotacaoInicio(opts?: { form_name?: string }) {
  const eventId = pushEvent('cotacao_inicio', {
    form_name: opts?.form_name,
    content_category: 'protecao_veicular',
  })

  // Meta Pixel: Lead — dispara JÁ no clique do "Ver Simulação".
  // Antes era InitiateCheckout (só dispara quando backend retorna OK), mas
  // assim perdiamos sinal quando FIPE/PowerCRM falhavam. Lead aqui = form
  // preenchido + enviado = sinal forte de intenção.
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_category: 'protecao_veicular',
    }, { eventID: eventId })
  }

  // Google Ads Conversion (21go-site-lead): dispara JUNTO com Meta Lead.
  // Sinal forte pra otimização da campanha BOFU/CONSULTOR.
  fireGoogleAdsConversion('lead', 50, eventId)

  sendServerSide('cotacao_inicio', eventId, {
    form_name: opts?.form_name,
    content_category: 'protecao_veicular',
  })
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
  form_name?: string
}) {
  const eventId = pushEvent('cotacao_completa', {
    form_name: data.form_name,
    vehicle_marca: data.marca,
    vehicle_modelo: data.modelo,
    vehicle_ano: data.ano,
    plan_name: data.plano,
    plan_value: data.valorMensal,
    fipe_value: data.valorFipe,
    value: data.valorMensal,
    currency: 'BRL',
  })

  // Meta Pixel: CompleteRegistration — sinal de QUALIDADE (cliente viu o
  // preço completo). O Lead "principal" agora dispara antes, no clique
  // do Ver Simulação (trackCotacaoInicio). Aqui marcamos como completou
  // a jornada de visualização da cotação — útil pra audience de upper-funnel
  // qualificado, sem inflar o evento Lead.
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration', {
      content_name: `${data.marca} ${data.modelo} ${data.ano}`,
      content_category: data.plano,
      value: data.valorMensal,
      currency: 'BRL',
    }, { eventID: eventId })
  }

  // Google Ads Conversion (21go-site-lead): mesma conversion do clique,
  // mas com value REAL (mensalidade do plano selecionado) — sinal de
  // qualidade pro Smart Bidding.
  fireGoogleAdsConversion('lead', data.valorMensal, eventId)

  // Hashes assíncronos pra dataLayer (user_data_update) E pro server-side.
  // E-mail/telefone em texto puro NUNCA são enviados pelo navegador — só os
  // SHA-256 saem. O server-side fire só dispara depois dos hashes prontos
  // pra Meta CAPI conseguir bater Advanced Matching.
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
      sendServerSide('cotacao_completa', eventId, {
        form_name: data.form_name,
        vehicle_marca: data.marca,
        vehicle_modelo: data.modelo,
        vehicle_ano: data.ano,
        plan_name: data.plano,
        plan_value: data.valorMensal,
        value: data.valorMensal,
        currency: 'BRL',
        email_hash: emailHash || undefined,
        phone_hash: phoneHash || undefined,
      })
    })
  } else {
    sendServerSide('cotacao_completa', eventId, {
      form_name: data.form_name,
      vehicle_marca: data.marca,
      vehicle_modelo: data.modelo,
      vehicle_ano: data.ano,
      plan_name: data.plano,
      plan_value: data.valorMensal,
      value: data.valorMensal,
      currency: 'BRL',
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

  // Meta Pixel: Contact — value/currency só quando há valor numérico válido.
  // Mandar value:undefined dispara "Invalid parameter format" no Meta Pixel.
  if (typeof window !== 'undefined' && window.fbq) {
    const fbqParams: Record<string, unknown> = {
      content_category: data?.plano || 'geral',
    }
    if (typeof data?.valor === 'number' && Number.isFinite(data.valor)) {
      fbqParams.value = data.valor
      fbqParams.currency = 'BRL'
    }
    window.fbq('track', 'Contact', fbqParams, { eventID: eventId })
  }

  // Google Ads Conversion (21go-site-lead): clique em WhatsApp = sinal
  // forte de intenção (especialmente nos botões da home e flutuante).
  // Sem isso, campanhas que mandam tráfego direto pro WhatsApp ficavam
  // sem sinal de conversão.
  fireGoogleAdsConversion('lead', data?.valor, eventId)

  sendServerSide('whatsapp_click', eventId, {
    click_origin: origem,
    button_text: data?.buttonText,
    plan_name: data?.plano,
    plan_value: data?.valor,
    value: data?.valor,
    currency: data?.valor ? 'BRL' : undefined,
  })

  return eventId
}

/* ─── Event 5: Phone Click ─── */
export function trackPhoneClick() {
  pushEvent('phone_click')
}

/* ─── Event: CTA Click ──────────────────────────────────────────────────
 * Cliques em CTAs internos pra rotas de conversão (/cotacao, /planos etc).
 *
 * NÃO vai pro Meta CAPI nem dispara fbq — esses sinais já estão cobertos
 * pelo funil InitiateCheckout → Lead → Contact e adicionar CTA click pro
 * Meta polui o algoritmo de otimização (clica em CTA não é compra).
 *
 * Serve pra GA4 puro: medir taxa de clique nos CTAs + criar audiência
 * de remarketing "clicou em CTA mas não completou simulação".
 */
export function trackCtaClick(data: {
  origin: string          // ex: 'header', 'hero', 'mobile_cta', 'footer'
  destination: string     // pathname destino, ex: '/cotacao'
  text?: string           // texto visível do botão (max 80 chars)
}) {
  pushEvent('cta_click', {
    cta_origin: data.origin,
    cta_destination: data.destination,
    cta_text: data.text,
  })
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

  // Server-side dedup (Meta CAPI Purchase + GA4 MP purchase). Mesmo event_id
  // do fbq client garante dedup correta no Meta. Crítico pra adblocker/iOS ITP.
  sendServerSide('pedido_orcamento', eventId, {
    plan_name: data.plano,
    plan_value: data.valor,
    value: data.valor,
    currency: 'BRL',
    vehicle_marca: data.marca,
    vehicle_modelo: data.modelo,
    vehicle_ano: data.ano,
  })

  return eventId
}

/* ─── Blog events ─────────────────────────────────────────────────────
 * Eventos de engajamento no conteúdo. NÃO enviam PII e NÃO são tratados
 * como conversão forte (Meta pula esses no /api/track; GA4 recebe pra
 * relatórios de engajamento e funil SEO).
 *
 * Os 4 eventos:
 *   blog_article_view       — uma vez no mount da página do artigo
 *   blog_scroll_depth       — uma vez por threshold (25/50/75/90)
 *   blog_cta_click          — clique em CTA do artigo (cotação/WhatsApp)
 *   blog_internal_link_click — clique em link interno do site dentro do artigo
 */

export interface BlogArticleContext {
  article_slug: string
  article_title: string
  article_category?: string | null
  main_keyword?: string | null
}

export function trackBlogArticleView(ctx: BlogArticleContext) {
  const eventId = pushEvent('blog_article_view', {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    main_keyword: ctx.main_keyword ?? undefined,
    content_category: 'blog',
  })

  sendServerSide('blog_article_view', eventId, {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    main_keyword: ctx.main_keyword ?? undefined,
  })

  return eventId
}

export function trackBlogScrollDepth(
  ctx: BlogArticleContext & { scroll_percent: 25 | 50 | 75 | 90 },
) {
  const eventId = pushEvent('blog_scroll_depth', {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    scroll_percent: ctx.scroll_percent,
    content_category: 'blog',
  })

  sendServerSide('blog_scroll_depth', eventId, {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    scroll_percent: ctx.scroll_percent,
  })

  return eventId
}

export function trackBlogCtaClick(
  ctx: BlogArticleContext & {
    cta_text: string
    cta_href: string
    cta_type: 'whatsapp' | 'cotacao' | 'other'
  },
) {
  const eventId = pushEvent('blog_cta_click', {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    cta_text: ctx.cta_text,
    cta_href: ctx.cta_href,
    cta_type: ctx.cta_type,
    content_category: 'blog',
  })

  sendServerSide('blog_cta_click', eventId, {
    article_slug: ctx.article_slug,
    article_title: ctx.article_title,
    article_category: ctx.article_category ?? undefined,
    cta_text: ctx.cta_text,
    cta_href: ctx.cta_href,
    cta_type: ctx.cta_type,
  })

  return eventId
}

export type BlogLinkTargetType = 'artigo_blog' | 'pagina_pilar' | 'whatsapp' | 'outro'

export function trackBlogInternalLinkClick(args: {
  article_slug: string
  link_href: string
  link_text: string
  target_url?: string
  target_type?: BlogLinkTargetType
}) {
  const eventId = pushEvent('blog_internal_link_click', {
    article_slug: args.article_slug,
    link_href: args.link_href,
    link_text: args.link_text,
    target_url: args.target_url,
    target_type: args.target_type,
    content_category: 'blog',
  })

  sendServerSide('blog_internal_link_click', eventId, {
    article_slug: args.article_slug,
    link_href: args.link_href,
    link_text: args.link_text,
    target_url: args.target_url,
    target_type: args.target_type,
  })

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
