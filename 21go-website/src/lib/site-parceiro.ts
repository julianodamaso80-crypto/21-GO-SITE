/**
 * Dominio de parceiro que usa a NOSSA tela de resultado, sem slug na URL.
 *
 * 21go.app (Gabriel Juliano), ordem do dono em 02/10/2026: a pagina principal e o "Quase la"
 * (nome + WhatsApp) continuam sendo o site dele, servido pelo Caddy a partir de /srv/21goapp.
 * Depois do "Ver minha cotacao" ele abre `/cotacao` daqui, e a tela de planos, o PDF, os botoes
 * e o popup vao todos para o numero dele. A URL nunca ganha slug (ele reprovou `/gabrieljuliano`).
 *
 * Logica pura: roda no middleware, no navegador e no servidor.
 */

export interface SiteDeParceiro {
  /** Chave interna do consultor (CONSULTORES_DE_PARCEIRO). Nunca aparece na URL. */
  slug: string
  /** 55 + DDD + numero */
  whatsapp: string
  /** Pixels do Meta do parceiro (os mesmos que o site dele carrega por /api/pixels). */
  pixels: string[]
  /** Tag do Google Ads do parceiro. */
  googleAds: string
}

export const SITES_DE_PARCEIRO: Record<string, SiteDeParceiro> = {
  '21go.app': {
    slug: 'gabriel21goapp',
    whatsapp: '5521990954964',
    pixels: ['1380124947496725', '835267522717052', '1653991415906700'],
    googleAds: 'AW-18276620960',
  },
}

export function parceiroDoHost(host: string | null | undefined): SiteDeParceiro | null {
  const h = (host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')
  return Object.hasOwn(SITES_DE_PARCEIRO, h) ? SITES_DE_PARCEIRO[h] : null
}

/** Trecho JS pros scripts inline do <head>: true quando a pagina abriu num dominio de parceiro. */
export const JS_EH_HOST_DE_PARCEIRO = `((${JSON.stringify(Object.keys(SITES_DE_PARCEIRO))}).indexOf((location.hostname||'').toLowerCase().replace(/^www\\./,''))>=0)`

/**
 * Trecho JS: o rastreamento do parceiro no host atual, ou null. Vai pro HTML inteiro porque o
 * HTML e o mesmo em todo dominio; a escolha e no navegador, pelo hostname.
 */
export const JS_RASTREIO_DO_PARCEIRO = `((${JSON.stringify(
  Object.fromEntries(Object.entries(SITES_DE_PARCEIRO).map(([h, p]) => [h, { pixels: p.pixels, googleAds: p.googleAds }])),
)})[(location.hostname||'').toLowerCase().replace(/^www\\./,'')]||null)`
