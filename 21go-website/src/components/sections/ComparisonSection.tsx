'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Check, X } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const rows = [
  { feature: 'Custo mensal', veicular: 'Até 60% menor', seguro: 'Valor elevado' },
  { feature: 'Análise de perfil', veicular: false, seguro: true },
  { feature: 'Aceita carros antigos', veicular: true, seguro: false },
  { feature: 'Burocracia', veicular: 'Mínima', seguro: 'Alta' },
  { feature: 'Cancelamento', veicular: 'Sem multa', seguro: 'Fidelidade 12 meses' },
  { feature: 'Assistência 24h', veicular: true, seguro: true },
  { feature: 'Guincho', veicular: '200km incluso', seguro: 'Varia por plano' },
  { feature: 'Simulação online', veicular: '30 segundos', seguro: 'Dias para análise' },
]

function CellValue({ value, positive }: { value: string | boolean; positive: boolean }) {
  if (typeof value === 'boolean') {
    return positive ? (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#10B981]/10">
        <Check className="h-4 w-4 text-[#10B981]" />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#EF4444]/10">
        <X className="h-4 w-4 text-[#EF4444]" />
      </span>
    )
  }
  return <span className={`text-[11px] sm:text-sm font-medium ${positive ? 'text-[#1A2754]' : 'text-[#64748B]'}`}>{value}</span>
}

export function ComparisonSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-white py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-4xl px-6"
      >
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#293C82]">
            Proteção Veicular vs Seguro Tradicional
          </h2>
          <p className="mt-4 text-lg text-[#64748B]">
            Entenda por que milhares de cariocas estão migrando para a proteção veicular
          </p>
        </motion.div>

        <motion.div variants={fadeInUp} className="overflow-hidden rounded-2xl border border-[#E2E8F0] shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-3 bg-[#F0F4FA]">
            <div className="p-2.5 sm:p-4 text-xs sm:text-sm font-semibold text-[#64748B]">Característica</div>
            <div className="p-2.5 sm:p-4 text-center text-xs sm:text-sm font-semibold text-[#293C82]">21Go</div>
            <div className="p-2.5 sm:p-4 text-center text-xs sm:text-sm font-semibold text-[#64748B]">Seguradora</div>
          </div>

          {/* Rows with stagger */}
          {rows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={`grid grid-cols-3 ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} border-t border-[#F0F4FA]`}
            >
              <div className="p-2.5 sm:p-4 text-xs sm:text-sm text-[#1A2754] font-medium">{row.feature}</div>
              <div className="p-2.5 sm:p-4 flex items-center justify-center">
                <CellValue value={row.veicular} positive={true} />
              </div>
              <div className="p-2.5 sm:p-4 flex items-center justify-center">
                <CellValue value={row.seguro} positive={false} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
