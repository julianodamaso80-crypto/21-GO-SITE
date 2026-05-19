'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Briefcase,
  TrendingUp,
  Trophy,
  DollarSign,
  Users,
  Repeat,
  Target,
  Rocket,
  MessageCircle,
  Check,
  ArrowRight,
  Star,
  Zap,
  ShieldCheck,
  Clock,
  X,
  Loader2,
  AlertCircle,
  Mail,
  User,
} from 'lucide-react'
import { trackWhatsAppClick } from '@/lib/tracking'

function maskPhone(v: string) {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) {
    d = d.slice(2)
  }
  d = d.slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function isValidWhatsApp(v: string): string | null {
  const digits = v.replace(/\D/g, '')
  if (digits.length < 11) return 'WhatsApp incompleto. Informe DDD + 9 dígitos'
  const ddd = parseInt(digits.slice(0, 2))
  if (ddd < 11 || ddd > 99) return 'DDD inválido'
  if (digits[2] !== '9') return 'Celular deve começar com 9 depois do DDD'
  return null
}

const fadeInUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }

const benefits = [
  {
    icon: DollarSign,
    title: 'Comissão na Adesão',
    description: 'Ganhe uma comissão por cada novo associado que você trouxer para a 21Go.',
  },
  {
    icon: Repeat,
    title: 'Renda Recorrente',
    description: 'Receba mensalmente enquanto seus indicados permanecerem ativos. Renda que cresce.',
  },
  {
    icon: Trophy,
    title: 'Prêmios por Meta',
    description: 'Bata metas e ganhe bônus extras, viagens e prêmios exclusivos.',
  },
  {
    icon: Zap,
    title: 'Treinamento Completo',
    description: 'Capacitação gratuita sobre proteção veicular, técnicas de venda e nossos produtos.',
  },
  {
    icon: ShieldCheck,
    title: 'Produto que Vende',
    description: 'Proteção veicular é necessidade real. Sem análise de perfil, sem burocracia. Fácil de vender.',
  },
  {
    icon: Clock,
    title: 'Flexibilidade Total',
    description: 'Trabalhe no seu horário, de qualquer lugar. Sem chefe, sem escritório, sem limite de ganho.',
  },
]

const howItWorks = [
  { step: '01', title: 'Cadastre-se', description: 'Preencha seus dados e entre para o time de consultores 21Go.' },
  { step: '02', title: 'Treine', description: 'Receba treinamento completo sobre nossos planos e como vender.' },
  { step: '03', title: 'Venda', description: 'Use nosso sistema e materiais prontos para atrair clientes.' },
  { step: '04', title: 'Ganhe', description: 'Comissão na adesão + recorrente mensal + prêmios por meta.' },
]


const testimonials = [
  { name: 'Rodrigo M.', role: 'Consultor há 8 meses', text: 'Comecei nas horas vagas e hoje é minha principal renda. O recorrente faz toda a diferença.' },
  { name: 'Carla S.', role: 'Consultora há 1 ano', text: 'O produto vende sozinho. Sem análise de perfil, preço justo. Os clientes agradecem.' },
  { name: 'Thiago R.', role: 'Consultor há 6 meses', text: 'Bati a meta do primeiro trimestre e ganhei um bônus incrível. O suporte é sensacional.' },
]

