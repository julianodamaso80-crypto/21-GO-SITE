'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Gift, Users, Trophy } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

const tiers = [
  { count: '1', discount: '10%', icon: Users, label: 'indicação' },
  { count: '5', discount: '50%', icon: Users, label: 'indicações' },
  { count: '10', discount: 'GRÁTIS', icon: Trophy, label: 'indicações' },
]

export function MGMBanner() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] py-20 lg:py-28">
      {/* Orbs — same as hero */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full bg-[#F2911D]/20 blur-[120px]" />
        <div className="animate-float-slower absolute bottom-0 -left-20 w-[500px] h-[500px] rounded-full bg-[#293C82]/30 blur-[150px]" />
        <div className="animate-pulse-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#C7D301]/10 blur-[100px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/grid-pattern.svg)',
            backgroundRepeat: 'repeat',
            opacity: 0.03,
          }}
        />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="relative z-10 mx-auto max-w-5xl px-6 text-center"
      >
        <motion.div variants={fadeInUp}>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
            <Gift className="h-4 w-4 text-[#C7D301]" />
            <span className="text-sm font-medium text-white/90">Programa Indique & Ganhe</span>
          </div>
        </motion.div>

        <motion.h2
          variants={fadeInUp}
          className="font-[var(--font-outfit)] text-3xl md:text-4xl lg:text-5xl font-bold text-white"
        >
          Indique amigos e ganhe até{' '}
          <span className="text-[#F2911D]">100% de desconto</span>
        </motion.h2>

        <motion.p variants={fadeInUp} className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
          Cada indicação que vira associado te dá 10% de desconto. Acumulativo. 10 indicações = proteção gratuita.
        </motion.p>

        <motion.div variants={fadeInUp} className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.count}
              variants={fadeInUp}
              transition={{ delay: i * 0.12 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-3 hover:bg-white/15 transition-colors">
                <tier.icon className="h-7 w-7 text-[#C7D301]" />
              </div>
              <span className="text-sm text-white/60">{tier.count} {tier.label}</span>
              <span className={`font-[var(--font-outfit)] text-xl font-bold mt-1 ${
                tier.count === '10' ? 'text-[#F2911D]' : 'text-white'
              }`}>{tier.discount}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={fadeInUp} className="mt-10">
          <Link
            href="/indique"
            className="shimmer-btn inline-flex items-center px-8 py-4 rounded-xl bg-[#F2911D] text-white text-base font-semibold hover:bg-[#D67A0F] transition-all duration-200 shadow-lg shadow-[#F2911D]/30 hover:-translate-y-0.5"
          >
            Comece a indicar
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
