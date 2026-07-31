'use client'

/**
 * Mensagem do Presidente — seção 13 do briefing.
 *
 * - Usa a FOTOGRAFIA ORIGINAL do presidente (PNG recortado), composta sobre
 *   o cenário via HTML/CSS — sem IA no rosto, sem redesenho, sem distorção.
 * - A frase aparece como TEXTO HTML REAL (nunca desenhada em imagem).
 * - Nenhum texto passa por cima do rosto ou do corpo (grid separa colunas;
 *   no mobile o texto fica acima da foto).
 * - Fundo: cena estável do CLIP 5 (retorno à residência protegida).
 */

import { MessageCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { SceneVideo } from '@/components/cinema/SceneVideo'
import { useSceneReveal } from '@/components/cinema/useCinema'
import { CLIPS } from '@/lib/media'
import { whatsappLink } from '@/lib/constants'

export function MensagemPresidente() {
  const { sectionRef, contentRef } = useSceneReveal()

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#0c1330]"
      aria-label="Mensagem do presidente da 21Go"
    >
      <SceneVideo clip={CLIPS.familia} />

      {/* Overlays */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(8,13,34,0.92)_0%,rgba(8,13,34,0.7)_45%,rgba(8,13,34,0.35)_100%)]" />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#0c1330] to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0c1330] to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-20 lg:pt-28">
        <div className="grid items-end gap-10 lg:grid-cols-2">
          {/* Texto — nunca sobre a foto */}
          <div ref={contentRef} className="pb-16 lg:pb-28 will-change-transform">
            <span className="inline-flex items-center rounded-full border border-[#C7D301]/40 bg-[#C7D301]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#C7D301]">
              Mensagem do presidente
            </span>

            <blockquote className="mt-6">
              <p className="font-[var(--font-outfit)] text-2xl md:text-3xl lg:text-4xl font-bold leading-snug text-white [text-shadow:0_2px_20px_rgba(8,13,34,0.7)]">
                “Bem-vindo à 21Go. Como presidente, meu dever é cuidar de você.
                Isso vai muito além de veículos.{' '}
                <span className="text-gradient-orange">É sobre pessoas.</span>{' '}
                Seu problema vira meu problema.”
              </p>
            </blockquote>

            <div className="mt-9 flex flex-wrap items-center gap-4" data-cta-section="presidente">
              <Link
                href="/cotacao"
                className="shimmer-btn inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#F2911D] text-white text-base font-semibold hover:bg-[#D67A0F] transition-all duration-300 hover:-translate-y-0.5"
              >
                Fazer Simulação Grátis <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={whatsappLink('Olá! Tenho uma dúvida sobre proteção veicular.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-7 py-4 rounded-xl border border-white/20 bg-white/[0.07] backdrop-blur-sm text-white text-base font-semibold hover:bg-white/[0.12] transition-all duration-300 hover:-translate-y-0.5"
              >
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
                Fale no WhatsApp
              </a>
            </div>
          </div>

          {/* Fotografia original do presidente — PNG recortado, proporção preservada */}
          <div className="relative mx-auto flex w-full max-w-md items-end justify-center lg:max-w-lg">
            {/* luz de recorte discreta atrás do presidente */}
            <div className="pointer-events-none absolute bottom-0 left-1/2 h-[70%] w-[80%] -translate-x-1/2 rounded-full bg-[#F2911D]/10 blur-[80px]" />
            <picture>
              <source srcSet="/images/presidente-900.webp" type="image/webp" />
              <img
                src="/images/presidente-900.png"
                alt="Presidente da 21Go Proteção Patrimonial"
                width={900}
                height={1164}
                loading="lazy"
                decoding="async"
                className="relative z-10 w-full max-h-[78svh] object-contain object-bottom drop-shadow-[0_20px_60px_rgba(8,13,34,0.6)]"
              />
            </picture>
          </div>
        </div>
      </div>
    </section>
  )
}
