'use client'
import { useState } from 'react'
import { Loader2, Copy, Check, Share2, Gift } from 'lucide-react'
import { useConsultor } from './ConsultorProvider'

/**
 * O link de indicacao, na hora.
 *
 * Antes o botao abria uma conversa no WhatsApp pedindo "quero meu link", e o
 * link era criado na mao do outro lado. Quem pedia de madrugada nao recebia
 * nada — e indicacao que nao acontece no impulso nao acontece mais.
 *
 * O link sai com o codigo DELA dentro (`?ind=k3m9x2`), entao quando o amigo
 * cotar por ele o sistema sabe quem trouxe. Sem isso, o desconto de 10%
 * dependia de alguem lembrar de quem indicou quem.
 */

export function GeradorLinkIndicacao({ className = '' }: { className?: string }) {
  const consultor = useConsultor()
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/indicacao/gerar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome,
          whatsapp,
          // O link nasce dentro do site de onde ela pediu: assim o amigo dela
          // entra pelo site do mesmo consultor e o lead continua caindo no
          // Power dele.
          consultorSlug: consultor?.slug ?? null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.erro || 'não consegui gerar seu link agora')
      setLink(d.link)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  function copiar() {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  const textoPronto = `Oi! Tô com a 21Go e recomendo demais. Faz sua cotação por aqui: ${link}`

  if (link) {
    return (
      <div className={`w-full max-w-lg mx-auto text-left ${className}`}>
        {/* Branco solido, igual ao formulario: este cartao vive sobre o hero
            AZUL ESCURO do /indique, e com fundo translucido o texto (#1A2754)
            ficava azul-escuro sobre azul-escuro — ilegivel. */}
        <div className="rounded-2xl border border-[#C7D301]/40 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#C7D301] flex items-center justify-center flex-shrink-0">
              <Gift className="w-4.5 h-4.5 text-[#1A2000]" />
            </div>
            <div>
              <p className="font-bold text-[#1A2754]">Seu link está pronto</p>
              <p className="text-xs text-[#64748B]">Cada amigo que fechar por ele te dá 10%</p>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-[#E2E8F0] p-3 mb-3 break-all font-mono text-sm text-[#293C82]">
            {link}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={copiar}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-[#293C82] text-white font-semibold hover:bg-[#1F2F66] transition"
            >
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiado ? 'Copiado!' : 'Copiar link'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(textoPronto)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-[#F2911D] text-white font-semibold hover:bg-[#D67A0F] transition"
            >
              <Share2 className="w-4 h-4" />
              Enviar no WhatsApp
            </a>
          </div>

          <p className="text-xs text-[#64748B] mt-4">
            Guarde este link: ele é seu e não muda. Se pedir de novo com o mesmo WhatsApp, volta o
            mesmo endereço.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={gerar} className={`w-full max-w-md mx-auto text-left ${className}`}>
      <div className="rounded-2xl bg-white/95 border border-[#E2E8F0] p-6 shadow-xl">
        <p className="font-bold text-[#1A2754] mb-1">Gere seu link agora</p>
        <p className="text-sm text-[#64748B] mb-4">Leva 10 segundos e é na hora.</p>

        <label className="block text-sm font-semibold text-[#1A2754] mb-1.5">Seu nome</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Como seus amigos te chamam"
          required
          className="w-full h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#1A2754] text-base focus:outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/10 transition mb-3"
        />

        <label className="block text-sm font-semibold text-[#1A2754] mb-1.5">Seu WhatsApp</label>
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="(21) 99999-9999"
          inputMode="tel"
          required
          className="w-full h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#1A2754] text-base focus:outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/10 transition"
        />

        {erro && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="w-full h-12 mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold shadow-lg shadow-[#F2911D]/20 hover:shadow-xl transition disabled:opacity-60"
        >
          {carregando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Gerando...
            </>
          ) : (
            'Quero meu link'
          )}
        </button>
      </div>
    </form>
  )
}
