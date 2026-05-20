'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Car, Smartphone, UserX, Clock, Bike, MapPin, ArrowRight } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

const bigCards = [
  {
    icon: Car,
    title: 'Comprou no Leilão? Pagamos 80% da FIPE',
    borderColor: 'border-[#C7D301]/40',
    glowColor: 'hover:border-[#C7D301]/60 hover:shadow-[0_0_30px_rgba(201,168,76,0.1)]',
    text: 'A maioria das seguradoras recusa carro de leilão. As poucas que aceitam cobram caro e limitam a indenização. Na 21Go, carro de leilão tem proteção completa com indenização de até 80% da tabela FIPE.',
    detail: 'Faz a conta: você comprou um carro de R$60 mil FIPE por R$35 mil no leilão. Se acontecer perda total, você recebe R$48 mil (80% FIPE). Além de ter rodado protegido, você ainda sai no positivo.',
    highlight: 'Nenhum concorrente oferece isso.',
    cta: 'Proteja seu carro de leilão',
  },
  {
    icon: Smartphone,
    title: 'Motorista de App? Cota de Apenas 6%',
    borderColor: 'border-[#F2911D]/40',
    glowColor: 'hover:border-[#F2911D]/60 hover:shadow-[0_0_30px_rgba(242, 145, 29,0.1)]',
    text: 'Se você roda de app, seu carro faz 150 a 250 km por dia. O risco de batida, roubo ou pane é 3x maior que uso particular. E o seguro? Custa até 40% mais caro, quando a seguradora aceita uso comercial.',
    detail: 'Na 21Go, motorista de app tem cota de participação de apenas 6%. Pra um HB20 2022 (FIPE ~R$78.000), isso significa R$4.680 em caso de evento parcial. Valor justo e transparente.',
    highlight: 'Sem recusa por uso comercial. Sem surpresa na hora do evento.',
    cta: 'Simulação especial pra app',
  },
]

const smallCards = [
  {
    icon: UserX,
    title: 'Nome Negativado? Sem Problema',
    text: 'A 21Go não consulta SPC nem Serasa. Seu nome não importa, seu carro importa.',
  },
  {
    icon: Clock,
    title: 'Carro com Mais de 10 Anos? A Gente Aceita',
    text: 'Seguradora recusa. A 21Go protege qualquer carro, qualquer ano. Até seu Gol 2008.',
  },
  {
    icon: Bike,
    title: 'Moto? Qualquer Cilindrada',
    text: '39 motos roubadas por dia no RJ. Seguro de moto é o mais caro do Brasil. Na 21Go, proteção pra qualquer moto.',
  },
  {
    icon: MapPin,
    title: 'Zona Norte, Baixada, Zona Oeste?',
    text: 'Seguradora foge dessas regiões. A 21Go protege onde você mora. Sem cobrar mais por isso.',
  },
]

export function RejectedSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-white py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-7xl px-6"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]">
            A Seguradora Disse Não?{' '}
            <span className="text-[#F2911D]">A 21Go Diz Sim.</span>
          </h2>
          <p className="mt-4 text-lg text-[#64748B]">
            Proteção pra quem o mercado ignora.
          </p>
        </motion.div>

        {/* 2 Big Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {bigCards.map((card, i) => (
            <motion.div
              key={card.title}
              variants={fadeInUp}
              transition={{ delay: i * 0.12 }}
              className={`rounded-2xl border-2 ${card.borderColor} ${card.glowColor} bg-white p-7 md:p-8 transition-all duration-300 hover:-translate-y-1`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#F0F4FA] flex items-center justify-center mb-5">
                <card.icon className="w-6 h-6 text-[#293C82]" />
              </div>

              <h3 className="font-[var(--font-outfit)] text-xl font-bold text-[#1A2754] mb-4">
                {card.title}
              </h3>

              <p className="text-sm text-[#334155] leading-relaxed mb-3">{card.text}</p>
              <p className="text-sm text-[#334155] leading-relaxed mb-3">{card.detail}</p>
              <p className="text-sm font-semibold text-[#1A2754] mb-5">{card.highlight}</p>

              <Link
                href="/cotacao"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F2911D] hover:text-[#D67A0F] transition-colors"
              >
                {card.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* 4 Small Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {smallCards.map((card, i) => (
            <motion.div
              key={card.title}
              variants={fadeInUp}
              transition={{ delay: 0.24 + i * 0.08 }}
              className="rounded-2xl border border-[#E2E8F0] bg-[#FAFBFC] p-5 hover:shadow-md hover:-translate-y-1 hover:border-[#293C82]/20 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-[#293C82]/5 flex items-center justify-center mb-4">
                <card.icon className="w-5 h-5 text-[#293C82]" />
              </div>
              <h3 className="font-[var(--font-outfit)] text-sm font-bold text-[#1A2754] mb-2">
                {card.title}
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">{card.text}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
