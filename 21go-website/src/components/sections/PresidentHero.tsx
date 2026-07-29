'use client'

/**
 * HERO da home — presidente GRANDE, sem carro.
 *
 * - Desktop: vídeo ambiente (foto ORIGINAL do presidente animada com gesto
 *   suave da mão — câmera parada, rosto intacto) em tela cheia; texto à esquerda.
 * - Mobile / reduced-motion / save-data: fotografia original (PNG recortado)
 *   grande, sem vídeo.
 * - Conteúdo 100% preservado: headline, indicadores, CTAs (data-cta-section
 *   "hero"), stats e navegação — nada de texto dentro do vídeo.
 */

import { motion, useInView } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Clock, Users, MessageCircle, ChevronDown } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import { NumberTicker } from '@/components/ui/NumberTicker'
import Link from 'next/link'
import { MEDIA_BASE } from '@/lib/media'

function prefersStatic(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return true
  } catch { /* noop */ }
  return false
}

function PresidentLayer() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [useVideo, setUseVideo] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    setUseVideo(isDesktop && !prefersStatic())
  }, [])

  /* pausa fora da tela / aba oculta */
  useEffect(() => {
    if (!useVideo) return
    const el = wrapRef.current
    const video = videoRef.current
    if (!el || !video) return
    const io = new IntersectionObserver((es) => {
      for (const e of es) e.isIntersecting ? video.play().catch(() => {}) : video.pause()
    }, { threshold: 0.05 })
    io.observe(el)
    const onVis = () => { if (document.hidden) video.pause() }
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); video.pause() }
  }, [useVideo])

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* fundo azul institucional profundo (cobre qualquer falha de mídia) */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_80%_at_62%_45%,#1e2c60_0%,#101a3d_55%,#0c1330_100%)]" />

      {/* Desktop: vídeo ambiente do presidente (foto original animada) */}
      {useVideo && !videoFailed && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          width={1920}
          height={1080}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
          className={`absolute inset-0 hidden h-full w-full object-cover object-[62%_center] transition-opacity duration-700 lg:block ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        >
          <source src={`${MEDIA_BASE}/clip7-presidente-1080.webm`} type="video/webm" />
          <source src={`${MEDIA_BASE}/clip7-presidente-1080.mp4`} type="video/mp4" />
        </video>
      )}

      {/* Foto original — mobile sempre; desktop enquanto o vídeo não está pronto */}
      <picture className={videoReady && useVideo ? 'lg:hidden' : ''}>
        <source srcSet="/images/presidente-900.webp" type="image/webp" />
        <img
          src="/images/presidente-900.png"
          alt=""
          width={900}
          height={1164}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute bottom-0 left-1/2 h-[88%] w-auto max-w-none -translate-x-1/2 object-contain object-bottom opacity-95 lg:left-auto lg:right-[6%] lg:h-[92%] lg:translate-x-0"
        />
      </picture>

      {/* legibilidade do texto (esquerda no desktop, topo/base no mobile) */}
      <div className="absolute inset-0 hidden lg:block" style={{ background: 'linear-gradient(to right, rgba(12,19,48,0.92) 0%, rgba(12,19,48,0.72) 38%, rgba(12,19,48,0.15) 62%, rgba(12,19,48,0) 78%)' }} />
      <div className="absolute inset-0 lg:hidden bg-gradient-to-b from-[#0c1330]/95 via-[#0c1330]/40 to-[#0c1330]/95" />

      {/* luz volumétrica discreta na paleta oficial */}
      <div className="animate-float-slow absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
      <div className="animate-float-slower absolute bottom-0 -left-32 w-[700px] h-[700px] rounded-full bg-[#293C82]/25 blur-[150px]" />
    </div>
  )
}

export function PresidentHero() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section ref={ref} className="relative min-h-[100svh] overflow-hidden pt-24 pb-24 bg-[#0c1330]">
      <PresidentLayer />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-6 text-center lg:items-start lg:text-left"
      >
        <div className="w-full max-w-2xl">
          {/* Badge */}
          <motion.div variants={fadeInUp}>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.07] backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-white/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
              </span>
              <ShieldCheck className="h-4 w-4 text-[#C7D301]" />
              20+ anos protegendo cariocas
            </span>
          </motion.div>

          {/* H1 */}
          <motion.h1
            variants={fadeInUp}
            className="mt-8 font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-white [text-shadow:0_2px_24px_rgba(8,13,34,0.7)]"
          >
            A Cada 11 Minutos,
            <span className="block">Um Carro ou uma Moto é <span className="text-gradient-orange">Roubado no Rio</span></span>
          </motion.h1>

          {/* H2 */}
          <motion.p
            variants={fadeInUp}
            className="mt-6 max-w-xl text-lg text-white/85 md:text-xl font-medium [text-shadow:0_1px_12px_rgba(8,13,34,0.75)] mx-auto lg:mx-0"
          >
            São 90 carros e 39 motos por dia. O seu está protegido?
          </motion.p>

          {/* Cobertura nacional */}
          <motion.div variants={fadeInUp} className="mt-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C7D301]/40 bg-[#C7D301]/10 px-4 py-2 text-sm font-semibold text-white">
              <span aria-hidden="true">🇧🇷</span>
              Atendemos todo o Brasil
            </span>
          </motion.div>

          {/* Diferenciais — 3 mini-cards */}
          <motion.div
            variants={fadeInUp}
            className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto lg:mx-0"
          >
            {[
              { icon: '🏷️', title: 'Carro de Leilão', desc: 'Pagamos até 80% da FIPE' },
              { icon: '🚗', title: 'Carro de App', desc: 'Sua cota é de apenas 6%' },
              { icon: '🛡️', title: 'SUSEP', desc: 'Cadastrada para sua segurança' },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-[#0c1330]/45 backdrop-blur-md"
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white/90 leading-tight">{item.title}</p>
                  <p className="text-xs text-white/55">{item.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div data-cta-section="hero" variants={fadeInUp} className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
            <Link
              href="/cotacao"
              className="shimmer-btn relative inline-flex items-center px-9 py-4 rounded-xl bg-[#F2911D] text-white text-base font-semibold transition-all duration-300 animate-glow-pulse hover:bg-[#D67A0F] hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(242,145,29,0.5)]"
            >
              Fazer Simulação Grátis
            </Link>
            <Link
              href="/cotacao"
              className="inline-flex items-center gap-2.5 px-7 py-4 rounded-xl border border-white/20 bg-white/[0.07] backdrop-blur-sm text-white text-base font-semibold hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
              Fale no WhatsApp
            </Link>
          </motion.div>

          {/* Trust stats */}
          <motion.div
            variants={fadeInUp}
            className="mt-14 grid grid-cols-3 gap-8 md:gap-14 max-w-md mx-auto lg:mx-0"
          >
            {[
              { target: 20, suffix: '+', label: 'Anos de Mercado', icon: ShieldCheck },
              { target: 98, suffix: '%', label: 'Aprovação', icon: Users },
              { target: 24, suffix: '/7', label: 'Assistência', icon: Clock },
            ].map((stat, i) => (
              <div key={stat.label} className="flex flex-col items-center lg:items-start">
                <stat.icon className="mb-2 h-5 w-5 text-[#C7D301]" />
                <NumberTicker
                  target={stat.target}
                  suffix={stat.suffix}
                  duration={1800 + i * 200}
                  className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-white"
                />
                <span className="mt-1 text-sm text-white/60">{stat.label}</span>
              </div>
            ))}
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            variants={fadeInUp}
            className="mt-12 flex flex-col items-center gap-2 lg:items-start"
          >
            <span className="text-xs text-white/40 tracking-widest uppercase">Explorar</span>
            <div className="relative w-6 h-10 rounded-full border border-white/20 flex items-start justify-center pt-1.5">
              <div className="w-1 h-2 rounded-full bg-white/60 animate-scroll-dot" />
            </div>
            <ChevronDown className="h-4 w-4 text-white/30 animate-bounce-slow" />
          </motion.div>
        </div>
      </motion.div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-[#0c1330]" />
    </section>
  )
}
