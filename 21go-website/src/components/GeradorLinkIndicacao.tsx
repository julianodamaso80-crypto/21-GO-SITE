'use client'
import { useState } from 'react'
import { Loader2, Copy, Check, Share2, Gift } from 'lucide-react'
import { useConsultor } from './ConsultorProvider'
import { PAINEL_POR_CONSULTOR } from '@/lib/consultores-painel'

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
 *
 * ─── Duas versoes desta tela, e o motivo ────────────────────────────────────
 *
 * Num consultor COM PAINEL isto vira o cadastro de indicador DO PAINEL: pede
 * e-mail e senha, cria o acesso e devolve `21go.com.br/<consultor>/<nome>`.
 *
 * Antes as duas coisas conviviam sem se falar: quem se cadastrava aqui ganhava
 * um codigo `?ind=` numa tabela que o painel nao le — entao aparecia pro dono
 * como "ninguem cadastrado" e recebia um link que ele nao reconhecia. Pior: o
 * codigo e reaproveitado pelo WhatsApp, entao quem ja tinha pedido um link
 * antes recebia o NOME ANTIGO de volta.
 *
 * Nos outros 17 sites nada muda: continua o Member Get Member de sempre.
 */

export function GeradorLinkIndicacao({ className = '' }: { className?: string }) {
  const consultor = useConsultor()
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [acesso, setAcesso] = useState<{ painel: string; email: string } | null>(null)
  const temPainel = !!consultor?.slug && PAINEL_POR_CONSULTOR.has(consultor.slug)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const rota = temPainel ? '/api/painel/indicador' : '/api/indicacao/gerar'
      const r = await fetch(rota, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome,
          whatsapp,
          ...(temPainel ? { email, senha } : {}),
          // O link nasce dentro do site de onde ela pediu: assim o amigo dela
          // entra pelo site do mesmo consultor e o lead continua caindo no
          // Power dele.
          consultorSlug: consultor?.slug ?? null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.erro || 'não consegui gerar seu link agora')
      setLink(d.link)
      if (d.painel) setAcesso({ painel: d.painel, email: d.email })
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
              <p className="text-xs text-[#64748B]">
                {acesso ? 'Todo lead que entrar por ele fica no seu nome' : 'Cada amigo que fechar por ele te dá 10%'}
              </p>
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

          {acesso ? (
            <div className="mt-4 rounded-lg border border-[#293C82]/20 bg-[#293C82]/5 p-3">
              <p className="text-sm font-semibold text-[#1A2754]">
                Acompanhe seus resultados no painel
              </p>
              <p className="mt-1 break-all text-sm text-[#293C82]">
                <a href={acesso.painel} target="_blank" rel="noopener noreferrer" data-sai-do-slug className="font-mono underline">
                  {acesso.painel.replace('https://', '')}
                </a>
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Entre com <strong>{acesso.email}</strong> e a senha que você acabou de criar.
              </p>
            </div>
          ) : (
            <p className="text-xs text-[#64748B] mt-4">
              Guarde este link: ele é seu e não muda. Se pedir de novo com o mesmo WhatsApp, volta o
              mesmo endereço.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={gerar} className={`w-full max-w-md mx-auto text-left ${className}`}>
      <div className="rounded-2xl bg-white/95 border border-[#E2E8F0] p-6 shadow-xl">
        <p className="font-bold text-[#1A2754] mb-1">
          {temPainel ? 'Quero indicar e acompanhar' : 'Gere seu link agora'}
        </p>
        <p className="text-sm text-[#64748B] mb-4">
          {temPainel
            ? 'Seu link sai na hora, junto com o acesso ao painel.'
            : 'Leva 10 segundos e é na hora.'}
        </p>

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

        {temPainel && (
          <>
            <label className="mt-3 block text-sm font-semibold text-[#1A2754] mb-1.5">
              Seu e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              required
              className="w-full h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#1A2754] text-base focus:outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/10 transition mb-3"
            />
            <label className="block text-sm font-semibold text-[#1A2754] mb-1.5">Crie uma senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="mínimo 8 caracteres"
              required
              className="w-full h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#1A2754] text-base focus:outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/10 transition"
            />
            <p className="mt-1.5 text-xs text-[#64748B]">
              É com eles que você entra no painel pra acompanhar seus leads.
            </p>
          </>
        )}

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
            temPainel ? 'Criar meu link e meu acesso' : 'Quero meu link'
          )}
        </button>
      </div>
    </form>
  )
}