export default function SejaConsultorPage() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [modalOpen, setModalOpen] = useState(false)
  const openModal = useCallback(() => setModalOpen(true), [])
  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#121A33] via-[#1B284A] to-[#375191] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#F7963D]/15 blur-[120px]" />
          <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full bg-[#375191]/30 blur-[150px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[#C9A84C]/10 blur-[100px]" />
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
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/20 bg-[#C9A84C]/10 px-5 py-2.5 text-sm font-semibold text-[#C9A84C] mb-6">
              <Briefcase className="w-4 h-4" />
              Oportunidade
            </span>
          </motion.div>

          <motion.h1 variants={fadeInUp} className="font-[var(--font-display)] text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Seja Consultor{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F7963D] to-[#F9A95E]">
              21Go
            </span>
          </motion.h1>

          <motion.p variants={fadeInUp} className="text-lg text-white/50 max-w-2xl mx-auto mb-4">
            Venda nossos planos de proteção veicular e construa uma renda sólida. Comissão na adesão, recorrente mensal e prêmios por meta batida.
          </motion.p>

          <motion.p variants={fadeInUp} className="text-base text-[#C9A84C] font-semibold mb-10">
            Sem limite de ganho. Quanto mais vender, mais ganha.
          </motion.p>

          <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold rounded-full shadow-lg shadow-[#F7963D]/20 hover:shadow-xl hover:shadow-[#F7963D]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-5 h-5" />
              Quero Ser Consultor
            </button>
            <a href="#como-funciona" className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-white/15 bg-white/5 text-white font-semibold text-sm hover:bg-white/10 transition-all">
              Saiba mais <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Numbers bar */}
      <section className="py-8 bg-white border-b border-[#E8ECF4]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: '200+', label: 'Consultores ativos' },
              { value: 'R$ 3K+', label: 'Ganho médio mensal' },
              { value: '20+', label: 'Anos de mercado' },
              { value: '100%', label: 'Suporte ao consultor' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-[var(--font-display)] text-2xl md:text-3xl font-bold text-[#121A33]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Vantagens</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33] mb-3">Por que ser consultor 21Go?</h2>
            <p className="text-[#64748B] max-w-xl mx-auto">Um modelo de negócio que remunera bem, cresce com você e tem produto que o cliente precisa.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b) => (
              <div key={b.title} className="bg-white rounded-2xl border border-[#E8ECF4] p-7 hover:shadow-lg hover:shadow-black/[0.03] hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-[#375191]/5 flex items-center justify-center mb-5">
                  <b.icon className="w-6 h-6 text-[#375191]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#121A33] mb-2">{b.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Processo</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33] mb-3">Como funciona</h2>
            <p className="text-[#64748B]">Do cadastro à primeira comissão em 4 passos.</p>
          </div>

          <div className="space-y-6">
            {howItWorks.map((item, i) => (
              <div key={item.step} className="flex items-start gap-5 bg-[#F7F8FC] rounded-2xl border border-[#E8ECF4] p-6 hover:bg-white hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#375191] to-[#3D72DE] text-white font-[var(--font-display)] text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#121A33] mb-1">{item.title}</h3>
                  <p className="text-sm text-[#64748B]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* spacer between sections */}

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Depoimentos</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33]">Quem já é consultor</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-[#F7F8FC] rounded-2xl border border-[#E8ECF4] p-7">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-4 h-4 text-[#FBBF24] fill-[#FBBF24]" />
                  ))}
                </div>
                <p className="text-sm text-[#475569] leading-relaxed mb-5 italic">&ldquo;{t.text}&rdquo;</p>
                <div>
                  <p className="font-semibold text-[#121A33] text-sm">{t.name}</p>
                  <p className="text-xs text-[#94A3B8]">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F7963D] bg-[#F7963D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">Suporte</span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#121A33]">O que você recebe</h2>
          </div>

          <div className="bg-white rounded-2xl border border-[#E8ECF4] p-8 space-y-4">
            {[
              'Treinamento completo em proteção veicular e vendas',
              'Material de divulgação pronto (artes, textos, vídeos)',
              'Acesso ao sistema de simulação e acompanhamento de associados',
              'Suporte dedicado via WhatsApp com nosso time comercial',
              'Comissão por adesão + recorrente mensal por cliente ativo',
              'Bônus e prêmios exclusivos por metas batidas',
              'Sem investimento inicial. Comece a vender hoje',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-[#10B981]" />
                </div>
                <span className="text-[15px] text-[#475569]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-b from-[#121A33] to-[#375191] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[#F7963D]/10 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-[var(--font-display)] text-3xl md:text-4xl font-bold text-white mb-4">
            Pronto para ganhar dinheiro com a 21Go?
          </h2>
          <p className="text-lg text-white/50 mb-10">
            Entre em contato agora e comece a construir sua renda como consultor de proteção veicular.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2.5 px-10 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold text-lg rounded-full shadow-lg shadow-[#F7963D]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            Quero Ser Consultor
          </button>
        </div>
      </section>

      <ConsultorModal open={modalOpen} onClose={closeModal} />
    </>
  )
}

/* ─── Modal de cadastro do consultor ─── */
function ConsultorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ nome: '', email: '', contato: '', cidade: '', estado: '', experiencia: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const set = useCallback((field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }, [])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.nome.trim()) e.nome = 'Informe seu nome completo'
    if (!form.email.trim()) e.email = 'Informe seu e-mail'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'E-mail inválido'
    if (!form.cidade.trim()) e.cidade = 'Informe sua cidade'
    if (!form.estado.trim()) e.estado = 'UF'
    const phoneErr = isValidWhatsApp(form.contato)
    if (phoneErr) e.contato = phoneErr
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setServerError('')
    if (!validate()) return
    setLoading(true)

    // Monta link do WhatsApp com tudo que ele preencheu (incluindo experiência)
    const expLine = form.experiencia.trim()
      ? `\nJá trabalhei com proteção veicular: ${form.experiencia.trim()}`
      : ''
    const waText = `Olá! Acabei de me cadastrar como consultor 21Go.\nNome: ${form.nome}\nE-mail: ${form.email}\nWhatsApp: ${form.contato}\nLocal: ${form.cidade} - ${form.estado}${expLine}`
    const waUrl = `https://wa.me/5521969454824?text=${encodeURIComponent(waText)}`

    // Tracking ANTES de abrir a janela — caso o popup blocker mate o gesto
    // ou o usuario navegue, o evento ja foi pra dataLayer + /api/track.
    trackWhatsAppClick('seja_consultor_form_submit', {
      buttonText: 'Quero me cadastrar como consultor',
    })

    // Abre o WhatsApp imediatamente (precisa rodar dentro do gesto do clique
    // pra não ser bloqueado por popup blocker)
    const waWindow = window.open(waUrl, '_blank')

    try {
      // Dispara em paralelo pro nosso backend e pro Google Sheets (Planilha)
      const googleUrl = 'https://script.google.com/macros/s/AKfycbx_WBlHRFcVvzv3VuqmNufGPL2-27A2Q3s5vOHp7Ds8PcYySkmnfxd1rLKpdFdOBtsLow/exec'
      
      await Promise.all([
        // Envia pra planilha
        fetch(googleUrl, {
          method: 'POST',
          mode: 'no-cors', // Evita bloqueio do navegador (CORS)
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            nome: form.nome,
            email: form.email,
            whatsapp: form.contato,
            cidade: form.cidade,
            estado: form.estado,
            experiencia: form.experiencia
          }),
        }).catch(() => {}), // ignora falhas da planilha pra não travar

        // Envia pro backend original (se existir)
        fetch('/api/consultor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }).catch(() => {})
      ])

      setSubmitted(true)
    } catch {
      // Mesmo com falha, o WhatsApp já abriu — então
      // a venda não trava. Apenas registra o erro silenciosamente e segue.
      setSubmitted(true)
      void waWindow
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    onClose()
    // reset depois do fade-out pra não piscar
    setTimeout(() => {
      setForm({ nome: '', email: '', contato: '', cidade: '', estado: '', experiencia: '' })
      setErrors({})
      setSubmitted(false)
      setServerError('')
    }, 200)
  }

  if (!open) return null

  const waFallbackText = `Olá! Acabei de me cadastrar como consultor 21Go.\nNome: ${form.nome}\nE-mail: ${form.email}\nWhatsApp: ${form.contato}\nLocal: ${form.cidade} - ${form.estado}${form.experiencia.trim() ? `\nJá trabalhei com proteção veicular: ${form.experiencia.trim()}` : ''}`
  const waLink = `https://wa.me/5521969454824?text=${encodeURIComponent(waFallbackText)}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultor-modal-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#121A33]/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={handleClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 w-9 h-9 rounded-full bg-[#F7F8FC] text-[#64748B] hover:bg-[#E8ECF4] hover:text-[#121A33] flex items-center justify-center transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            <div className="mb-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#F7963D]/10 px-3 py-1 text-xs font-bold text-[#F7963D] uppercase tracking-wider mb-3">
                <Briefcase className="w-3.5 h-3.5" />
                Cadastro
              </span>
              <h2 id="consultor-modal-title" className="font-[var(--font-display)] text-2xl font-bold text-[#121A33] mb-2">
                Quero ser Consultor 21Go
              </h2>
              <p className="text-sm text-[#64748B]">
                Preencha seus dados que entramos em contato pelo WhatsApp.
              </p>
            </div>

            <div className="space-y-4">
              <Field
                label="Nome completo"
                name="nome"
                value={form.nome}
                onChange={(v) => set('nome', v)}
                placeholder="Seu nome completo"
                error={errors.nome}
                icon={<User className="w-4 h-4 text-[#94A3B8]" />}
                disabled={loading}
              />
              <Field
                label="E-mail"
                name="email"
                type="email"
                value={form.email}
                onChange={(v) => set('email', v)}
                placeholder="seu@email.com"
                error={errors.email}
                icon={<Mail className="w-4 h-4 text-[#94A3B8]" />}
                disabled={loading}
              />
              <Field
                label="WhatsApp"
                name="contato"
                value={form.contato}
                onChange={(v) => set('contato', maskPhone(v))}
                placeholder="(21) 99999-9999"
                error={errors.contato}
                icon={<MessageCircle className="w-4 h-4 text-[#25D366]" />}
                disabled={loading}
              />
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <Field
                    label="Cidade"
                    name="cidade"
                    value={form.cidade}
                    onChange={(v) => set('cidade', v)}
                    placeholder="Sua cidade"
                    error={errors.cidade}
                    disabled={loading}
                  />
                </div>
                <div className="w-24">
                  <Field
                    label="Estado"
                    name="estado"
                    value={form.estado}
                    onChange={(v) => set('estado', v.toUpperCase().slice(0, 2))}
                    placeholder="UF"
                    error={errors.estado}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="experiencia" className="block text-sm font-semibold text-[#121A33] mb-2">
                  Você já trabalhou com proteção veicular antes?
                  <span className="text-[#94A3B8] font-normal"> (opcional)</span>
                </label>
                <textarea
                  id="experiencia"
                  value={form.experiencia}
                  onChange={(e) => set('experiencia', e.target.value)}
                  placeholder="Ex: trabalhei 2 anos em outra associação de proteção veicular, ou nunca trabalhei mas tenho interesse..."
                  rows={4}
                  disabled={loading}
                  className="w-full px-5 py-3.5 rounded-2xl border-2 border-[#D1DFFA] hover:border-[#375191]/40 text-[#121A33] text-[15px] placeholder:text-[#94A3B8] bg-[#F7F8FC] focus:outline-none focus:border-[#375191] focus:bg-white focus:shadow-[0_0_0_3px_rgba(55,81,145,0.1)] transition-all duration-200 disabled:opacity-50 resize-none"
                />
              </div>
            </div>

            {serverError && (
              <div className="mt-5 flex items-start gap-3 p-4 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="font-medium">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold rounded-full shadow-lg shadow-[#F7963D]/20 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5" />
                  Enviar Cadastro
                </>
              )}
            </button>

            <p className="mt-4 text-[11px] text-center text-[#94A3B8]">
              Seus dados estão seguros. Sem spam.
            </p>
          </form>
        ) : (
          <div className="p-6 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#10B981]/10 mb-5">
              <Check className="w-8 h-8 text-[#10B981]" />
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-[#121A33] mb-3">
              Obrigado, {form.nome.split(' ')[0]}!
            </h2>
            <p className="text-[#64748B] mb-6 leading-relaxed">
              Acabamos de abrir o WhatsApp pra você finalizar a conversa com nosso time.
              Se nada apareceu, clique no botão abaixo.
            </p>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWhatsAppClick('seja_consultor_fallback', { buttonText: 'Abrir WhatsApp (fallback)' })}
              className="inline-flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#25D366] to-[#20BD5A] text-white font-bold rounded-full shadow-lg shadow-[#25D366]/20 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all mb-3"
            >
              <MessageCircle className="w-5 h-5" />
              Abrir WhatsApp
            </a>
            <button
              onClick={handleClose}
              className="text-sm text-[#64748B] hover:text-[#121A33] transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Campo de input do modal ─── */
function Field({
  label, name, value, onChange, placeholder, type = 'text', icon, error, disabled,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  icon?: React.ReactNode
  error?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold text-[#121A33] mb-2">{label}</label>
      <div className="relative">
        {icon && <div className="absolute left-5 top-1/2 -translate-y-1/2">{icon}</div>}
        <input
          id={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full ${icon ? 'pl-12' : 'px-5'} pr-5 py-3.5 rounded-2xl border-2 text-[#121A33] text-[15px] font-medium placeholder:text-[#94A3B8] bg-[#F7F8FC] focus:outline-none focus:border-[#375191] focus:bg-white focus:shadow-[0_0_0_3px_rgba(55,81,145,0.1)] transition-all duration-200 disabled:opacity-50 ${
            error ? 'border-[#EF4444] bg-[#FEF2F2]' : 'border-[#D1DFFA] hover:border-[#375191]/40'
          }`}
        />
      </div>
      {error && <p className="mt-1.5 ml-4 text-xs text-[#EF4444] font-medium">{error}</p>}
    </div>
  )
}
