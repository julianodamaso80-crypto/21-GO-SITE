'use client'

/**
 * Jornada cinematográfica de proteção — 3 cenas (CLIP 2, 3 e 4).
 *
 * Todo o texto abaixo vem do conteúdo REAL já publicado no site
 * (benefícios e passos da jornada) — nada foi inventado:
 *  - Monitoramento 24h (planos) / Roubo e Furto (benefícios)
 *  - Assistência 24h + Guincho 200km (benefícios)
 *  - Vistoria pelo app + Aprovação em 48h (4 passos)
 */

import Link from '@/components/Link'
import { Radar, Truck, Camera, ArrowRight } from 'lucide-react'
import { SceneVideo } from '@/components/cinema/SceneVideo'
import { useSceneParallax, useSceneReveal } from '@/components/cinema/useCinema'
import { CLIPS } from '@/lib/media'
import type { CinematicClip } from '@/lib/media'

interface Scene {
  clip: CinematicClip
  kicker: string
  icon: React.ElementType
  title: string
  lines: { strong: string; text: string }[]
  align: 'left' | 'right'
}

const scenes: Scene[] = [
  {
    clip: CLIPS.rua,
    kicker: 'Na rua, dia e noite',
    icon: Radar,
    title: 'Atenção total, do Rio pra todo o Brasil',
    lines: [
      { strong: 'Roubo e Furto', text: 'Reembolso pela tabela FIPE em caso de perda total' },
      { strong: 'Monitoramento 24h', text: 'Disponível nos planos, para sua tranquilidade' },
    ],
    align: 'left',
  },
  {
    clip: CLIPS.assistencia,
    kicker: 'Aconteceu? A gente chega',
    icon: Truck,
    title: 'Assistência 24h, a qualquer hora',
    lines: [
      { strong: 'Assistência 24h', text: 'Chaveiro, pneu, pane seca e elétrica a qualquer hora' },
      { strong: 'Guincho 200km', text: 'Reboque gratuito em todo o território nacional' },
    ],
    align: 'right',
  },
  {
    clip: CLIPS.vistoria,
    kicker: 'Simples e 100% digital',
    icon: Camera,
    title: 'Vistoria pelo app, aprovação em 48h',
    lines: [
      { strong: 'Vistoria pelo app', text: 'Tire fotos do veículo. 100% digital.' },
      { strong: 'Aprovação em 48h', text: 'Análise rápida sem burocracia.' },
    ],
    align: 'left',
  },
]

function JourneyScene({ scene }: { scene: Scene }) {
  const { sectionRef, layerRef } = useSceneParallax()
  const { sectionRef: revealSection, contentRef } = useSceneReveal()

  return (
    <section
      ref={(el) => {
        sectionRef.current = el
        revealSection.current = el
      }}
      className="relative min-h-[88svh] flex items-center overflow-hidden bg-[#0c1330]"
    >
      <div ref={layerRef} className="absolute inset-0 will-change-transform">
        <SceneVideo clip={scene.clip} />
      </div>

      {/* Overlay direcional — escuro no lado do texto, limpo no lado da cena */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            scene.align === 'left'
              ? 'linear-gradient(to right, rgba(8,13,34,0.88) 0%, rgba(8,13,34,0.55) 45%, rgba(8,13,34,0.15) 75%, rgba(8,13,34,0.35) 100%)'
              : 'linear-gradient(to left, rgba(8,13,34,0.88) 0%, rgba(8,13,34,0.55) 45%, rgba(8,13,34,0.15) 75%, rgba(8,13,34,0.35) 100%)',
        }}
      />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#0c1330] to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0c1330] to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24">
        <div
          ref={contentRef}
          className={`max-w-xl will-change-transform ${scene.align === 'right' ? 'ml-auto text-left' : ''}`}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F2911D]/40 bg-[#F2911D]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#F5A845]">
            <scene.icon className="h-3.5 w-3.5" />
            {scene.kicker}
          </span>

          <h2 className="mt-5 font-[var(--font-outfit)] text-3xl md:text-4xl lg:text-[2.75rem] font-bold leading-tight text-white [text-shadow:0_2px_20px_rgba(8,13,34,0.7)]">
            {scene.title}
          </h2>

          <ul className="mt-7 space-y-4">
            {scene.lines.map((l) => (
              <li
                key={l.strong}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0c1330]/45 backdrop-blur-md px-5 py-4"
              >
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#C7D301]" />
                <p className="text-sm md:text-base text-white/85 leading-relaxed">
                  <strong className="text-white font-semibold">{l.strong}</strong>
                  {' — '}
                  {l.text}
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/cotacao"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#F5A845] hover:text-[#F2911D] transition-colors"
          >
            Fazer Simulação Grátis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export function JourneyProtecao() {
  return (
    <div data-cta-section="journey">
      {scenes.map((s) => (
        <JourneyScene key={s.clip.id} scene={s} />
      ))}
    </div>
  )
}
