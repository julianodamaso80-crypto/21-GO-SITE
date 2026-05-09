'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ShieldCheck, Clock, Users, MessageCircle, ChevronDown } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import { NumberTicker } from '@/components/ui/NumberTicker'
import Link from 'next/link'

export function HeroSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section
      ref={ref}
      className="relative min-h-[95vh] overflow-hidden pt-24 pb-24 bg-[#121A33]"
    >
      {/* Background image — responsive: mobile WebP 14KB, desktop WebP 42KB,
          JPG fallback 66KB. Substituiu video de 2.3MB que travava em celular. */}
      <picture className="pointer-events-none absolute inset-0 h-full w-full">
        <source
          media="(max-width: 768px)"
          srcSet="/images/hero-bg-mobile.webp"
          type="image/webp"
        />
        <source srcSet="/images/hero-bg.webp" type="image/webp" />
        <img
          src="/images/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      </picture>

      {/* Mobile: overlay vertical pra legibilidade (em mobile o dono não aparece direito mesmo) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#121A33]/85 via-[#121A33]/80 to-[#121A33]/95 md:hidden" />

      {/* Desktop: overlay direcional — escuro à esquerda (texto + logo) e mais claro à direita
          pra dar destaque ao dono da empresa que aparece no lado direito da imagem */}
      <div className="pointer-events-none absolute inset-0 hidden md:block bg-gradient-to-r from-[#121A33]/90 via-[#121A33]/55 to-[#121A33]/15" />

      {/* Vinheta sutil só nos cantos (reduzida de 0.7 pra 0.35 pra não ofuscar o dono) */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_30px_rgba(10,30,61,0.35)]" />

      {/* Animated gradient orbs — kept for premium glow on top of video */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#F7963D]/10 blur-[120px]" />
        <div className="animate-float-slower absolute bottom-0 -left-32 w-[700px] h-[700px] rounded-full bg-[#375191]/15 blur-[150px]" />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 text-center"
      >
        {/* Badge */}
        <motion.div variants={fadeInUp}>
          <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.07] backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-white/90">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
            </span>
            <ShieldCheck className="h-4 w-4 text-[#C9A84C]" />
            20+ anos protegendo cariocas
          </span>
        </motion.div>

        {/* H1 */}
        <motion.h1
          variants={fadeInUp}
          className="mt-8 font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-white max-w-3xl mx-auto"
        >
          A Cada 11 Minutos,
          <span className="block">Um Carro ou uma Moto é <span className="text-gradient-orange">Roubado no Rio</span></span>
        </motion.h1>

        {/* H2 */}
        <motion.p
          variants={fadeInUp}
          className="mx-auto mt-6 max-w-xl text-lg text-white/80 md:text-xl font-medium"
        >
          São 90 carros e 39 motos por dia. O seu está protegido?
        </motion.p>

        {/* Diferenciais — 3 mini-cards */}
        <motion.div
          variants={fadeInUp}
          className="mx-auto mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl"
        >
          {[
            { icon: '🏷️', title: 'Carro de Leilão', desc: 'Pagamos até 80% da FIPE' },
            { icon: '🚗', title: 'Carro de App', desc: 'Sua cota é de apenas 6%' },
            { icon: '🛡️', title: 'SUSEP', desc: 'Cadastrada para sua segurança' },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm"
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-white/90 leading-tight">{item.title}</p>
                <p className="text-xs text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div variants={fadeInUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/cotacao"
            className="shimmer-btn relative inline-flex items-center px-9 py-4 rounded-xl bg-[#F7963D] text-white text-base font-semibold transition-all duration-300 animate-glow-pulse hover:bg-[#D87E2F] hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(247,150,61,0.5)]"
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
          className="mt-16 grid grid-cols-3 gap-8 md:gap-20"
        >
          {[
            { target: 20, suffix: '+', label: 'Anos de Mercado', icon: ShieldCheck },
            { target: 98, suffix: '%', label: 'Aprovação', icon: Users },
            { target: 24, suffix: '/7', label: 'Assistência', icon: Clock },
          ].map((stat, i) => (
            <div key={stat.label} className="flex flex-col items-center">
              <stat.icon className="mb-2 h-5 w-5 text-[#C9A84C]" />
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
          className="mt-16 flex flex-col items-center gap-2"
        >
          <span className="text-xs text-white/40 tracking-widest uppercase">Explorar</span>
          <div className="relative w-6 h-10 rounded-full border border-white/20 flex items-start justify-center pt-1.5">
            <div className="w-1 h-2 rounded-full bg-white/60 animate-scroll-dot" />
          </div>
          <ChevronDown className="h-4 w-4 text-white/30 animate-bounce-slow" />
        </motion.div>
      </motion.div>
    </section>
  )
}
