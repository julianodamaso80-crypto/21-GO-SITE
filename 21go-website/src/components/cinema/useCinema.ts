'use client'

/**
 * Hooks GSAP/ScrollTrigger do redesign cinematográfico.
 *
 * - Tudo com `scrub` ⇒ rolagem para cima reverte perfeitamente (nenhuma
 *   animação depende da direção para baixo).
 * - `gsap.matchMedia` respeita `prefers-reduced-motion` e desabilita
 *   pin/parallax no mobile (scroll nativo, sem seções fixadas longas).
 * - `ScrollTrigger.refresh()` é recalculado automaticamente no resize
 *   (comportamento padrão do ScrollTrigger) — sem saltos.
 */

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

/** Parallax sutil da camada de vídeo/fundo + leve zoom de câmera. */
export function useSceneParallax() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const section = sectionRef.current
    const layer = layerRef.current
    if (!section || !layer) return

    const mm = gsap.matchMedia()

    mm.add(
      '(min-width: 769px) and (prefers-reduced-motion: no-preference)',
      () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })
        tl.fromTo(
          layer,
          { yPercent: -8, scale: 1.08 },
          { yPercent: 8, scale: 1.0, ease: 'none' }
        )
      }
    )

    return () => mm.revert()
  }, [])

  return { sectionRef, layerRef }
}

/** Revela o conteúdo da cena com profundidade (opacity/escala/blur) — scrub. */
export function useSceneReveal() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const section = sectionRef.current
    const content = contentRef.current
    if (!section || !content) return

    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        content,
        { opacity: 0, y: 48, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            end: 'top 45%',
            scrub: true,
          },
        }
      )
    })

    return () => mm.revert()
  }, [])

  return { sectionRef, contentRef }
}
