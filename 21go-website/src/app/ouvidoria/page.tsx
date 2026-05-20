'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import { MessageSquare, Upload, X, CheckCircle, Loader2, Heart, TrendingUp, Users } from 'lucide-react'

export default function OuvidoriaPage() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [tipo, setTipo] = useState<'reclamacao' | 'sugestao'>('reclamacao')
  const [mensagem, setMensagem] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...newFiles].slice(0, 5))
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function maskPhone(v: string) {
    let d = v.replace(/\D/g, '')
    if (d.startsWith('55') && d.length > 11) {
      d = d.slice(2)
    }
    d = d.slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!nome.trim() || !telefone.trim() || !mensagem.trim()) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('nome', nome)
      formData.append('telefone', telefone.replace(/\D/g, ''))
      formData.append('tipo', tipo)
      formData.append('mensagem', mensagem)
      files.forEach((f) => formData.append('arquivos', f))

      const res = await fetch('/api/ouvidoria', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Erro ao enviar')

      setSuccess(true)
      setNome('')
      setTelefone('')
      setMensagem('')
      setFiles([])
    } catch {
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-white pt-28 pb-20">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-3xl px-6"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#293C82]/5 mb-6">
            <MessageSquare className="h-8 w-8 text-[#293C82]" />
          </div>
          <h1 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]">
            Reclamações e Sugestões
          </h1>
          <p className="mt-3 text-[#64748B] text-lg max-w-xl mx-auto">
            Sua opinião constrói a 21Go que você merece
          </p>
        </motion.div>

        {/* Trust badges */}
        <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Heart, title: 'Queremos ouvir você', desc: 'Cada mensagem é lida pela diretoria' },
            { icon: TrendingUp, title: 'Melhoria contínua', desc: 'Seu feedback vira ação concreta' },
            { icon: Users, title: 'Clientes e equipe', desc: 'Aberto para todos que fazem parte da 21Go' },
          ].map((item) => (
            <div key={item.title} className="flex flex-col items-center text-center p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-[#293C82]/5 flex items-center justify-center mb-2">
                <item.icon className="h-5 w-5 text-[#293C82]" />
              </div>
              <p className="text-xs font-semibold text-[#1A2754] leading-tight">{item.title}</p>
              <p className="text-[10px] text-[#94A3B8] mt-1">{item.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Explicação */}
        <motion.div variants={fadeInUp} className="bg-gradient-to-r from-[#293C82]/5 to-[#F2911D]/5 border border-[#293C82]/10 rounded-xl p-6 mb-8">
          <h2 className="font-[var(--font-outfit)] text-base font-semibold text-[#1A2754] mb-3">
            Por que sua voz importa?
          </h2>
          <p className="text-sm text-[#64748B] leading-relaxed">
            A 21Go tem <strong className="text-[#1A2754]">20+ anos de mercado</strong> porque escuta quem está ao nosso lado.
            Seja uma crítica sobre um atendimento, uma sugestão para melhorar nossos processos, ou um elogio —
            <strong className="text-[#1A2754]"> tudo é lido diretamente pela diretoria</strong> e se transforma em ação.
            Queremos que cada cliente e colaborador sinta que faz parte da evolução da empresa.
          </p>
        </motion.div>

        {success ? (
          <motion.div variants={fadeInUp} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-lg p-10 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="font-[var(--font-outfit)] text-2xl font-bold text-[#1A2754] mb-2">
              Recebemos sua mensagem!
            </h2>
            <p className="text-[#64748B] mb-2">
              Sua {tipo === 'reclamacao' ? 'reclamação' : 'sugestão'} já está com a diretoria.
            </p>
            <p className="text-sm text-[#94A3B8] mb-6">
              Vamos analisar e, se necessário, entraremos em contato pelo telefone informado.
            </p>
            <button
              onClick={() => setSuccess(false)}
              className="px-6 py-3 rounded-lg bg-[#293C82] text-white font-semibold hover:bg-[#163F85] transition-colors"
            >
              Enviar outra mensagem
            </button>
          </motion.div>
        ) : (
          <motion.div variants={fadeInUp}>
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-lg p-6 md:p-8 space-y-5">
              {/* Tipo */}
              <div className="flex gap-3">
                {[
                  { value: 'reclamacao' as const, label: 'Reclamação', emoji: '📢' },
                  { value: 'sugestao' as const, label: 'Sugestão', emoji: '💡' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipo(opt.value)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                      tipo === opt.value
                        ? 'bg-[#293C82] text-white border-[#293C82] shadow-md'
                        : 'bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#293C82]/30'
                    }`}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">Nome completo *</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#293C82]/20 focus:border-[#293C82] transition-all"
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">Telefone / WhatsApp *</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                  placeholder="(21) 99999-9999"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#293C82]/20 focus:border-[#293C82] transition-all"
                />
              </div>

              {/* Mensagem */}
              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">
                  {tipo === 'reclamacao' ? 'Descreva sua reclamação *' : 'Descreva sua sugestão *'}
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={5}
                  placeholder={tipo === 'reclamacao'
                    ? 'Conte o que aconteceu, quando, onde e com quem. Quanto mais detalhes, melhor conseguiremos resolver...'
                    : 'Compartilhe sua ideia. O que podemos fazer melhor? O que você gostaria de ver na 21Go?'}
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#293C82]/20 focus:border-[#293C82] transition-all resize-none"
                />
              </div>

              {/* Upload */}
              <div>
                <label className="block text-sm font-medium text-[#1A2754] mb-1.5">Fotos ou arquivos (opcional)</label>
                <div
                  onClick={() => inputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-[#E2E8F0] rounded-xl cursor-pointer hover:border-[#293C82]/30 hover:bg-[#F8FAFC] transition-all"
                >
                  <Upload className="h-6 w-6 text-[#94A3B8]" />
                  <span className="text-sm text-[#94A3B8]">Clique para enviar (máx. 5 arquivos)</span>
                  <span className="text-xs text-[#C4CDD5]">Imagens, PDF ou documentos</span>
                </div>
                <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFiles} className="hidden" />

                {files.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F0F4FA] rounded-lg text-xs text-[#64748B]">
                        {f.name.slice(0, 25)}{f.name.length > 25 ? '...' : ''}
                        <button type="button" onClick={() => removeFile(i)}>
                          <X className="h-3 w-3 text-[#94A3B8] hover:text-red-500 transition-colors" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[#F2911D] text-white font-semibold hover:bg-[#D67A0F] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_8px_30px_rgba(242, 145, 29,0.3)]"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : 'Enviar'}
              </button>
            </form>
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
