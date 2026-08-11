'use client'

/**
 * Portão de contato — nada abre o WhatsApp sem formulário antes.
 *
 * REGRA (ordem do dono, 07/08/2026): nos dois sites .site o cliente só cai no
 * WhatsApp DEPOIS de preencher e enviar um formulário. Link solto pro
 * `/api/wa` espalhado pelo site enchia os chips de contato anônimo — gente
 * perguntando qualquer coisa, sem nome, sem veículo, sem cotação — e era isso
 * que vinha derrubando os números.
 *
 * Aqui o botão abre um formulário curto (nome + WhatsApp). Só depois de válido
 * a conversa abre, já com os dados dentro da mensagem, e o lead fica gravado.
 */

import { useState } from 'react'
import { MessageCircle, Loader2, X } from 'lucide-react'
import { useConsultor } from '@/components/ConsultorProvider'
import { trackWhatsAppClick } from '@/lib/tracking'

type Props = {
  /** Assunto da conversa — vira a primeira linha da mensagem. */
  assunto: string
  /** Origem pro tracking (ex: 'faq_sidebar'). */
  origin: string
  /** Grava o lead com esta origem (ex: 'faq', 'indicacao'). */
  leadOrigem: string
  /** Título do formulário. */
  titulo?: string
  className?: string
  children: React.ReactNode
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Mesma régua do resto do site: DDD válido + 9 dígitos. */
function phoneError(v: string): string | null {
  const d = v.replace(/\D/g, '')
  if (d.length < 11) return 'Informe DDD + 9 dígitos'
  const ddd = parseInt(d.slice(0, 2), 10)
  if (ddd < 11 || ddd > 99) return 'DDD inválido'
  if (d[2] !== '9') return 'Celular precisa começar com 9'
  return null
}

export function WhatsAppGate({
  assunto,
  origin,
  leadOrigem,
  titulo = 'Antes de falar com a gente',
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  // Site de consultor: o contato e dele, nao do rodizio da casa.
  const consultor = useConsultor()
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [errors, setErrors] = useState<{ nome?: string; whatsapp?: string }>({})
  const [loading, setLoading] = useState(false)

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const e: { nome?: string; whatsapp?: string } = {}
    if (!nome.trim()) e.nome = 'Informe seu nome'
    const pErr = phoneError(whatsapp)
    if (pErr) e.whatsapp = pErr
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setLoading(true)

    const texto = `${assunto}\n\nNome: ${nome.trim()}\nWhatsApp: ${whatsapp}`
    // window.open PRECISA rodar dentro do gesto do clique, senão o navegador
    // trata como popup e bloqueia.
    window.open(`/api/wa?text=${encodeURIComponent(texto)}${consultor ? `&c=${consultor.slug}` : ''}`, '_blank', 'noopener,noreferrer')

    trackWhatsAppClick(origin, { buttonText: titulo })

    fetch('/api/lead-contato', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nome.trim(),
        whatsapp,
        assunto,
        origem: leadOrigem,
      }),
    })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setOpen(false)
        setNome('')
        setWhatsapp('')
      })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#1A2754]/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={ev => ev.stopPropagation()}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 mb-1">
              <h3 className="font-[var(--font-display)] text-xl font-bold text-[#1A2754]">
                {titulo}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="text-[#94A3B8] hover:text-[#1A2754] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#64748B] mb-5">
              Deixe seu nome e WhatsApp. A conversa abre já com seus dados — sem repetir tudo
              de novo pro consultor.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1A2754] mb-1.5">
                  Nome completo
                </label>
                <input
                  value={nome}
                  onChange={ev => setNome(ev.target.value)}
                  placeholder="Seu nome completo"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#D1DFFA] bg-[#F7F8FC] text-[#1A2754] placeholder:text-[#94A3B8] focus:border-[#293C82] focus:outline-none transition-colors disabled:opacity-60"
                />
                {errors.nome && (
                  <p className="mt-1.5 ml-1 text-xs text-[#EF4444] font-medium">{errors.nome}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1A2754] mb-1.5">
                  WhatsApp
                </label>
                <input
                  value={whatsapp}
                  onChange={ev => setWhatsapp(maskPhone(ev.target.value))}
                  placeholder="(21) 99999-9999"
                  inputMode="numeric"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#D1DFFA] bg-[#F7F8FC] text-[#1A2754] placeholder:text-[#94A3B8] focus:border-[#293C82] focus:outline-none transition-colors disabled:opacity-60"
                />
                {errors.whatsapp && (
                  <p className="mt-1.5 ml-1 text-xs text-[#EF4444] font-medium">
                    {errors.whatsapp}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-[#10B981] text-white font-bold text-sm hover:bg-[#059669] transition-colors disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Abrindo conversa...
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" /> Abrir conversa no WhatsApp
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
