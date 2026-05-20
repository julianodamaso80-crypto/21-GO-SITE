'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import { ShieldAlert, Lock, Eye, EyeOff, CheckCircle, Loader2, Shield } from 'lucide-react'

export default function DenunciaPage() {
  const [assunto, setAssunto] = useState('')
  const [comentario, setComentario] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!assunto.trim() || !comentario.trim()) {
      setError('Preencha todos os campos.')
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    try {
      const res = await fetch('/api/ouvidoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'denuncia', assunto, comentario }),
      })

      if (!res.ok) throw new Error('Erro ao enviar')

      setSuccess(true)
      setAssunto('')
      setComentario('')
    } catch {
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="min-h-screen bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] pt-28 pb-20">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-2xl px-6"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 mb-6">
            <ShieldAlert className="h-8 w-8 text-[#F2911D]" />
          </div>
          <h1 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-white">
            Denúncia Anônima
          </h1>
          <p className="mt-3 text-white/60 text-lg max-w-lg mx-auto">
            Canal seguro e confidencial da 21Go
          </p>
        </motion.div>

        {/* Trust badges */}
        <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Lock, title: 'Sem identificação', desc: 'Nenhum dado pessoal coletado' },
            { icon: EyeOff, title: 'Sem rastreamento', desc: 'IP e cookies não são registrados' },
            { icon: Shield, title: 'Direto à diretoria', desc: 'Lido apenas pela alta gestão' },
          ].map((item) => (
            <div key={item.title} className="flex flex-col items-center text-center p-4 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-sm">
              <item.icon className="h-5 w-5 text-[#F2911D] mb-2" />
              <p className="text-xs font-semibold text-white/90 leading-tight">{item.title}</p>
              <p className="text-[10px] text-white/40 mt-1">{item.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Explicação */}
        <motion.div variants={fadeInUp} className="bg-white/[0.05] border border-white/10 rounded-xl p-6 mb-8 backdrop-blur-sm">
          <h2 className="font-[var(--font-outfit)] text-base font-semibold text-white mb-3">
            Por que este canal existe?
          </h2>
          <p className="text-sm text-white/60 leading-relaxed mb-4">
            A 21Go acredita que a transparência é fundamental para evoluir. Este canal foi criado para que
            <strong className="text-white/80"> clientes, associados e colaboradores</strong> possam reportar
            situações que precisam de atenção — sem medo de retaliação.
          </p>
          <div className="space-y-2.5">
            {[
              'Condutas inadequadas de funcionários ou parceiros',
              'Irregularidades em processos, cobranças ou sinistros',
              'Situações de assédio, discriminação ou abuso',
              'Desvios de conduta, fraudes ou conflitos de interesse',
              'Qualquer situação que comprometa a integridade da empresa',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F2911D] mt-1.5 flex-shrink-0" />
                <span className="text-sm text-white/50">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {success ? (
          <motion.div variants={fadeInUp} className="bg-white rounded-2xl p-10 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="font-[var(--font-outfit)] text-2xl font-bold text-[#1A2754] mb-2">
              Denúncia registrada com segurança
            </h2>
            <p className="text-[#64748B] mb-2">
              Sua denúncia foi recebida e será analisada pela diretoria.
            </p>
            <p className="text-sm text-[#94A3B8] mb-6">
              Nenhum dado seu foi coletado. Sua identidade está protegida.
            </p>
            <button
              onClick={() => setSuccess(false)}
              className="px-6 py-3 rounded-lg bg-[#1A2754] text-white font-semibold hover:bg-[#081632] transition-colors"
            >
              Fazer outra denúncia
            </button>
          </motion.div>
        ) : (
          <motion.div variants={fadeInUp}>
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">Assunto *</label>
                <input
                  type="text"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Sobre o que é a denúncia?"
                  className="w-full px-4 py-3 rounded-lg border border-[#E2E8F0] text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#293C82]/20 focus:border-[#293C82] transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">Descreva a situação *</label>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={7}
                  placeholder="Descreva com detalhes o que aconteceu, quando, onde e quem estava envolvido. Quanto mais informação, melhor conseguiremos investigar..."
                  className="w-full px-4 py-3 rounded-lg border border-[#E2E8F0] text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#293C82]/20 focus:border-[#293C82] transition-all resize-none"
                />
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F0F4FA] text-xs text-[#64748B]">
                <Lock className="h-3.5 w-3.5 text-[#293C82] flex-shrink-0" />
                Este formulário é 100% anônimo. Nenhum dado pessoal, IP ou cookie é coletado.
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-lg bg-[#1A2754] text-white font-semibold hover:bg-[#081632] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : (
                  <>
                    <ShieldAlert className="h-4 w-4" />
                    Enviar Denúncia Anônima
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
