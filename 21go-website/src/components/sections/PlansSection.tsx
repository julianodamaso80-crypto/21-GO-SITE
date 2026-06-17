'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import { Check, X, Car, Bike, Truck, Star, ArrowRight } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

type Category = 'carros' | 'motos' | 'especiais'

const categories: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: 'carros', label: 'Carros', icon: <Car className="w-4 h-4" /> },
  { id: 'motos', label: 'Motos', icon: <Bike className="w-4 h-4" /> },
  { id: 'especiais', label: 'SUV & Especiais', icon: <Truck className="w-4 h-4" /> },
]

interface PlanFeature {
  text: string
  included: boolean
}

const plansByCategory: Record<Category, {
  name: string
  desc: string
  popular?: boolean
  delay: number
  features: PlanFeature[]
}[]> = {
  carros: [
    {
      name: 'Básico',
      desc: 'Proteção essencial com assistência completa',
      delay: 0,
      features: [
        { text: 'Roubo e Furto', included: true },
        { text: 'Incêndio (proveniente de colisão)', included: true },
        { text: 'Colisão', included: true },
        { text: 'Danos a Terceiros R$5.000', included: true },
        { text: 'Monitoramento 24h', included: true },
        { text: 'Reboque 200km', included: true },
        { text: 'Assistência 24h completa', included: true },
        { text: 'Clube de Benefícios', included: true },
        { text: 'Fenômenos da Natureza', included: false },
        { text: 'Parabrisa', included: false },
        { text: 'Carro Reserva', included: false },
      ],
    },
    {
      name: 'Do Seu Jeito',
      desc: 'Básico + fenômenos, parabrisa e mais',
      delay: 0.05,
      features: [
        { text: 'Tudo do Básico', included: true },
        { text: 'Fenômenos da Natureza', included: true },
        { text: 'Parabrisa', included: true },
        { text: 'Carro Amigo 25km', included: true },
        { text: 'Danos a Terceiros R$10.000', included: true },
        { text: 'Reboque 400km', included: true },
        { text: 'Táxi 50km', included: true },
        { text: 'Carro Reserva', included: false },
        { text: 'Todos os Vidros', included: false },
      ],
    },
    {
      name: 'VIP',
      desc: 'O mais escolhido. Proteção completa',
      popular: true,
      delay: 0.1,
      features: [
        { text: 'Tudo do "Do Seu Jeito"', included: true },
        { text: 'Danos a Terceiros R$50.000', included: true },
        { text: 'Carro Reserva 7 dias (roubo/furto)', included: true },
        { text: 'Carro Amigo 25km', included: true },
        { text: 'Reboque 1.000km', included: true },
        { text: 'Táxi 100km', included: true },
        { text: 'Todos os Vidros', included: false },
        { text: 'AP morte/invalidez', included: false },
      ],
    },
    {
      name: 'Premium',
      desc: 'Máxima proteção. Tudo incluído',
      delay: 0.15,
      features: [
        { text: 'Tudo do VIP', included: true },
        { text: 'Danos a Terceiros R$100.000', included: true },
        { text: 'Carro Reserva 15 dias', included: true },
        { text: 'Todos os Vidros', included: true },
        { text: 'Reboque Adicional 200km', included: true },
        { text: 'Reboque 1.200km total', included: true },
        { text: 'Táxi 150km', included: true },
        { text: 'AP morte/invalidez R$10.000', included: true },
      ],
    },
  ],
  motos: [
    {
      name: 'VIP Moto até 400cc',
      desc: 'Proteção completa para motos até 400cc',
      popular: true,
      delay: 0,
      features: [
        { text: 'Roubo e Furto', included: true },
        { text: 'Colisão', included: true },
        { text: 'Fenômenos da Natureza', included: true },
        { text: 'Monitoramento 24h', included: true },
        { text: 'Reboque 1.000km', included: true },
        { text: 'Chaveiro / Pneu / Combustível', included: true },
        { text: 'Socorro mecânico / elétrico', included: true },
        { text: 'Hospedagem + Retorno', included: true },
        { text: 'AP morte acidental R$10.000', included: true },
      ],
    },
    {
      name: 'VIP Moto 450-1000cc',
      desc: 'Para motos de alta cilindrada',
      delay: 0.1,
      features: [
        { text: 'Roubo e Furto', included: true },
        { text: 'Colisão', included: true },
        { text: 'Fenômenos da Natureza', included: true },
        { text: 'Monitoramento 24h', included: true },
        { text: 'Reboque 1.000km', included: true },
        { text: 'Chaveiro / Pneu / Combustível', included: true },
        { text: 'Socorro mecânico / elétrico', included: true },
        { text: 'Hospedagem + Retorno', included: true },
        { text: 'AP morte acidental R$10.000', included: true },
      ],
    },
  ],
  especiais: [
    {
      name: 'VIP SUV',
      desc: 'Pick-ups, caminhonetes e SUVs',
      popular: true,
      delay: 0,
      features: [
        { text: 'Roubo e Furto', included: true },
        { text: 'Incêndio (proveniente de colisão)', included: true },
        { text: 'Fenômenos da Natureza', included: true },
        { text: 'Colisão', included: true },
        { text: 'Danos a Terceiros R$50.000', included: true },
        { text: 'Carro Reserva 7 dias (roubo/furto)', included: true },
        { text: 'Parabrisa', included: true },
        { text: 'Carro Amigo 25km', included: true },
        { text: 'Monitoramento 24h', included: true },
        { text: 'Reboque 1.000km', included: true },
        { text: 'Assistência 24h completa', included: true },
        { text: 'AP morte/invalidez R$10.000', included: true },
      ],
    },
    {
      name: 'Veículos Especiais',
      desc: 'Elétricos e acima de R$150 mil',
      delay: 0.1,
      features: [
        { text: 'Roubo e Furto', included: true },
        { text: 'Incêndio (proveniente de colisão) + Fenômenos da Natureza', included: true },
        { text: 'Colisão', included: true },
        { text: 'Danos a Terceiros R$50.000', included: true },
        { text: 'Carro Reserva 7 dias (roubo/furto)', included: true },
        { text: 'Parabrisa + Carro Amigo', included: true },
        { text: 'Monitoramento 24h', included: true },
        { text: 'Reboque 1.000km', included: true },
        { text: 'Assistência 24h completa', included: true },
      ],
    },
  ],
}

