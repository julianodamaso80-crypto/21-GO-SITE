'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ShieldCheck, MessageCircle } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

export function FinalCTA() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-white py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-3xl px-6 text-center"
      >
        <motion.div variants={fadeInUp}>
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-[#293C82]/5 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-[#293C82]" />
          </div>
        </motion.div>

        <motion.h2
          variants={fadeInUp}
          className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]"
        >
          Proteja seu veículo agora
        </motion.h2>

        <motion.p variants={fadeInUp} className="mt-4 text-lg text-[#64748B]">
          Simulação em 30 segundos, sem compromisso. Comece a proteger seu patrimônio hoje.
        </motion.p>

        <motion.div data-cta-section="final_cta" variants={fadeInUp} className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/cotacao"
            className="shimmer-btn inline-flex items-center px-9 py-4 rounded-xl bg-[#F2911D] text-white text-base font-semibold hover:bg-[#D67A0F] transition-all duration-300 animate-glow-pulse hover:-translate-y-0.5"
          >
            Fazer Simulação Grátis
          </Link>
          <Link
            href="/cotacao"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-[#10B981] text-white text-base font-semibold hover:bg-[#059669] transition-all duration-200 hover:-translate-y-0.5"
          >
            <MessageCircle className="h-5 w-5" />
            Fale no WhatsApp
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
