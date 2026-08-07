'use client'

/**
 * /preview-scroll-3d — PROTÓTIPO ISOLADO da experiência cinematográfica
 * controlada pela rolagem (scroll-scrub de sequência de frames em canvas).
 *
 * Regras do briefing de correção:
 *  - Canvas ÚNICO, fixado (pin REAL do ScrollTrigger, não autoplay).
 *  - O progresso da barra de rolagem controla diretamente o frame:
 *      frameIndex = round(scrollProgress * (totalFrames - 1))
 *  - Rolar para baixo AVANÇA a história; rolar para cima RETORNA.
 *  - Transições entre cenas por dissolve curto (poucos frames) — sem fade
 *    preto longo, sem corte seco.
 *  - Textos = HTML real, sincronizados a janelas de progresso, com
 *    profundidade CSS (perspective/translateZ). Nunca sobrepostos.
 *  - Carregamento progressivo: primeiro os frames essenciais da cena 1,
 *    depois o resto da cena 1, depois as próximas cenas.
 *  - Mobile: sequência reduzida (8fps, 640x360), pin mais curto, scroll nativo.
 *  - prefers-reduced-motion: versão estática (sem pin, sem sequência).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
  // iOS Safari: a barra de endereço encolhe/cresce durante a rolagem e dispara
  // "resize" — sem isto o ScrollTrigger recalcula o pin no meio do gesto e a
  // jornada engasga/pula no iPhone.
  ScrollTrigger.config({ ignoreMobileResize: true })
}

/* ── Configuração das cenas (frames extraídos dos clipes JÁ gerados) ── */

const FRAMES_BASE =
  process.env.NEXT_PUBLIC_FRAMES_BASE && process.env.NEXT_PUBLIC_FRAMES_BASE.length > 0
    ? process.env.NEXT_PUBLIC_FRAMES_BASE.replace(/\/$/, '')
    : '/frames'

interface SceneCfg {
  dir: string
  /** frames desktop (12fps) / mobile (8fps) — preenchidos pelo inventário */
  desktop: number
  mobile: number
  /** janela no progresso global [início, fim] — roteiro seção 7 */
  start: number
  end: number
  label: string
}

// Roteiro: 0-16 hero · 16-32 movimento · 32-48 assistência · 48-64 vistoria
//          64-82 retorno · 82-100 presidente/CTA
export const SCENES: SceneCfg[] = [
  { dir: 'scene-01', desktop: 97, mobile: 64, start: 0.0, end: 0.16, label: 'Patrimônio protegido' },
  { dir: 'scene-02', desktop: 97, mobile: 64, start: 0.16, end: 0.32, label: 'Em cada caminho' },
  { dir: 'scene-03', desktop: 97, mobile: 64, start: 0.32, end: 0.48, label: 'Assistência 24h' },
  { dir: 'scene-04', desktop: 97, mobile: 64, start: 0.48, end: 0.64, label: 'Vistoria e cuidado' },
  { dir: 'scene-05', desktop: 97, mobile: 64, start: 0.64, end: 0.82, label: 'De volta pra casa' },
  { dir: 'scene-06', desktop: 97, mobile: 64, start: 0.82, end: 1.0, label: 'A 21Go cuida de você' },
]

/** Janela de dissolve entre cenas, em progresso global (~poucos frames) */
const DISSOLVE = 0.012

const COPY = [
  {
    id: 'copy-hero',
    inAt: 0.015, outAt: 0.13,
    title: 'Proteção para o seu patrimônio. Cuidado para a sua família.',
    sub: null as string | null,
    ctas: true, final: false,
  },
  { id: 'copy-rua', inAt: 0.185, outAt: 0.30, title: 'Proteção que acompanha você em cada caminho.', sub: null, ctas: false, final: false },
  { id: 'copy-assistencia', inAt: 0.345, outAt: 0.46, title: 'Assistência quando você mais precisa.', sub: null, ctas: false, final: false },
  { id: 'copy-vistoria', inAt: 0.505, outAt: 0.62, title: 'Do atendimento à solução, cada etapa acompanhada.', sub: null, ctas: false, final: false },
  { id: 'copy-familia', inAt: 0.665, outAt: 0.79, title: 'Mais que proteger veículos. Cuidar de pessoas.', sub: null, ctas: false, final: false },
  { id: 'copy-final', inAt: 0.855, outAt: 1.0, title: 'Seu problema vira o nosso problema.', sub: null, ctas: false, final: true },
]

