'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Bot, Clock, Zap, MessageCircle } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const features = [
  { icon: Zap, title: 'Simulação em 30 segundos', desc: 'Resposta instantânea com cálculo pela tabela FIPE' },
  { icon: Clock, title: 'Disponível 24/7', desc: 'Atendimento a qualquer hora, inclusive feriados' },
  { icon: MessageCircle, title: 'Suporte inteligente', desc: 'Tire dúvidas sobre benefícios, eventos e planos' },
]

export function AIShowcase() {
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
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — text */}
          <motion.div variants={fadeInUp}>
            <div className="inline-flex items-center gap-2 bg-[#293C82]/5 rounded-full px-4 py-2 mb-6">
              <Bot className="h-4 w-4 text-[#293C82]" />
              <span className="text-sm font-medium text-[#293C82]">Diferencial exclusivo</span>
            </div>
            <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]">
              Atendimento inteligente 24 horas
            </h2>
            <p className="mt-4 text-lg text-[#64748B] leading-relaxed">
              Nossa IA foi treinada com 20+ anos de experiência em proteção veicular no Rio. Nenhum concorrente oferece isso.
            </p>
            <div className="mt-8 space-y-5">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  variants={fadeInUp}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#F2911D]/5 flex items-center justify-center">
                    <f.icon className="h-5 w-5 text-[#F2911D]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1A2754]">{f.title}</h3>
                    <p className="text-sm text-[#64748B]">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right — chat mockup */}
          <motion.div variants={fadeInUp} className="relative">
            <div className="bg-[#F0F4FA] rounded-2xl p-6 border border-[#E2E8F0] shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E2E8F0]">
                <div className="w-10 h-10 rounded-full bg-[#293C82] flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A2754]">Assistente 21Go</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    <p className="text-xs text-[#10B981]">Online agora</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-[#293C82] text-white text-sm rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                    Quanto custa proteger um HB20 2022?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white text-[#1A2754] text-sm rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] border border-[#E2E8F0]">
                    Para um HB20 2022, temos 4 opções: Básico R$172,70/mês, Do Seu Jeito R$184,70/mês, VIP R$227,41/mês ou Premium R$292,53/mês. O VIP é o mais escolhido!
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-[#293C82] text-white text-sm rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                    O Completo cobre batida?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white text-[#1A2754] text-sm rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] border border-[#E2E8F0]">
                    Sim! O Completo cobre colisão total e parcial, roubo, incêndio, guincho 200km e carro reserva por 7 dias. Quer fazer a simulação agora?
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
