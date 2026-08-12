'use client'

/**
 * CTA final — agora sobre a cena estável da garagem protegida (CLIP 6).
 * Conteúdo, links e data-attrs de tracking preservados da versão original.
 */

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ShieldCheck, MessageCircle } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from '@/components/Link'
import { BotaoFaleWhatsApp } from '@/components/ui/BotaoFaleWhatsApp'
import { SceneVideo } from '@/components/cinema/SceneVideo'
import { CLIPS } from '@/lib/media'

export function FinalCTA() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#0c1330] py-24 lg:py-32">
      <SceneVideo clip={CLIPS.cta} />

      {/* Overlays de legibilidade */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_45%,rgba(8,13,34,0.55)_0%,rgba(8,13,34,0.9)_100%)]" />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#0c1330] to-transparent" />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="relative z-10 mx-auto max-w-3xl px-6 text-center"
      >
        <motion.div variants={fadeInUp}>
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-sm flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-[#C7D301]" />
          </div>
        </motion.div>

        <motion.h2
          variants={fadeInUp}
          className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-white [text-shadow:0_2px_20px_rgba(8,13,34,0.7)]"
        >
          Proteja seu veículo agora
        </motion.h2>

        <motion.p variants={fadeInUp} className="mt-4 text-lg text-white/80">
          Simulação em 30 segundos, sem compromisso. Comece a proteger seu patrimônio hoje.
        </motion.p>

        <motion.div data-cta-section="final_cta" variants={fadeInUp} className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/cotacao"
            className="shimmer-btn inline-flex items-center px-9 py-4 rounded-xl bg-[#F2911D] text-white text-base font-semibold hover:bg-[#D67A0F] transition-all duration-300 animate-glow-pulse hover:-translate-y-0.5"
          >
            Fazer Simulação Grátis
          </Link>
          <BotaoFaleWhatsApp
            origin="final_cta"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-[#10B981] text-white text-base font-semibold hover:bg-[#059669] transition-all duration-200 hover:-translate-y-0.5"
          >
            <MessageCircle className="h-5 w-5" />
            Fale no WhatsApp
          </BotaoFaleWhatsApp>
        </motion.div>
      </motion.div>
    </section>
  )
}
