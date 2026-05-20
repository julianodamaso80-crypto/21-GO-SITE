'use client'

import { useEffect } from 'react'
import { trackCtaClick } from '@/lib/tracking'

// Rotas internas que são consideradas CTAs de conversão.
// Clicar num link pra essas rotas dispara cta_click.
const CTA_ROUTES = [
  '/cotacao',
  '/protecao-veicular',
  '/planos',
  '/indique',
  '/seja-consultor',
]

function matchCtaRoute(href: string): string | null {
  let pathname: string
  try {
    pathname = new URL(href, window.location.origin).pathname
  } catch {
    return null
  }
  for (const route of CTA_ROUTES) {
    if (pathname === route || pathname.startsWith(`${route}/`)) return route
  }
  return null
}

// Infere de onde o clique veio pelo ancestral DOM. Permite filtrar no GA4
// "header CTA" vs "hero CTA" vs "footer CTA" sem ter que marcar cada botão.
// O atributo data-cta-origin explícito (quando houver) sobrescreve a inferência.
function inferOrigin(el: HTMLElement): string {
  const explicit = el.dataset.ctaOrigin
  if (explicit) return explicit

  let cursor: HTMLElement | null = el
  while (cursor && cursor !== document.body) {
    const tag = cursor.tagName.toLowerCase()
    if (tag === 'header') return 'header'
    if (tag === 'footer') return 'footer'
    if (tag === 'nav') return 'nav'
    if (cursor.dataset?.ctaSection) return cursor.dataset.ctaSection
    cursor = cursor.parentElement
  }
  return 'body'
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  const href = anchor.getAttribute('href') || ''
  if (!href) return

  // Filtra cliques que já são tratados por outro tracker
  // (wa.me vai pelo WhatsAppTracker, não duplica aqui).
  if (/wa\.me\/|api\.whatsapp\.com|whatsapp:/i.test(href)) return

  // Escape: data-cta-skip="true" desliga o tracking nesse link.
  if (anchor.dataset.ctaSkip === 'true') return

  const destination = matchCtaRoute(href)
  if (!destination) return

  // dedup leve (1500ms) — evita duplo evento com onClick custom no mesmo link
  const lastTracked = Number(anchor.dataset['21goCta'] || '0')
  if (lastTracked && Date.now() - lastTracked < 1500) return
  anchor.dataset['21goCta'] = String(Date.now())

  const origin = inferOrigin(anchor)
  const rawText = (anchor.textContent || '').trim().replace(/\s+/g, ' ')
  const text = rawText ? rawText.slice(0, 80) : undefined

  try {
    trackCtaClick({ origin, destination, text })
  } catch {
    /* tracking nunca quebra navegação */
  }
}

export function CtaTracker() {
  useEffect(() => {
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [])

  return null
}
