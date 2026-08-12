'use client'
import { useState } from 'react'
import { Check, Loader2, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react'

/**
 * Contratacao do site do consultor, em dois passos.
 *
 * Passo 1 pede so o e-mail e o Power responde quem e. Passo 2 pede o WhatsApp
 * (que TEM que bater com o do Power — e a prova de que e ele mesmo), o CPF (o
 * Asaas exige pra emitir a cobranca) e o endereco do site.
 *
 * O nome nao e digitado de proposito: vem do Power. Cadastro real la esta como
 * "CARLOS A R JUNIOR", e pedir pra pessoa acertar essa grafia recusaria uma
 * venda legitima por um detalhe que nao e culpa dela.
 */

const MENSALIDADE = 80

type Achado = {
  encontrado: boolean
  jaTemSite?: boolean
  semTelefone?: boolean
  nome?: string
  telefone?: string
  slug?: string
  status?: string
  slugSugerido?: string
}

type Pronto = {
  slug: string
  nome: string
  url: string
  linkPagamento: string | null
  vencimento: string
}

const campo =
  'w-full h-12 px-4 rounded-lg border border-[#E2E8F0] bg-white text-[#1A2754] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/10 transition'
const rotulo = 'block text-sm font-semibold text-[#1A2754] mb-2'
const botao =
  'w-full h-12 rounded-lg bg-[#F2911D] text-white font-semibold hover:bg-[#D67A0F] disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2'

export function FormularioSite() {
  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const [email, setEmail] = useState('')
  const [achado, setAchado] = useState<Achado | null>(null)
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [slug, setSlug] = useState('')
  const [pronto, setPronto] = useState<Pronto | null>(null)

  async function verificar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/site-consultor/verificar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = (await r.json()) as Achado & { erro?: string }
      if (!r.ok) throw new Error(d.erro || 'não consegui verificar agora')

      if (!d.encontrado) {
        setErro(
          'não achei esse e-mail no Power. Confira se digitou o mesmo que está no seu cadastro.',
        )
        return
      }
      setAchado(d)
      if (!d.jaTemSite && !d.semTelefone) {
        setSlug(d.slugSugerido || '')
        setPasso(2)
      }
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  async function contratar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/site-consultor/contratar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, telefone, cpf, slug }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.erro || 'não consegui contratar agora')

      setPronto({
        slug: d.slug,
        nome: d.nome || '',
        url: d.url || `https://21go.com.br/${d.slug}`,
        linkPagamento: d.linkPagamento ?? null,
        vencimento: d.vencimento || '',
      })
      setPasso(3)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  // ─── Ja tem site ───────────────────────────────────────────────────────────
  if (achado?.jaTemSite) {
    return (
      <Cartao>
        <ShieldCheck className="h-10 w-10 text-[#293C82] mb-4" />
        <h2 className="text-xl font-bold text-[#1A2754] mb-2">Você já tem site</h2>
        <p className="text-[#64748B] mb-4">
          O seu endereço é{' '}
          <span className="font-mono font-semibold text-[#293C82]">
            21go.com.br/{achado.slug}
          </span>
          {achado.status === 'pendente' && ' — falta só o pagamento entrar.'}
          {achado.status === 'inadimplente' && ' — tem uma mensalidade em aberto.'}
        </p>
        <p className="text-sm text-[#94A3B8]">
          Precisa mudar alguma coisa? Fale com a 21Go.
        </p>
      </Cartao>
    )
  }

  // ─── Sem telefone no Power ─────────────────────────────────────────────────
  if (achado?.semTelefone) {
    return (
      <Cartao>
        <AlertCircle className="h-10 w-10 text-[#F2911D] mb-4" />
        <h2 className="text-xl font-bold text-[#1A2754] mb-2">Falta seu telefone no Power</h2>
        <p className="text-[#64748B]">
          Achei seu cadastro ({achado.nome}), mas ele está sem telefone — e é por ele que eu
          confirmo que o site é seu mesmo. Peça pra 21Go cadastrar seu WhatsApp no Power e volte
          aqui.
        </p>
      </Cartao>
    )
  }

  // ─── Contratado ────────────────────────────────────────────────────────────
  if (passo === 3 && pronto) {
    return (
      <Cartao>
        <div className="w-12 h-12 rounded-full bg-[#C7D301]/20 flex items-center justify-center mb-4">
          <Check className="h-6 w-6 text-[#7A8200]" />
        </div>
        <h2 className="text-xl font-bold text-[#1A2754] mb-2">Reservado, {pronto.nome}</h2>
        <p className="text-[#64748B] mb-5">
          Seu endereço é{' '}
          <span className="font-mono font-semibold text-[#293C82]">{pronto.url}</span>. Ele entra
          no ar assim que o pagamento cair — se pagar por Pix, é na hora.
        </p>

        {pronto.linkPagamento && (
          <a
            href={pronto.linkPagamento}
            target="_blank"
            rel="noopener noreferrer"
            className={botao}
          >
            Pagar R$ {MENSALIDADE},00 <ExternalLink className="h-4 w-4" />
          </a>
        )}

        <p className="text-xs text-[#94A3B8] mt-4">
          Assim que o site subir, eu te aviso no WhatsApp com o link pronto pra divulgar.
        </p>
      </Cartao>
    )
  }

  // ─── Passo 2 ───────────────────────────────────────────────────────────────
  if (passo === 2 && achado) {
    return (
      <Cartao>
        <div className="mb-6 p-4 rounded-lg bg-[#F0F4FA] border border-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">Achei no Power:</p>
          <p className="font-semibold text-[#1A2754]">{achado.nome}</p>
          <p className="text-sm text-[#64748B] font-mono">{achado.telefone}</p>
        </div>

        <form onSubmit={contratar} className="space-y-4">
          <div>
            <label className={rotulo}>Seu WhatsApp completo</label>
            <input
              className={campo}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(21) 99999-9999"
              inputMode="tel"
              required
            />
            <p className="text-xs text-[#94A3B8] mt-1.5">
              Tem que ser o mesmo do seu cadastro no Power. É pra onde seus leads vão chegar.
            </p>
          </div>

          <div>
            <label className={rotulo}>CPF</label>
            <input
              className={campo}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              inputMode="numeric"
              required
            />
            <p className="text-xs text-[#94A3B8] mt-1.5">Para emitir a cobrança.</p>
          </div>

          <div>
            <label className={rotulo}>Endereço do seu site</label>
            <div className="flex items-center gap-0 rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-[#293C82] focus-within:ring-2 focus-within:ring-[#293C82]/10 transition">
              <span className="pl-4 pr-1 text-[#94A3B8] font-mono text-sm whitespace-nowrap">
                21go.com.br/
              </span>
              <input
                className="flex-1 h-12 pr-4 bg-white text-[#1A2754] font-mono focus:outline-none min-w-0"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                required
              />
            </div>
            <p className="text-xs text-[#94A3B8] mt-1.5">
              Só letras e números. Depois de criado não muda, então escolha o que você vai querer
              ditar no telefone.
            </p>
          </div>

          {erro && <Erro texto={erro} />}

          <button type="submit" className={botao} disabled={carregando}>
            {carregando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reservando...
              </>
            ) : (
              `Contratar por R$ ${MENSALIDADE}/mês`
            )}
          </button>
        </form>
      </Cartao>
    )
  }

  // ─── Passo 1 ───────────────────────────────────────────────────────────────
  return (
    <Cartao>
      <h2 className="text-xl font-bold text-[#1A2754] mb-1">Seu site da 21Go</h2>
      <p className="text-[#64748B] mb-6">
        Um site igual a este, no seu nome, com seus leads caindo direto no seu Power. R${' '}
        {MENSALIDADE}/mês.
      </p>

      <form onSubmit={verificar} className="space-y-4">
        <div>
          <label className={rotulo}>Seu e-mail no Power</label>
          <input
            className={campo}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            required
          />
          <p className="text-xs text-[#94A3B8] mt-1.5">
            O mesmo que está no seu cadastro de consultor.
          </p>
        </div>

        {erro && <Erro texto={erro} />}

        <button type="submit" className={botao} disabled={carregando}>
          {carregando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Procurando...
            </>
          ) : (
            'Continuar'
          )}
        </button>
      </form>
    </Cartao>
  )
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_4px_24px_rgba(26,39,84,0.06)] p-8">
      {children}
    </div>
  )
}

function Erro({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-red-700">{texto}</p>
    </div>
  )
}
