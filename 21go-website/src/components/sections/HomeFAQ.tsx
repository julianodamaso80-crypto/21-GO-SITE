'use client'

import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const faqs = [
  { q: 'O que é proteção veicular?', a: 'Proteção veicular é um sistema cooperativo (mutualismo) onde associados dividem os custos de eventos. Diferente do seguro tradicional, não há análise de perfil e o custo é significativamente menor.' },
  { q: 'Qual a diferença entre proteção veicular e seguro?', a: 'O seguro é oferecido por seguradoras com análise de perfil e preços altos. A proteção veicular funciona por mutualismo: todos contribuem para um fundo comum, o que reduz o custo em até 60%.' },
  { q: 'Como funciona o mutualismo?', a: 'Todos os associados contribuem mensalmente para um fundo comum. Quando alguém sofre um evento (roubo, colisão etc.), o fundo cobre. Quanto mais associados, menor o custo para cada um.' },
  { q: 'Quanto custa a proteção veicular na 21Go?', a: 'Para carros a partir de R$106,50/mês (Básico) e para motos a partir de R$77,50/mês. Temos 8 planos para todos os tipos de veículos. Faça uma simulação gratuita em 30 segundos.' },
  { q: 'Como aciono o guincho?', a: 'Basta ligar para nossa central 24h ou usar o app. O guincho atende em todo o Brasil com até 200km inclusos em todos os planos.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Não existe fidelidade nem multa por cancelamento. Você pode cancelar quando quiser, sem burocracia.' },
  { q: 'A 21Go aceita carros antigos?', a: 'Sim! Diferente das seguradoras que recusam veículos acima de 10 anos, a 21Go protege qualquer carro, qualquer ano, sem análise de perfil.' },
  { q: 'O que é a 21Go?', a: 'A 21Go é uma associação de proteção veicular com mais de 20 anos de mercado no Rio de Janeiro. Funcionamos por mutualismo, oferecendo proteção completa a preços justos com tecnologia e atendimento humano.' },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${open ? 'border-[#293C82]/30 shadow-sm' : 'border-[#E2E8F0]'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-[#FAFBFC] transition-colors"
      >
        <span className="text-sm font-semibold text-[#1A2754] pr-4">{q}</span>
        <ChevronDown className={`h-5 w-5 text-[#64748B] flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180 text-[#293C82]' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="px-5 pb-5 text-sm text-[#64748B] leading-relaxed border-t border-[#F0F4FA] pt-4">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function HomeFAQ() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-[#F0F4FA] py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-3xl px-6"
      >
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#293C82]">
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-lg text-[#64748B]">Tire suas dúvidas sobre proteção veicular</p>
        </motion.div>

        <motion.div variants={fadeInUp} className="space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