export const SCENES_HOME: SceneCfg[] = [
  { dir: 'scene-02', desktop: 97, mobile: 64, start: 0.0, end: 0.25, label: 'Em cada caminho' },
  { dir: 'scene-03', desktop: 97, mobile: 64, start: 0.25, end: 0.5, label: 'Assistência 24h' },
  { dir: 'scene-04', desktop: 97, mobile: 64, start: 0.5, end: 0.75, label: 'Vistoria e cuidado' },
  { dir: 'scene-05', desktop: 97, mobile: 64, start: 0.75, end: 1.0, label: 'De volta pra casa' },
]

const COPY_HOME = [
  { id: 'copy-rua', inAt: 0.03, outAt: 0.21, title: 'Proteção que acompanha você em cada caminho.', sub: null as string | null, ctas: false, final: false },
  { id: 'copy-assistencia', inAt: 0.28, outAt: 0.46, title: 'Assistência quando você mais precisa.', sub: null, ctas: false, final: false },
  { id: 'copy-vistoria', inAt: 0.53, outAt: 0.71, title: 'Do atendimento à solução, cada etapa acompanhada.', sub: null, ctas: false, final: false },
  { id: 'copy-familia', inAt: 0.78, outAt: 0.97, title: 'Mais que proteger veículos. Cuidar de pessoas.', sub: null, ctas: false, final: false },
]

function framePath(base: string, scene: SceneCfg, idx1: number) {
  return `${base}/${scene.dir}/frame-${String(idx1).padStart(4, '0')}.webp`
}

interface ScrollCinemaProps {
  /** 'full' = prototipo completo (6 cenas) · 'home' = jornada da home (4 cenas, sem hero/presidente) */
  variant?: 'full' | 'home'
}