export function PlansSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const [activeCategory, setActiveCategory] = useState<Category>('carros')
  const plans = plansByCategory[activeCategory]

  return (
    <section data-cta-section="plans" ref={ref} id="planos" className="bg-white py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-7xl px-6"
      >
        <motion.div variants={fadeInUp} className="text-center mb-10">
          <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
            Planos
          </span>
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]">
            Proteção sob medida para seu veículo
          </h2>
          <p className="mt-4 text-lg text-[#64748B] max-w-2xl mx-auto">
            Compare os benefícios e descubra o plano ideal. O valor depende do seu veículo.
          </p>
        </motion.div>

        {/* Category tabs */}
        <motion.div variants={fadeInUp} className="flex justify-center gap-2 mb-12">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeCategory === cat.id
                  ? 'bg-[#293C82] text-white shadow-md'
                  : 'bg-[#F0F4FA] text-[#64748B] hover:bg-[#E2E8F0]'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </motion.div>

        <div className={`grid grid-cols-1 gap-6 lg:gap-8 items-start ${
          plans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' :
          plans.length === 3 ? 'md:grid-cols-3' :
          'md:grid-cols-2 lg:grid-cols-4'
        }`}>
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={fadeInUp}
              transition={{ delay: plan.delay }}
              className={`relative rounded-2xl p-7 border transition-all duration-300 ${
                plan.popular
                  ? 'border-[#F2911D]/50 shadow-xl md:scale-[1.03] bg-white md:-mt-4'
                  : 'border-[#E8ECF4] bg-white hover:shadow-lg hover:-translate-y-1'
              }`}
            >
              {plan.popular && (
                <div className="absolute inset-0 rounded-2xl -z-10 animate-glow-pulse opacity-60"
                  style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(242, 145, 29,0.15) 0%, transparent 70%)' }}
                />
              )}

              {plan.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#F2911D] to-[#C7D301] text-white text-xs font-bold px-5 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                  Mais escolhido
                </span>
              )}

              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-[var(--font-outfit)] text-xl font-bold text-[#1A2754]">{plan.name}</h3>
                  <p className="mt-1 text-sm text-[#64748B]">{plan.desc}</p>
                </div>
                {plan.popular && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#F2911D]/10 flex items-center justify-center">
                    <Star className="w-4 h-4 text-[#F2911D] fill-[#F2911D]" />
                  </div>
                )}
              </div>

              <ul className="space-y-3 mb-7">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-3">
                    {f.included ? (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#10B981]/10 flex items-center justify-center mt-0.5">
                        <Check className="h-3 w-3 text-[#10B981]" />
                      </span>
                    ) : (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F1F5F9] flex items-center justify-center mt-0.5">
                        <X className="h-3 w-3 text-[#CBD5E1]" />
                      </span>
                    )}
                    <span className={`text-sm leading-snug ${f.included ? 'text-[#1A2754]' : 'text-[#CBD5E1]'}`}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/cotacao"
                className={`block w-full text-center py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  plan.popular
                    ? 'bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white shadow-md hover:shadow-[0_4px_16px_rgba(242, 145, 29,0.4)]'
                    : 'bg-[#F0F4FA] text-[#293C82] hover:bg-[#E2E8F0]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  Fazer Simulação <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div variants={fadeInUp} className="text-center mt-12">
          <p className="text-[#64748B] text-sm">
            O valor da mensalidade depende do modelo e ano do seu veículo.{' '}
            <Link href="/cotacao" className="text-[#293C82] font-semibold hover:underline">
              Faça sua simulação grátis em 30 segundos
            </Link>.
          </p>
        </motion.div>
      </motion.div>
    </section>
  )
}
