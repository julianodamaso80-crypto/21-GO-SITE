/**
 * 21Go — Cookie helpers para Click IDs e UTMs (first-party, 90 dias)
 * Usado pelo tracking para persistir gclid, fbclid e UTMs entre páginas.
 */

const COOKIE_DAYS = 90

function setCookie(name: string, value: string, days: number = COOKIE_DAYS) {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[2]) : null
}

/* ─── Click IDs ─── */

export interface ClickIds {
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  msclkid?: string
  ttclid?: string
  _fbc?: string
  _fbp?: string
}

const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'] as const

/** Extract click IDs from URL and save to cookies + localStorage */
export function captureClickIds(): ClickIds {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  const ids: ClickIds = {}

  for (const param of CLICK_ID_PARAMS) {
    const value = params.get(param)
    if (value) {
      ids[param] = value
      setCookie(`_21go_${param}`, value)
      try { localStorage.setItem(`_21go_${param}`, value) } catch {}
    }
  }

  // Generate _fbc from fbclid (Meta format: fb.1.timestamp.fbclid)
  if (ids.fbclid) {
    const fbc = `fb.1.${Date.now()}.${ids.fbclid}`
    ids._fbc = fbc
    setCookie('_21go_fbc', fbc)
  }

  // Capture existing _fbp cookie if Meta Pixel set it
  const fbp = getCookie('_fbp')
  if (fbp) ids._fbp = fbp

  return ids
}

/** Get stored click IDs from cookies (fallback to localStorage) */
export function getClickIds(): ClickIds {
  const ids: ClickIds = {}

  for (const param of CLICK_ID_PARAMS) {
    const value = getCookie(`_21go_${param}`)
      || (typeof localStorage !== 'undefined' ? localStorage.getItem(`_21go_${param}`) : null)
    if (value) ids[param] = value
  }

  const fbc = getCookie('_21go_fbc')
  if (fbc) ids._fbc = fbc

  const fbp = getCookie('_fbp')
  if (fbp) ids._fbp = fbp

  return ids
}

/* ─── UTM Parameters ─── */

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Extract UTMs from URL and save to cookie */
export function captureUtms(): UtmParams {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  const utms: UtmParams = {}
  let hasAny = false

  for (const param of UTM_PARAMS) {
    const value = params.get(param)
    if (value) {
      utms[param] = value
      hasAny = true
    }
  }

  if (hasAny) {
    setCookie('_21go_utm', JSON.stringify(utms))
    try { localStorage.setItem('_21go_utm', JSON.stringify(utms)) } catch {}
  }

  return utms
}

/**
 * Quem indicou (`?ind=` na URL) — Member Get Member.
 *
 * Guardado igual aos UTMs porque o problema e o mesmo: o amigo entra pelo link
 * da Maria, olha os planos, pensa, e so preenche a cotacao dez minutos depois,
 * em outra pagina. Se o codigo ficasse so na URL da primeira visita, a Maria
 * perdia o desconto por causa de um clique em "Planos".
 *
 * Nao sobrescreve com vazio: navegar pra qualquer pagina sem `?ind=` nao pode
 * apagar quem trouxe a pessoa.
 */
export function captureIndicacao(): string | null {
  if (typeof window === 'undefined') return null

  const codigo = new URLSearchParams(window.location.search).get('ind')
  if (codigo && /^[a-z0-9]{4,12}$/i.test(codigo)) {
    const limpo = codigo.toLowerCase()
    setCookie('_21go_ind', limpo)
    try { localStorage.setItem('_21go_ind', limpo) } catch {}
    return limpo
  }

  return getIndicacao()
}

/** O código de quem indicou, se houver. */
export function getIndicacao(): string | null {
  const raw = getCookie('_21go_ind')
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('_21go_ind') : null)
  return raw || null
}

/** Get stored UTMs from cookie (fallback to localStorage) */
export function getUtms(): UtmParams {
  const raw = getCookie('_21go_utm')
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('_21go_utm') : null)

  if (raw) {
    try { return JSON.parse(raw) } catch {}
  }
  return {}
}
