'use client'

/**
 * SceneVideo — vídeo cinematográfico responsável e leve.
 *
 * Regras implementadas (seção 9 do briefing do redesign):
 *  - preload="none"; as <source> só são anexadas quando a cena se aproxima
 *    da viewport (IntersectionObserver com rootMargin) — nada de baixar
 *    todos os vídeos no primeiro acesso.
 *  - Pausa automaticamente fora da tela; retoma ao voltar.
 *  - `prefers-reduced-motion` e `navigator.connection.saveData` ⇒ nunca
 *    carrega vídeo: fica no poster AVIF/WebP.
 *  - Mobile usa 720p; desktop usa WebM AV1 1080p com MP4 H.264 de fallback.
 *  - muted + playsInline + loop, sem controles, sem áudio.
 *  - Poster com dimensões declaradas (evita CLS). Se o vídeo falhar, o
 *    poster permanece; se o poster falhar, o gradiente da cena cobre tudo.
 */

import { useEffect, useRef, useState } from 'react'
import type { CinematicClip } from '@/lib/media'

interface SceneVideoProps {
  clip: CinematicClip
  /** primeira dobra? (posters ganham fetchPriority alta) */
  priority?: boolean
  className?: string
  /** opacidade base do vídeo (para overlays) */
  videoClassName?: string
}

function prefersStatic(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (conn?.saveData) return true
    if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true
  } catch {
    /* noop */
  }
  return false
}

export function SceneVideo({ clip, priority = false, className = '', videoClassName = '' }: SceneVideoProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [posterFailed, setPosterFailed] = useState(false)

  /* Habilita o vídeo apenas quando a cena se aproxima da viewport */
  useEffect(() => {
    if (prefersStatic()) return
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVideoEnabled(true)
            io.disconnect()
          }
        }
      },
      { rootMargin: priority ? '0px' : '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [priority])

  /* Play/pause conforme visibilidade + cleanup (sem vazamento de listener) */
  useEffect(() => {
    if (!videoEnabled) return
    const el = wrapRef.current
    const video = videoRef.current
    if (!el || !video) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            video.play().catch(() => {/* autoplay bloqueado: poster cobre */})
          } else {
            video.pause()
          }
        }
      },
      { threshold: 0.05 }
    )
    io.observe(el)

    const onVisibility = () => {
      if (document.hidden) video.pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      video.pause()
    }
  }, [videoEnabled])

  const isMobile =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 768px)').matches

  return (
    <div ref={wrapRef} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Fundo-base da cena: gradiente cinematográfico (cobre qualquer falha de mídia) */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,#16214a_0%,#0c1330_55%,#080d22_100%)]" />

      {/* Poster (AVIF → WebP), sempre presente sob o vídeo */}
      {!posterFailed && (
        <picture>
          <source media="(max-width: 768px)" srcSet={clip.posterAvifMobile} type="image/avif" />
          <source media="(max-width: 768px)" srcSet={clip.posterWebpMobile} type="image/webp" />
          <source srcSet={clip.posterAvif} type="image/avif" />
          <source srcSet={clip.posterWebp} type="image/webp" />
          <img
            src={clip.posterWebp}
            alt=""
            width={1920}
            height={1080}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onError={() => setPosterFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${videoReady ? 'opacity-0' : 'opacity-100'}`}
          />
        </picture>
      )}

      {/* Vídeo — sources anexadas só depois do IntersectionObserver liberar */}
      {videoEnabled && !videoFailed && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload={priority ? 'metadata' : 'none'}
          width={1920}
          height={1080}
          onCanPlay={() => setVideoReady(true)}
          onError={(e) => {
            // Só desiste quando TODAS as <source> falharam (video.error setado):
            // erro de uma <source> individual não pode matar o fallback
            // (ex.: Safari sem AV1 precisa cair no MP4 H.264).
            if ((e.currentTarget as HTMLVideoElement).error) setVideoFailed(true)
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${videoReady ? 'opacity-100' : 'opacity-0'} ${videoClassName}`}
        >
          {isMobile ? (
            <source src={clip.mp4720} type="video/mp4" />
          ) : (
            <>
              <source src={clip.webm1080} type='video/webm; codecs="av01.0.08M.08"' />
              <source src={clip.mp41080} type="video/mp4" />
            </>
          )}
        </video>
      )}
    </div>
  )
}
