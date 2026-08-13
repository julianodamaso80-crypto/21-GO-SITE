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
 * que é pior que mudo.
 *
 * Então a ordem é: tenta com som; se o navegador recusar, toca mudo E fica
 * esperando o PRIMEIRO gesto do visitante em qualquer lugar da página (toque,
 * clique, tecla) pra ligar o áudio do começo — ninguém precisa achar o botão. Na
 * prática o som entra no primeiro toque, que é o mais perto de "já começa
 * ligado" que o navegador permite. O botão em cima do vídeo continua ali pra
 * quem quiser DESLIGAR.
 */

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Volume2, VolumeX } from 'lucide-react'
import Link from '@/components/Link'
import { BotaoFaleWhatsApp } from '@/components/ui/BotaoFaleWhatsApp'
import type { VideoConsultor } from '@/lib/consultores-video'

export function ConsultorVideoHero({ video }: { video: VideoConsultor }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [comSom, setComSom] = useState(true)
  /** Quem desligou o som no botão não tem o áudio de volta no próximo clique. */
  const desligadoPeloVisitante = useRef(false)
  const botaoRef = useRef<HTMLButtonElement>(null)

  /* Tenta começar com som; se o navegador bloquear, toca mudo e liga o áudio no
     primeiro gesto do visitante — em qualquer lugar da página. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    let desistiu = false
    const eventos = ['pointerdown', 'touchstart', 'keydown'] as const

    function ligarSom(e: Event) {
      // Toque NO botão de som é decisão explícita — quem trata é o `alternarSom`.
      // Sem esta guarda, o `pointerdown` ligaria o áudio e o `click` logo em
      // seguida leria "já está com som" e desligaria de novo.
      if (e.target instanceof Node && botaoRef.current?.contains(e.target)) return

      // Quem já calou o vídeo no botão não tem o som de volta por ter clicado
      // em outra coisa na página.
      const v = videoRef.current
      if (!v || desistiu || desligadoPeloVisitante.current) return soltar()
      v.muted = false
      v.currentTime = 0
      v.play()
        .then(() => setComSom(true))
        .catch(() => {
          v.muted = true
          v.play().catch(() => {})
        })
      soltar()
    }

    function soltar() {
      for (const ev of eventos) document.removeEventListener(ev, ligarSom)
    }

    el.muted = false
    el.play()
      .then(() => setComSom(true))
      .catch(() => {
        el.muted = true
        setComSom(false)
        el.play().catch(() => {})
        for (const ev of eventos) document.addEventListener(ev, ligarSom, { passive: true })
      })

    return () => {
      desistiu = true
      soltar()
    }
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
    desligadoPeloVisitante.current = !ligando
    el.play().catch(() => {})
    setComSom(ligando)
  }

  return (
    <section
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-[#0c1330] pt-[4.5rem] pb-[5.5rem] lg:pt-24 lg:pb-20"
    >
      {/* Fundo institucional (o mesmo do hero padrão, sem o presidente) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_40%,#1e2c60_0%,#101a3d_55%,#0c1330_100%)]" />
        <div className="animate-float-slow absolute -top-32 -right-32 h-[600px] w-[600px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
        <div className="animate-float-slower absolute bottom-0 -left-32 h-[700px] w-[700px] rounded-full bg-[#293C82]/25 blur-[150px]" />
      </div>

      <div
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-5 text-center sm:px-6"
      >
        {/* Vídeo do consultor — o destaque da dobra */}
        <div className="w-full">
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
              ref={botaoRef}
              type="button"
              onClick={alternarSom}
              aria-label={comSom ? 'Desativar som do vídeo' : 'Ativar som do vídeo'}
              className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80 sm:text-sm"
            >
              {comSom ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {comSom ? 'Som ligado' : 'Ativar som'}
            </button>
          </div>
        </div>

        {/* Texto — curto de propósito, pro vídeo e o botão caberem juntos */}
        <h1
          className="mt-[2vh] font-[var(--font-outfit)] text-[clamp(1.15rem,min(5.6vw,3vh),1.75rem)] font-bold leading-[1.16] tracking-tight text-white [text-shadow:0_2px_24px_rgba(8,13,34,0.7)] sm:mt-6 sm:text-3xl md:text-4xl"
        >
          {video.titulo} <span className="text-gradient-orange">{video.destaque}</span>
        </h1>

        <p
          className="mt-[0.9vh] text-[clamp(0.78rem,1.8vh,0.9rem)] font-medium text-white/85 [text-shadow:0_1px_12px_rgba(8,13,34,0.75)] sm:mt-3 sm:text-lg"
        >
          {video.subtitulo}
        </p>

        {/* CTAs — logo abaixo do vídeo, na mesma dobra */}
        <div
          data-cta-section="hero"
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
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-[#0c1330]" />
    </section>
  )
}
