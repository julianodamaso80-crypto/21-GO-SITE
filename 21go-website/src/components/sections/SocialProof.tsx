'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Star } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const testimonials = [
  { name: 'Roberto Silva', bairro: 'Copacabana', carro: 'Honda Civic 2019', text: 'Guincho chegou em 25 minutos na Atlântica. Atendimento nota 10. Já indiquei pra família inteira.', stars: 5 },
  { name: 'Patrícia Mendes', bairro: 'Barra da Tijuca', carro: 'Hyundai HB20 2022', text: 'Pagava R$380 de seguro. Na 21Go pago R$227 no plano VIP com os mesmos benefícios. Economizo mais de R$1.800 por ano.', stars: 5 },
  { name: 'Carlos Eduardo', bairro: 'Méier', carro: 'Toyota Corolla 2020', text: 'Meu carro foi roubado e em 15 dias resolvi tudo. Ninguém acredita na velocidade. Recomendo demais.', stars: 5 },
  { name: 'Amanda Costa', bairro: 'Niterói', carro: 'Fiat Pulse 2023', text: 'Melhor custo-benefício que já encontrei. A vistoria pelo app foi super prática, não precisei sair de casa.', stars: 5 },
]

export function SocialProof() {
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
            O que nossos associados dizem
          </h2>
          <div className="mt-4 inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-[#E2E8F0] shadow-sm">
            <div className="flex">
              {[1,2,3,4,5].map(s => <Star key={s} className="h-4 w-4 fill-[#C7D301] text-[#C7D301]" />)}
            </div>
            <span className="text-sm font-semibold text-[#1A2754]">4.8</span>
            <span className="text-sm text-[#64748B]">no Google</span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              variants={fadeInUp}
              transition={{ delay: i * 0.12 }}
              className="bg-white rounded-2xl p-4 sm:p-6 border border-[#E2E8F0] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex mb-3">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-[#C7D301] text-[#C7D301]" />
                ))}
              </div>
              <p className="text-[#1A2754] text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
              <div>
                <p className="text-sm font-semibold text-[#1A2754]">{t.name}</p>
                <p className="text-xs text-[#64748B]">{t.bairro} &middot; {t.carro}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
