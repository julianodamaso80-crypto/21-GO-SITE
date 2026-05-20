'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ShieldCheck, Check, AlertTriangle } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

const benefits = [
  'Seus recursos estão protegidos por lei',
  'Nossa operação é fiscalizada pelo governo federal',
  'Você tem respaldo legal completo em caso de evento',
  'Nossas reservas financeiras são auditadas',
]

export function SusepSection() {
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
        <div className="max-w-3xl mx-auto text-center">
          {/* Icon */}
          <motion.div variants={fadeInUp} className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#293C82]/10 flex items-center justify-center">
              <ShieldCheck className="w-10 h-10 text-[#293C82]" />
            </div>
          </motion.div>

          <motion.h2
            variants={fadeInUp}
            className="font-[var(--font-outfit)] text-2xl md:text-3xl lg:text-4xl font-bold text-[#1A2754]"
          >
            Cadastrada na SUSEP. Sua Segurança Garantida pelo Governo
          </motion.h2>

          <motion.div variants={fadeInUp} className="mt-6 space-y-4 text-[#334155] leading-relaxed">
            <p>
              A SUSEP é o órgão do governo federal que fiscaliza o mercado de seguros e proteção patrimonial no Brasil. Desde janeiro de 2025, com a Lei Complementar 213, todas as associações são obrigadas a se cadastrar e seguir regras rígidas de governança e reservas financeiras.
            </p>
            <p>
              A 21Go é cadastrada na SUSEP. Isso significa que:
            </p>
          </motion.div>

          {/* Checklist */}
          <motion.ul variants={fadeInUp} className="mt-5 space-y-3 inline-block text-left">
            {benefits.map((item) => (
              <motion.li
                key={item}
                variants={fadeInUp}
                className="flex items-center gap-3"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                </span>
                <span className="text-[#1A2754] font-medium text-sm md:text-base">{item}</span>
              </motion.li>
            ))}
          </motion.ul>

          <motion.p variants={fadeInUp} className="mt-5 text-sm text-[#64748B]">
            Das mais de 2.200 associações cadastradas, poucas têm 20+ anos de mercado como a 21Go.
          </motion.p>

          {/* Warning box */}
          <motion.div
            variants={fadeInUp}
            className="mt-8 rounded-xl border border-[#F2911D]/20 bg-[#F2911D]/5 p-5 flex gap-4 text-left max-w-xl mx-auto"
          >
            <AlertTriangle className="w-5 h-5 text-[#F2911D] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#1A2754]">
              <strong>Antes de contratar qualquer proteção, pergunte:</strong> &ldquo;Você é cadastrada na SUSEP?&rdquo; Se a resposta for não, saia correndo.
            </p>
          </motion.div>

          {/* CTA */}
          <motion.div variants={fadeInUp} className="mt-8">
            <Link
              href="/cotacao"
              className="inline-flex items-center px-7 py-3.5 rounded-xl bg-[#F2911D] text-white font-semibold text-sm hover:bg-[#D67A0F] transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
            >
              Confie em quem é regulamentado. Faça sua simulação
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
