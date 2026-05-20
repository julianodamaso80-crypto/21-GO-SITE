'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Calculator, Camera, Zap, ShieldCheck } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const steps = [
  { icon: Calculator, num: '1', title: 'Faça sua simulação', desc: 'Online, em 30 segundos. Sem compromisso.' },
  { icon: Camera, num: '2', title: 'Vistoria pelo app', desc: 'Tire fotos do veículo. 100% digital.' },
  { icon: Zap, num: '3', title: 'Aprovação em 48h', desc: 'Análise rápida sem burocracia.' },
  { icon: ShieldCheck, num: '4', title: 'Protegido!', desc: 'Seu carro protegido com assistência 24h.' },
]

export function HowItWorks() {
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
            4 passos para sua proteção
          </h2>
          <p className="mt-4 text-lg text-[#64748B]">Simples, rápido e sem burocracia</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              variants={fadeInUp}
              transition={{ delay: i * 0.1 }}
              className="relative text-center"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-[#293C82]/15" />
              )}

              <div className="relative mx-auto w-20 h-20 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center mb-5 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <step.icon className="h-8 w-8 text-[#293C82]" />
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#F2911D] text-white text-xs font-bold flex items-center justify-center">
                  {step.num}
                </span>
              </div>

              <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#1A2754]">{step.title}</h3>
              <p className="mt-2 text-sm text-[#64748B]">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
