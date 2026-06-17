'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ShieldCheck, Lock, Flame, Truck, Clock, Car } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const coverages = [
  { icon: ShieldCheck, title: 'Colisão', desc: 'Proteção parcial e total para batidas e acidentes', color: '#293C82' },
  { icon: Lock, title: 'Roubo e Furto', desc: 'Reembolso pela tabela FIPE em caso de perda total', color: '#293C82' },
  { icon: Flame, title: 'Incêndio (proveniente de colisão)', desc: 'Cobertura para incêndio proveniente de colisão e eventos da natureza', color: '#F2911D' },
  { icon: Truck, title: 'Guincho 200km', desc: 'Reboque gratuito em todo o território nacional', color: '#293C82' },
  { icon: Car, title: 'Carro Reserva', desc: 'Veículo substituto por até 15 dias nos planos superiores', color: '#293C82' },
  { icon: Clock, title: 'Assistência 24h', desc: 'Chaveiro, pneu, pane seca e elétrica a qualquer hora', color: '#F2911D' },
]

function CoverageCard({ item, index }: { item: typeof coverages[0]; index: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={{ delay: index * 0.07 }}
      className="cursor-default"
    >
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm hover:shadow-xl transition-all duration-300 h-full">
        <div className="w-12 h-12 rounded-xl bg-[#293C82]/5 flex items-center justify-center mb-4 transition-all duration-300">
          <item.icon className="h-6 w-6 text-[#293C82]" />
        </div>
        <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#1A2754]">{item.title}</h3>
        <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{item.desc}</p>
      </div>
    </motion.div>
  )
}

export function ProblemSolution() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-[#F0F4FA] py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-7xl px-6"
      >
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#293C82]">
            Proteção completa para seu veículo
          </h2>
          <p className="mt-4 text-lg text-[#64748B] max-w-2xl mx-auto">
            Benefícios pensados pra realidade do Rio de Janeiro. Tudo que você precisa em um único plano.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {coverages.map((item, i) => (
            <CoverageCard key={item.title} item={item} index={i} />
          ))}
        </div>
      </motion.div>
    </section>
  )
}
