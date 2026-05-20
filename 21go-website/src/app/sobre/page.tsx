'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import {
  Shield,
  Heart,
  Eye,
  Target,
  Users,
  ArrowRight,
} from 'lucide-react'
import { NumberTicker } from '@/components/ui/NumberTicker'

const fadeInUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }

const milestones = [
  { year: '2003', title: 'Fundação', description: 'A 21Go nasce no Rio de Janeiro como associação de proteção veicular.' },
  { year: '2008', title: '1.000 Associados', description: 'Alcançamos a marca de mil veículos protegidos na região metropolitana.' },
  { year: '2015', title: 'Expansão RJ', description: 'Atuação em todo o estado do Rio de Janeiro com rede de oficinas credenciadas.' },
  { year: '2020', title: 'Transformação Digital', description: 'Início da digitalização com atendimento por WhatsApp e sistemas integrados.' },
  { year: '2025', title: 'IA e Tecnologia', description: 'Lançamento da plataforma com inteligência artificial e simulação automática.' },
]

const stats = [
  { value: '20+', label: 'Anos de Mercado' },
  { value: '5.000+', label: 'Veículos Protegidos' },
  { value: '3.500+', label: 'Eventos Resolvidos' },
  { value: '98%', label: 'Satisfação' },
]

const values = [
  { icon: Shield, title: 'Proteção', description: 'Nosso compromisso é garantir que todo associado se sinta seguro e amparado.' },
  { icon: Heart, title: 'Mutualismo', description: 'Todos contribuem, todos se beneficiam. Juntos somos mais fortes.' },
  { icon: Eye, title: 'Transparência', description: 'Processos claros, comunicação aberta e prestação de contas constante.' },
  { icon: Target, title: 'Inovação', description: 'Investimos em tecnologia para oferecer a melhor experiência possível.' },
]

export default function SobrePage() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#293C82]/20 blur-[150px]" />
          <div className="absolute bottom-0 -left-32 w-[500px] h-[500px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
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
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F2911D]" />
              Quem somos
            </span>
          </motion.div>
          <motion.h1 variants={fadeInUp} className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
            Sobre a 21Go{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3D72DE] to-[#6B96EB]">Proteção Veicular</span>
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-lg text-white/50 max-w-2xl mx-auto">
            Há mais de 20 anos protegendo veículos no Rio de Janeiro com transparência, tecnologia e o poder do mutualismo.
          </motion.p>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="py-10 bg-white border-b border-[#E8ECF4]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-[var(--font-display)] text-3xl md:text-4xl font-bold text-[#1A2754]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">História</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-3">Nossa trajetória</h2>
            <p className="text-[#64748B]">Duas décadas de compromisso com a proteção dos cariocas.</p>
          </div>

          <div className="space-y-6">
            {milestones.map((item) => (
              <div key={item.year} className="flex items-start gap-3 sm:gap-5 bg-white rounded-2xl border border-[#E8ECF4] p-4 sm:p-6 hover:shadow-md transition-all">
                <div className="w-16 h-12 rounded-xl bg-[#293C82] text-white font-[var(--font-display)] text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {item.year}
                </div>
                <div>
                  <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#1A2754] mb-1">{item.title}</h3>
                  <p className="text-sm text-[#64748B]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission + Vision */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Valores</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754]">No que acreditamos</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-[#293C82]/5 border border-[#293C82]/15 rounded-2xl p-8">
              <div className="w-12 h-12 rounded-xl bg-[#293C82]/10 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-[#293C82]" />
              </div>
              <h3 className="font-[var(--font-display)] text-xl font-bold text-[#1A2754] mb-2">Missão</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">
                Democratizar a proteção veicular no Rio de Janeiro, oferecendo proteção acessível e atendimento humanizado a todos os motoristas, independente de perfil ou histórico.
              </p>
            </div>
            <div className="bg-[#F2911D]/5 border border-[#F2911D]/15 rounded-2xl p-8">
              <div className="w-12 h-12 rounded-xl bg-[#F2911D]/10 flex items-center justify-center mb-4">
                <Eye className="w-6 h-6 text-[#F2911D]" />
              </div>
              <h3 className="font-[var(--font-display)] text-xl font-bold text-[#1A2754] mb-2">Visão</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">
                Ser a maior e mais confiável associação de proteção veicular do Rio de Janeiro, referência em tecnologia e satisfação do associado.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {values.map((v) => (
              <div key={v.title} className="bg-[#F7F8FC] rounded-2xl border border-[#E8ECF4] p-6 text-center hover:shadow-md hover:-translate-y-1 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white border border-[#E8ECF4] flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-5 h-5 text-[#293C82]" />
                </div>
                <h4 className="font-[var(--font-display)] text-sm font-semibold text-[#1A2754] mb-1">{v.title}</h4>
                <p className="text-xs text-[#94A3B8]">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Equipe</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754]">Quem faz a 21Go acontecer</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { name: 'Equipe Comercial', role: 'Vendas e Atendimento' },
              { name: 'Equipe Operação', role: 'Eventos e Vistorias' },
              { name: 'Equipe Financeiro', role: 'Cobrança e Rateio' },
              { name: 'Equipe Tech', role: 'Tecnologia e IA' },
            ].map((member) => (
              <div key={member.name} className="bg-white rounded-2xl border border-[#E8ECF4] p-6 text-center hover:shadow-md transition-all">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#293C82]/10 to-[#3D72DE]/5 border border-[#293C82]/15 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-[#293C82]" />
                </div>
                <h4 className="font-[var(--font-display)] text-sm font-semibold text-[#1A2754]">{member.name}</h4>
                <p className="text-xs text-[#94A3B8] mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-b from-[#1A2754] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[#F2911D]/10 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-[var(--font-display)] text-3xl md:text-4xl font-bold text-white mb-4">
            Faça parte da 21Go
          </h2>
          <p className="text-lg text-white/50 mb-8">
            Junte-se a milhares de cariocas que confiam na 21Go para proteger seus veículos.
          </p>
          <Link href="/cotacao" className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold rounded-full shadow-lg shadow-[#F2911D]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all">
            Fazer Simulação Grátis <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
