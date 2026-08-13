'use client'

/**
 * HERO do site de um consultor que mandou vídeo próprio (ver
 * `consultores-video.ts`).
 *
 * Substitui o hero do presidente: o vídeo dele ocupa o lugar da imagem e vira o
 * destaque da dobra — vídeo em cima, texto curto e o botão de simulação logo
 * abaixo, tudo na primeira tela. Fora do hero, a home segue idêntica à da 21Go.
 *
 * ─── Som ligado por padrão, sem quebrar quando o navegador não deixa ────────
 *
 * O vídeo é depoimento falado, então nasce COM som (decisão do dono). Só que
 * autoplay com áudio é bloqueado por todo navegador enquanto o visitante não
 * interagiu com a página: nesse caso `play()` rejeita e o vídeo ficaria PARADO,
 * que é pior que mudo. Por isso tentamos com som e, se o navegador recusar,
 * caímos pra mudo tocando e o botão em cima do vídeo vira "Ativar som" — um
 * toque resolve. Onde o autoplay com áudio é permitido, o botão já aparece como
 * "Som ligado" e serve pra desligar.
 */

import { motion, useInView } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Volume2, VolumeX } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from '@/components/Link'
import { BotaoFaleWhatsApp } from '@/components/ui/BotaoFaleWhatsApp'
import type { VideoConsultor } from '@/lib/consultores-video'

export function ConsultorVideoHero({ video }: { video: VideoConsultor }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const videoRef = useRef<HTMLVideoElement>(null)
  const [comSom, setComSom] = useState(true)

  /* Tenta começar com som; se o navegador bloquear, toca mudo. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = false
    el.play()
      .then(() => setComSom(true))
      .catch(() => {
        el.muted = true
        setComSom(false)
        el.play().catch(() => {})
      })
  }, [])

  /* Pausa fora da tela e em aba oculta — com áudio ligado, vídeo tocando onde
     ninguém vê é barulho no meio da navegação. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) el.play().catch(() => {})
          else el.pause()
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    const onVis = () => {
      if (document.hidden) el.pause()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  function alternarSom() {
    const el = videoRef.current
    if (!el) return
    const ligando = el.muted
    el.muted = !ligando
    el.play().catch(() => {})
    setComSom(ligando)
  }

  return (
    <section
      ref={ref}
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-[#0c1330] pt-[4.5rem] pb-[5.5rem] lg:pt-24 lg:pb-20"
    >
      {/* Fundo institucional (o mesmo do hero padrão, sem o presidente) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_40%,#1e2c60_0%,#101a3d_55%,#0c1330_100%)]" />
        <div className="animate-float-slow absolute -top-32 -right-32 h-[600px] w-[600px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
        <div className="animate-float-slower absolute bottom-0 -left-32 h-[700px] w-[700px] rounded-full bg-[#293C82]/25 blur-[150px]" />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-5 text-center sm:px-6"
      >
        {/* Vídeo do consultor — o destaque da dobra */}
        <motion.div variants={fadeInUp} className="w-full">
          <div className="relative mx-auto w-fit overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-[0_24px_70px_rgba(4,8,24,0.6)]">
            <video
              ref={videoRef}
              className="h-[min(50svh,420px)] w-auto max-w-full object-cover object-center sm:h-[min(56svh,520px)]"
              poster={video.poster}
              loop
              autoPlay
              playsInline
              preload="metadata"
              controls={false}
            >
              <source src={video.mp4} type="video/mp4" />
            </video>

            <button
              type="button"
              onClick={alternarSom}
              aria-label={comSom ? 'Desativar som do vídeo' : 'Ativar som do vídeo'}
              className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80 sm:text-sm"
            >
              {comSom ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {comSom ? 'Som ligado' : 'Ativar som'}
            </button>
          </div>
        </motion.div>

        {/* Texto — curto de propósito, pro vídeo e o botão caberem juntos */}
        <motion.h1
          variants={fadeInUp}
          className="mt-[2vh] font-[var(--font-outfit)] text-[clamp(1.15rem,min(5.6vw,3vh),1.75rem)] font-bold leading-[1.16] tracking-tight text-white [text-shadow:0_2px_24px_rgba(8,13,34,0.7)] sm:mt-6 sm:text-3xl md:text-4xl"
        >
          {video.titulo} <span className="text-gradient-orange">{video.destaque}</span>
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          className="mt-[0.9vh] text-[clamp(0.78rem,1.8vh,0.9rem)] font-medium text-white/85 [text-shadow:0_1px_12px_rgba(8,13,34,0.75)] sm:mt-3 sm:text-lg"
        >
          {video.subtitulo}
        </motion.p>

        {/* CTAs — logo abaixo do vídeo, na mesma dobra */}
        <motion.div
          data-cta-section="hero"
          variants={fadeInUp}
          className="mt-[1.6vh] flex w-full flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-4"
        >
          <Link
            href="/cotacao"
            className="shimmer-btn relative inline-flex w-full max-w-[320px] animate-glow-pulse items-center justify-center rounded-xl bg-[#F2911D] px-6 py-[clamp(0.65rem,1.6vh,0.9rem)] text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D67A0F] hover:shadow-[0_8px_30px_rgba(242,145,29,0.5)] sm:w-auto sm:max-w-none sm:px-9 sm:py-4 sm:text-base"
          >
            Fazer Simulação Grátis
          </Link>
          <BotaoFaleWhatsApp
            origin="hero"
            className="inline-flex w-full max-w-[320px] items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/[0.07] px-6 py-[clamp(0.65rem,1.6vh,0.9rem)] text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.12] sm:w-auto sm:max-w-none sm:px-7 sm:py-4 sm:text-base"
          >
            <MessageCircle className="h-4 w-4 text-[#25D366] sm:h-5 sm:w-5" />
            Fale no WhatsApp
          </BotaoFaleWhatsApp>
        </motion.div>
      </motion.div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-[#0c1330]" />
    </section>
  )
}