export function ScrollCinema({ variant = 'full' }: ScrollCinemaProps) {
  const scenes = variant === 'home' ? SCENES_HOME : SCENES
  const copies = variant === 'home' ? COPY_HOME : COPY
  const sectionRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressPctRef = useRef<HTMLSpanElement>(null)
  const progressLabelRef = useRef<HTMLSpanElement>(null)
  const [loadedPct, setLoadedPct] = useState(0)
  const [loadStarted, setLoadStarted] = useState(false)
  const [reduced, setReduced] = useState<boolean | null>(null)

  useEffect(() => {
    // ?motion=1 forca a experiencia completa (avaliacao interna) mesmo com
    // prefers-reduced-motion ativo no sistema operacional.
    const forced = new URLSearchParams(window.location.search).get('motion') === '1'
    let saveData = false
    try {
      const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection
      saveData = !!conn?.saveData
    } catch { /* noop */ }
    if (variant === 'home') {
      // Home: a jornada e conteudo central da pagina — roda sempre, exceto
      // modo economia de dados (fallback estatico leve).
      setReduced(saveData)
    } else {
      setReduced(forced ? false : window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
  }, [])

  useEffect(() => {
    if (reduced !== false) return
    const section = sectionRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!section || !stage || !canvas) return

    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const base = isMobile ? `${FRAMES_BASE}-mobile` : FRAMES_BASE
    const key = isMobile ? ('mobile' as const) : ('desktop' as const)
    const natural = isMobile ? { w: 640, h: 360 } : { w: 1280, h: 720 }

    /* Índice global de frames (todas as cenas concatenadas) */
    const counts = scenes.map((s) => s[key])
    const offsets: number[] = []
    let acc = 0
    for (const c of counts) { offsets.push(acc); acc += c }
    const totalFrames = acc

    /* ── Cache/carregamento progressivo ── */
    const images: (HTMLImageElement | null)[] = new Array(totalFrames).fill(null)
    const ok: boolean[] = new Array(totalFrames).fill(false)
    let loadedCount = 0
    let destroyed = false

    function globalToScene(g: number) {
      for (let s = scenes.length - 1; s >= 0; s--) {
        if (g >= offsets[s]) return { s, local: g - offsets[s] }
      }
      return { s: 0, local: 0 }
    }

    function load(g: number, onDone?: () => void) {
      if (g < 0 || g >= totalFrames || images[g]) { onDone?.(); return }
      const { s, local } = globalToScene(g)
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        ok[g] = true
        loadedCount++
        if (!destroyed && (loadedCount % 36 === 0 || loadedCount === totalFrames)) setLoadedPct(Math.round((loadedCount / totalFrames) * 100))
        onDone?.()
      }
      img.onerror = () => { ok[g] = false; onDone?.() }
      img.src = framePath(base, scenes[s], local + 1)
      images[g] = img
    }

    /* Fila: 1) esqueleto de TODAS as cenas (1 a cada 6) — assim QUALQUER ponto
       da jornada mostra imagem rapidinho, mesmo em rede lenta de celular;
       2) cenas completas em ordem. */
    const queue: number[] = []
    for (let s2 = 0; s2 < scenes.length; s2++) {
      for (let i = 0; i < counts[s2]; i += 6) queue.push(offsets[s2] + i)
    }
    for (let s2 = 0; s2 < scenes.length; s2++) {
      for (let i = 0; i < counts[s2]; i++) queue.push(offsets[s2] + i)
    }
    let qi = 0
    const CONCURRENCY = 8
    let inFlight = 0
    function pump() {
      while (inFlight < CONCURRENCY && qi < queue.length && !destroyed) {
        const g = queue[qi++]
        if (images[g]) continue
        inFlight++
        load(g, () => {
          inFlight--
          pump()
          // Redesenha SOMENTE se este frame interessa agora (evita tempestade
          // de decodes síncronos durante o pré-carregamento das 582 imagens).
          const need = frameOfScene(sceneAt(state.progress), state.progress)
          if (!hasDrawnFrame || Math.abs(g - need) < 4) scheduleRender()
        })
      }
    }

    /* ── Canvas ── */
    const ctx = canvas.getContext('2d')!
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5)
    function resize() {
      canvas.width = Math.round(window.innerWidth * DPR)
      canvas.height = Math.round(window.innerHeight * DPR)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      scheduleRender()
    }
    window.addEventListener('resize', resize)

    function nearestLoaded(g: number): number {
      if (ok[g]) return g
      const { s } = globalToScene(g)
      const lo = offsets[s], hi = offsets[s] + counts[s] - 1
      for (let d = 1; d < counts[s]; d++) {
        if (g - d >= lo && ok[g - d]) return g - d
        if (g + d <= hi && ok[g + d]) return g + d
      }
      // fallback: qualquer frame carregado (evita tela preta)
      for (let i = 0; i < totalFrames; i++) if (ok[i]) return i
      return -1
    }

    function drawCover(img: HTMLImageElement, alpha: number) {
      const cw = canvas.width, ch = canvas.height
      const scale = Math.max(cw / natural.w, ch / natural.h)
      const w = natural.w * scale, h = natural.h * scale
      ctx.globalAlpha = alpha
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
      ctx.globalAlpha = 1
    }

    const state = { progress: 0 }
    let hasDrawnFrame = false
    let raf = 0
    function scheduleRender() {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderCurrentFrame() })
    }

    function sceneAt(p: number) {
      for (let s = scenes.length - 1; s >= 0; s--) if (p >= scenes[s].start) return s
      return 0
    }

    function frameOfScene(s: number, p: number) {
      const sc = scenes[s]
      const lp = Math.min(1, Math.max(0, (p - sc.start) / (sc.end - sc.start)))
      return offsets[s] + Math.round(lp * (counts[s] - 1))
    }

    function renderCurrentFrame() {
      const p = state.progress
      const s = sceneAt(p)
      const g = frameOfScene(s, p)
      ctx.fillStyle = '#0c1330'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const gi = nearestLoaded(g)
      if (gi >= 0 && images[gi]) { drawCover(images[gi]!, 1); hasDrawnFrame = true }

      /* Dissolve curto na fronteira da PRÓXIMA cena (e simétrico ao voltar) */
      if (s < scenes.length - 1) {
        const boundary = scenes[s].end
        if (p > boundary - DISSOLVE) {
          const a = (p - (boundary - DISSOLVE)) / (2 * DISSOLVE) // 0..0.5 antes da fronteira
          const nFirst = offsets[s + 1]
          const ni = nearestLoaded(nFirst)
          if (ni >= 0 && images[ni]) drawCover(images[ni]!, Math.min(1, a))
        }
      }
      if (s > 0) {
        const boundary = scenes[s].start
        if (p < boundary + DISSOLVE) {
          const a = (boundary + DISSOLVE - p) / (2 * DISSOLVE)
          const prevLast = offsets[s - 1] + counts[s - 1] - 1
          const pi = nearestLoaded(prevLast)
          if (pi >= 0 && images[pi]) drawCover(images[pi]!, Math.min(1, a))
        }
      }

      /* HUD de progresso */
      if (progressFillRef.current) progressFillRef.current.style.height = `${(p * 100).toFixed(2)}%`
      if (progressPctRef.current) progressPctRef.current.textContent = `${Math.round(p * 100)}%`
      if (progressLabelRef.current) progressLabelRef.current.textContent = scenes[s].label
    }

    /* ── ScrollTrigger: PIN REAL + SCRUB ── */
    const frameState = { frame: 0 }
    const st = gsap.to(frameState, {
      frame: totalFrames - 1,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          state.progress = self.progress
          scheduleRender()
        },
      },
    })

    /* ── Textos sincronizados (janelas de entrada/saída, com scrub) ── */
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
      },
    })
    const WIN = 0.018 // duração das rampas de entrada/saída
    for (const c of copies) {
      if (c.id === 'copy-hero') {
        // Hero já nasce visível no progresso 0 — só anima a SAÍDA.
        gsap.set(`#${c.id}`, { opacity: 1, y: 0 })
      } else {
        tl.fromTo(`#${c.id}`, { opacity: 0, y: 40, rotateX: 6 }, { opacity: 1, y: 0, rotateX: 0, duration: WIN, ease: 'none' }, c.inAt)
      }
      if (c.outAt < 0.99) {
        tl.to(`#${c.id}`, { opacity: 0, y: -30, duration: WIN, ease: 'none' }, c.outAt)
      }
    }
    /* Camadas de profundidade discretas (respondem ao mesmo progresso) */
    tl.fromTo('.cine-orb-a', { yPercent: 20 }, { yPercent: -25, ease: 'none', duration: 1 }, 0)
    tl.fromTo('.cine-orb-b', { yPercent: -10 }, { yPercent: 20, ease: 'none', duration: 1 }, 0)

    /* Inicialização — somente após TODAS as declarações acima (evita TDZ) */
    resize()
    renderCurrentFrame()

    /* PERF: o download dos frames NÃO começa no carregamento da página.
       Só dispara quando a jornada se aproxima do viewport (~1,2 tela antes),
       deixando o primeiro carregamento (hero/LCP) leve — essencial no celular. */
    let pumpStarted = false
    const startPump = () => {
      if (pumpStarted || destroyed) return
      pumpStarted = true
      setLoadStarted(true)
      pump()
    }
    // Gatilhos (o que vier primeiro):
    //  a) primeiro gesto de rolagem do usuário — a jornada fica logo abaixo
    //     do hero, então qualquer scroll é o sinal de que os frames serão vistos;
    //  b) 2,5s depois do evento load — rede ociosa, sem competir com o LCP;
    //  c) seção já visível no carregamento (deep-link/âncora).
    window.addEventListener('scroll', startPump, { once: true, passive: true })
    let idleTimer = 0
    const armIdle = () => { idleTimer = window.setTimeout(startPump, 2500) }
    if (document.readyState === 'complete') armIdle()
    else window.addEventListener('load', armIdle, { once: true })
    const io = new IntersectionObserver(
      (es) => { if (es.some((e) => e.isIntersecting && e.intersectionRatio > 0.05)) { startPump(); io.disconnect() } },
      { threshold: [0.06] },
    )
    io.observe(section)

    return () => {
      destroyed = true
      io.disconnect()
      window.removeEventListener('scroll', startPump)
      window.removeEventListener('load', armIdle)
      if (idleTimer) window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
      if (raf) cancelAnimationFrame(raf)
      tl.scrollTrigger?.kill()
      tl.kill()
      st.scrollTrigger?.kill()
      st.kill()
    }
  }, [reduced, variant])

  /* ── Fallback estático (reduced-motion / SSR inicial) ── */
  if (reduced !== false) {
    return (
      <div className="bg-[#0c1330] text-white">
        <div className="mx-auto max-w-3xl px-6 py-24 space-y-16">
          <p className="rounded-xl border border-[#C7D301]/30 bg-[#C7D301]/10 px-4 py-3 text-center text-sm text-[#C7D301]">
            Seu sistema está com animações reduzidas — <a className="underline font-semibold" href="?motion=1">clique aqui para ver a experiência cinematográfica completa</a>.
          </p>
          <img src={`${FRAMES_BASE}/${(variant === 'home' ? SCENES_HOME : SCENES)[0].dir}/frame-0001.webp`} alt="Automóvel protegido na garagem ao anoitecer" width={1280} height={720} className="rounded-2xl w-full h-auto" />
          {copies.map((c) => (
            <div key={c.id} className="text-center">
              <h2 className="font-[var(--font-outfit)] text-2xl md:text-3xl font-bold !text-white">{c.title}</h2>
            </div>
          ))}
          <div className="flex justify-center gap-4">
            <Link href="/cotacao" className="px-8 py-4 rounded-xl bg-[#F2911D] font-semibold">Simular agora</Link>
            <Link href="/cotacao" className="px-8 py-4 rounded-xl border border-white/20 font-semibold">Ver planos e valores</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0c1330]">
      {/* Loader discreto até a cena 1 estar pronta */}
      {loadStarted && loadedPct < 100 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] rounded-full border border-white/15 bg-[#0c1330]/80 px-3 py-1 text-[11px] text-white/60 backdrop-blur md:top-auto md:bottom-4 md:left-4 md:translate-x-0">
          carregando cenas… {loadedPct}%
        </div>
      )}

      {/* 700vh desktop / 480vh mobile — a altura é a duração da jornada */}
      <div ref={sectionRef} className={variant === 'home' ? 'cinematic-scroll-section relative h-[340vh] md:h-[480vh]' : 'cinematic-scroll-section relative h-[480vh] md:h-[700vh]'}>
        <div
          ref={stageRef}
          className="cinematic-stage relative top-0 h-[100svh] w-full overflow-hidden"
        >
          {/* CANVAS FIXADO (via pin do ScrollTrigger) */}
          <canvas ref={canvasRef} id="cinematic-canvas" className="absolute inset-0 z-0 h-full w-full" aria-hidden="true" />

          {/* Camadas de profundidade (discretas) — SEM translateZ/preserve-3d:
              no Safari do iPhone o 3D real fazia o texto sumir atrás do canvas. */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div className="cine-orb-a absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-[#F2911D]/10 blur-[110px]" />
            <div className="cine-orb-b absolute bottom-0 -left-24 h-[480px] w-[480px] rounded-full bg-[#293C82]/25 blur-[130px]" />
            <div className="absolute inset-0 shadow-[inset_0_0_220px_40px_rgba(6,10,26,0.65)]" />
          </div>

          {/* Textos HTML sincronizados — nunca desenhados no vídeo */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center pb-[16svh] md:items-center md:pb-0">
            {copies.map((c) => (
              <div
                key={c.id}
                id={c.id}
                className="absolute mx-auto max-w-2xl px-6 text-center opacity-0"
              >
                <h2 className="font-[var(--font-outfit)] text-2xl sm:text-3xl md:text-5xl font-bold leading-tight text-white [text-shadow:0_2px_24px_rgba(6,10,26,0.8)]">
                  {c.title}
                </h2>

                {c.ctas && (
                  <div className="pointer-events-auto mt-7 flex flex-wrap items-center justify-center gap-4" data-cta-section="preview3d_hero">
                    <Link href="/cotacao" className="inline-flex items-center rounded-xl bg-[#F2911D] px-7 py-3.5 text-sm md:text-base font-semibold text-white hover:bg-[#D67A0F] transition-colors">
                      Fazer minha cotação
                    </Link>
                    <Link href="/cotacao" className="inline-flex items-center rounded-xl border border-white/25 bg-white/10 px-7 py-3.5 text-sm md:text-base font-semibold text-white backdrop-blur hover:bg-white/15 transition-colors">
                      Ver planos e valores
                    </Link>
                  </div>
                )}

                {c.final && (
                  <div className="pointer-events-auto mt-7">
                    {/* Fotografia ORIGINAL do presidente — composição HTML/CSS, sem IA */}
                    <div className="mx-auto mb-6 flex justify-center">
                      <picture>
                        <source srcSet="/images/presidente-900.webp" type="image/webp" />
                        <img
                          src="/images/presidente-900.png"
                          alt="Presidente da 21Go Proteção Patrimonial"
                          width={900}
                          height={1164}
                          className="max-h-[38svh] w-auto object-contain drop-shadow-[0_18px_50px_rgba(6,10,26,0.7)]"
                        />
                      </picture>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-4" data-cta-section="preview3d_final">
                      <Link href="/cotacao" className="inline-flex items-center rounded-xl bg-[#F2911D] px-8 py-4 text-base font-semibold text-white hover:bg-[#D67A0F] transition-colors">
                        Simular agora
                      </Link>
                      <Link href="/cotacao" className="inline-flex items-center rounded-xl border border-white/25 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur hover:bg-white/15 transition-colors">
                        Ver planos e valores
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Indicador de progresso da jornada */}
          <div className="pointer-events-none absolute right-4 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-center gap-3 md:right-8">
            <span ref={progressPctRef} className="text-[11px] font-semibold tracking-wider text-white/70">0%</span>
            <div className="relative h-40 w-[3px] overflow-hidden rounded-full bg-white/15 md:h-56">
              <div ref={progressFillRef} className="absolute left-0 top-0 w-full rounded-full bg-gradient-to-b from-[#F2911D] to-[#C7D301]" style={{ height: '0%' }} />
            </div>
            <span ref={progressLabelRef} className="max-w-[90px] text-center text-[10px] leading-tight text-white/50" />
          </div>

          {/* Dica de rolagem no início */}
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.2em] text-white/40">
            role para viver a jornada
          </div>
        </div>
      </div>
    </div>
  )
}
