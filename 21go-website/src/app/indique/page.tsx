'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import {
  Share2,
  ShieldCheck,
  Gift,
  Rocket,
  MessageCircle,
  Crown,
  Star,
  Medal,
  Award,
  Percent,
  ArrowRight,
  Users,
  Check,
} from 'lucide-react'

const fadeInUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }

const steps = [
  { icon: Share2, title: 'Compartilhe', description: 'Envie seu link exclusivo para amigos, familiares e conhecidos.' },
  { icon: ShieldCheck, title: 'Amigo Fecha', description: 'Quando seu indicado ativa a proteção e paga a primeira mensalidade.' },
  { icon: Gift, title: 'Ganhe Desconto', description: '10% de desconto na sua mensalidade. Acumula até 100%!' },
]

const tiers = [
  { icon: Medal, name: 'Bronze', range: '1-2 indicações', discount: '10-20%', color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/20', gradient: 'from-amber-600/10 to-amber-600/5' },
  { icon: Star, name: 'Prata', range: '3-5 indicações', discount: '30-50%', color: 'text-[#94A3B8]', bg: 'bg-[#94A3B8]/10', border: 'border-[#94A3B8]/20', gradient: 'from-[#94A3B8]/10 to-[#94A3B8]/5' },
  { icon: Award, name: 'Ouro', range: '6-9 indicações', discount: '60-90%', color: 'text-[#FBBF24]', bg: 'bg-[#FBBF24]/10', border: 'border-[#FBBF24]/20', gradient: 'from-[#FBBF24]/10 to-[#FBBF24]/5' },
  { icon: Crown, name: 'Diamante', range: '10+ indicações', discount: '100%', color: 'text-[#3D72DE]', bg: 'bg-[#3D72DE]/10', border: 'border-[#3D72DE]/20', gradient: 'from-[#3D72DE]/10 to-[#3D72DE]/5' },
]

const discountRows = [
  { friends: 1, discount: '10%', monthly: 'R$ 204' },
  { friends: 2, discount: '20%', monthly: 'R$ 182' },
  { friends: 3, discount: '30%', monthly: 'R$ 159' },
  { friends: 5, discount: '50%', monthly: 'R$ 114' },
  { friends: 7, discount: '70%', monthly: 'R$ 68' },
  { friends: 10, discount: '100%', monthly: 'GRÁTIS' },
]

export default function IndiquePage() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#121A33] via-[#1B284A] to-[#375191] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#F7963D]/15 blur-[120px]" />
          <div className="absolute bottom-0 -left-32 w-[500px] h-[500px] rounded-full bg-[#375191]/30 blur-[150px]" />
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-repeat opacity-[0.04]" />
        </div>

        <motion.div
          ref={ref}
          variants={stagger}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="relative z-10 max-w-4xl mx-auto px-6 text-center"
        >
          <motion.div variants={fadeInUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#F7963D]/20 bg-[#F7963D]/10 px-5 py-2.5 text-sm font-semibold text-[#F9A95E] mb-6">
              <Rocket className="w-4 h-4" />
              Member Get Member
            </span>
          </motion.div>

          <motion.h1 variants={fadeInUp} className="font-[var(--font-display)] text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Indique Amigos e Ganhe até{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F7963D] to-[#F9A95E]">
              100% de Desconto
            </span>
          </motion.h1>

          <motion.p variants={fadeInUp} className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
            A cada amigo que fechar a proteção e pagar a primeira mensalidade, você ganha <strong className="text-[#F7963D] font-semibold">10% de desconto</strong> na sua. Acumula. 10 amigos = proteção <strong className="text-[#10B981] font-semibold">GRÁTIS</strong>.
          </motion.p>

          <motion.div variants={fadeInUp}>
            <a href="https://wa.me/5521969454824?text=Ol%C3%A1!%20Quero%20meu%20link%20de%20indica%C3%A7%C3%A3o%20do%20programa%20Member%20Get%20Member.%20Meu%20nome%3A%20" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold rounded-full shadow-lg shadow-[#F7963D]/20 hover:shadow-xl hover:shadow-[#F7963D]/30 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <MessageCircle className="w-5 h-5" />
              Quero Meu Link de Indicação
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Simples</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33] mb-3">Como funciona</h2>
            <p className="text-[#64748B]">Três passos para começar a economizar.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <div key={step.title} className="relative bg-white rounded-2xl border border-[#E8ECF4] p-8 text-center hover:shadow-lg hover:shadow-black/[0.03] transition-all">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#F7963D] text-white text-xs font-bold flex items-center justify-center">{i + 1}</div>
                <div className="w-14 h-14 rounded-2xl bg-[#F7963D]/5 flex items-center justify-center mx-auto mb-5">
                  <step.icon className="w-7 h-7 text-[#F7963D]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#121A33] mb-2">{step.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

          {/* Important note */}
          <div className="mt-8 bg-[#F7963D]/5 border border-[#F7963D]/15 rounded-xl p-5 flex items-start gap-3 max-w-2xl mx-auto">
            <Check className="w-5 h-5 text-[#F7963D] mt-0.5 flex-shrink-0" />
            <p className="text-sm text-[#64748B]">
              <strong className="text-[#121A33]">Importante:</strong> o desconto é ativado quando o indicado paga a primeira mensalidade. O desconto é aplicado na sua próxima fatura.
            </p>
          </div>
        </div>
      </section>

      {/* Tier badges */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Níveis</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33] mb-3">Quanto mais indica, mais ganha</h2>
            <p className="text-[#64748B]">Suba de nível e veja seu desconto crescer.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {tiers.map((tier) => (
              <div key={tier.name} className={`bg-gradient-to-b ${tier.gradient} rounded-2xl border ${tier.border} p-6 text-center hover:scale-[1.03] transition-transform`}>
                <div className={`w-14 h-14 rounded-2xl ${tier.bg} border ${tier.border} flex items-center justify-center mx-auto mb-4`}>
                  <tier.icon className={`w-7 h-7 ${tier.color}`} />
                </div>
                <h3 className={`font-[var(--font-display)] text-lg font-bold ${tier.color} mb-1`}>{tier.name}</h3>
                <p className="text-xs text-[#94A3B8] mb-3">{tier.range}</p>
                <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full ${tier.bg} border ${tier.border}`}>
                  <Percent className={`w-3 h-3 ${tier.color}`} />
                  <span className={`font-[var(--font-display)] text-sm font-bold ${tier.color}`}>{tier.discount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discount calculator */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Simulação</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33] mb-3">Veja quanto você economiza</h2>
            <p className="text-[#64748B]">Exemplo com plano VIP (R$227/mês)</p>
          </div>

          <div className="rounded-2xl border border-[#E8ECF4] overflow-hidden shadow-sm bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-[#121A33]">
                  <th className="text-left text-sm font-semibold text-white/70 px-6 py-4">Amigos</th>
                  <th className="text-center text-sm font-semibold text-white/70 px-6 py-4">Desconto</th>
                  <th className="text-right text-sm font-semibold text-white/70 px-6 py-4">Você Paga</th>
                </tr>
              </thead>
              <tbody>
                {discountRows.map((row, i) => (
                  <tr key={row.friends} className={`border-t border-[#E8ECF4] ${row.monthly === 'GRÁTIS' ? 'bg-[#10B981]/5' : i % 2 === 0 ? '' : 'bg-[#F7F8FC]'}`}>
                    <td className="text-sm text-[#475569] px-6 py-3.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#94A3B8]" />
                        {row.friends} {row.friends === 1 ? 'amigo' : 'amigos'}
                      </span>
                    </td>
                    <td className="text-sm text-[#F7963D] text-center px-6 py-3.5 font-bold">{row.discount}</td>
                    <td className={`text-sm text-right px-6 py-3.5 font-bold ${row.monthly === 'GRÁTIS' ? 'text-[#10B981] text-base' : 'text-[#121A33]'}`}>
                      {row.monthly}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-b from-[#121A33] to-[#375191] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[#F7963D]/10 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-[var(--font-display)] text-3xl md:text-4xl font-bold text-white mb-4">
            Pronto para indicar?
          </h2>
          <p className="text-lg text-white/50 mb-8">
            Entre em contato pelo WhatsApp e solicite seu link exclusivo de indicação.
          </p>
          <a href="https://wa.me/5521969454824?text=Ol%C3%A1!%20Quero%20meu%20link%20de%20indica%C3%A7%C3%A3o.%20Meu%20nome%3A%20" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold rounded-full shadow-lg shadow-[#F7963D]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all">
            <MessageCircle className="w-5 h-5" />
            Quero Meu Link
          </a>
        </div>
      </section>
    </>
  )
}
