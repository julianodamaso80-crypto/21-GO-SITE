'use client'

import { useEffect } from 'react'
import { trackWhatsAppClick } from '@/lib/tracking'

// Captura global de cliques em qualquer link wa.me / api.whatsapp.com.
// Independente do componente que renderizou o link, o evento dispara.
//
// Como funciona:
// - listener em `document` no capture phase — roda ANTES de onClicks locais
// - detecta a tag <a> ancestral (suporta clique no ícone/texto interno)
// - determina origem por (em ordem):
//     1. data-track-origin no <a>     (granularidade explicita)
//     2. aria-label = "Fale conosco pelo WhatsApp"  → floating_button
//     3. default                       → whatsapp_link
// - marca o <a> com data-21go-tracked pra dedup com onClicks locais que
//   ainda chamem trackWhatsAppClick (handler local checa esse marker)
// - escape: data-track-skip-global="true" desliga o tracking pra esse link
// - nunca chama preventDefault; nunca bloqueia target="_blank"
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  const href = anchor.getAttribute('href') || ''
  if (!/wa\.me\/|api\.whatsapp\.com|whatsapp:/i.test(href)) return

  if (anchor.dataset.trackSkipGlobal === 'true') return

  // dedup: se outro handler ja marcou nos ultimos 1500ms, pula
  const lastTracked = Number(anchor.dataset['21goTracked'] || '0')
  if (lastTracked && Date.now() - lastTracked < 1500) return

  anchor.dataset['21goTracked'] = String(Date.now())

  const explicitOrigin = anchor.dataset.trackOrigin
  const ariaLabel = anchor.getAttribute('aria-label') || ''
  const origin =
    explicitOrigin ||
    (ariaLabel === 'Fale conosco pelo WhatsApp' ? 'floating_button' : 'whatsapp_link')

  const explicitText = anchor.dataset.trackButtonText
  const rawText = (anchor.textContent || '').trim().replace(/\s+/g, ' ')
  const buttonText = explicitText || (rawText ? rawText.slice(0, 80) : undefined)

  try {
    trackWhatsAppClick(origin, { buttonText })
  } catch {
    /* tracking nao pode quebrar navegacao */
  }
}

export function WhatsAppTracker() {
  useEffect(() => {
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [])

  return null
}
