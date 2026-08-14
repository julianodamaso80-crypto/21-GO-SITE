'use client'
import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, ArrowRight, Copy, QrCode, Barcode, ShieldCheck, AlertCircle } from 'lucide-react'
import { MENSALIDADE } from '@/lib/precos'

/**
 * Contratacao do site do consultor, em formato quiz: uma pergunta por tela.
 *
 * Por que quiz e nao formulario de uma pagina: sao cinco campos, e dois deles
 * (CPF e endereco do site) assustam quem so queria "ver quanto custa". Uma
 * pergunta por vez com progresso visivel troca "que formulario grande" por
 * "falta pouco" — e o passo 2 ja mostra o nome dele, entao ele sente que o
 * sistema o reconheceu antes de pedir qualquer dado sensivel.
 *
 * ⚠️ O checkout e NOSSO. O QR do Pix, o copia-e-cola e a linha digitavel sao
 * desenhados aqui dentro (ordem do dono: "nao pode parecer que e Asaas").
 * Ninguem e mandado pra fora — inclusive porque sair do site no meio do
 * pagamento e onde a venda morre.
 */

const TOTAL_PASSOS = 4

type Achado = {
  encontrado: boolean
  jaTemSite?: boolean
  semTelefone?: boolean
  nome?: string
  telefone?: string
  slug?: string
  status?: string
  slugSugerido?: string
  /** O nome do consultor ja e endereco de outra pessoa (ver avisoSlug). */
  slugOcupado?: boolean
  avisoSlug?: string | null
}

type Cobranca = {
  pago: boolean
  valor?: number
  vencimento?: string
  pix?: { copiaECola: string | null; qr: string | null }
  boleto?: { linha: string | null }
}

export function FormularioSite() {
  const [passo, setPasso] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const [email, setEmail] = useState('')
  const [achado, setAchado] = useState<Achado | null>(null)
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [slug, setSlug] = useState('')

  const [contratado, setContratado] = useState<{ slug: string; nome: string } | null>(null)
  const [cobranca, setCobranca] = useState<Cobranca | null>(null)
  const [aba, setAba] = useState<'pix' | 'boleto'>('pix')
  const [copiado, setCopiado] = useState('')
  const [pago, setPago] = useState(false)

  // ─── passo 1: quem e voce ────────────────────────────────────────────────
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
        setErro('não achei esse e-mail no Power e CRM. Confira se é o mesmo do seu cadastro.')
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

  // ─── passo 4: fecha e gera a cobranca ────────────────────────────────────
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

      setContratado({ slug: d.slug, nome: d.nome || '' })
      setPasso(5)

      const p = await fetch(`/api/site-consultor/pagamento/${d.slug}`).then((x) => x.json())
      setCobranca(p)
      if (p.pago) setPago(true)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  // ─── enquanto ele paga, a tela pergunta sozinha se ja caiu ───────────────
  const conferirPagamento = useCallback(async () => {
    if (!contratado) return
    try {
      const r = await fetch(`/api/site-consultor/pagamento/${contratado.slug}?so=status`).then((x) =>
        x.json(),
      )
      if (r.pago) setPago(true)
    } catch {
      /* rede oscilando nao e motivo pra sujar a tela */
    }
  }, [contratado])

  useEffect(() => {
    if (passo !== 5 || pago) return
    // 8s: Pix cai em segundos, e ver a tela virar sozinha é o que prova que
    // funcionou. Mais lento que isso parece travado; mais rápido é bater à toa.
    const t = setInterval(conferirPagamento, 8000)
    return () => clearInterval(t)
  }, [passo, pago, conferirPagamento])

  function copiar(texto: string, qual: string) {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(qual)
      setTimeout(() => setCopiado(''), 2200)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  if (achado?.jaTemSite) {
    return (
      <Cartao>
        <Selo tipo="ok">
          <ShieldCheck size={22} />
        </Selo>
        <h2 className="qs-h2">Você já tem site</h2>
        <p className="qs-p">
          Seu endereço é <strong className="qs-mono">21go.com.br/{achado.slug}</strong>
          {achado.status === 'pendente' && ' — falta só o pagamento entrar.'}
          {achado.status === 'inadimplente' && ' — tem uma mensalidade em aberto.'}
        </p>
      </Cartao>
    )
  }

  if (achado?.semTelefone) {
    return (
      <Cartao>
        <Selo tipo="alerta">
          <AlertCircle size={22} />
        </Selo>
        <h2 className="qs-h2">Falta seu telefone no Power e CRM</h2>
        <p className="qs-p">
          Achei seu cadastro ({achado.nome}), mas está sem telefone no Power e CRM — e é por ele que eu confirmo
          que o site é seu. Peça pra 21Go cadastrar seu WhatsApp e volte aqui.
        </p>
      </Cartao>
    )
  }

  // ─── passo 5: pagamento (ou sucesso) ─────────────────────────────────────
  if (passo === 5 && contratado) {
    if (pago) {
      return (
        <Cartao>
          <Selo tipo="ok">
            <Check size={24} strokeWidth={3} />
          </Selo>
          <h2 className="qs-h2">Pagamento confirmado!</h2>
          <p className="qs-p">
            Seu site já está no ar em{' '}
            <strong className="qs-mono">21go.com.br/{contratado.slug}</strong>.
          </p>
          <div className="qs-nota">
            Estou conferindo se as cotações do seu site caem certinho no seu Power e CRM. Assim
            que confirmar, te mando o link no WhatsApp pronto pra divulgar.
          </div>
        </Cartao>
      )
    }

    return (
      <Cartao largo>
        <div className="qs-precoTopo">
          <span className="qs-precoLabel">Seu site</span>
          <div className="qs-preco">
            <span className="qs-cifra">R$</span>
            <span className="qs-valor">{MENSALIDADE}</span>
            <span className="qs-mes">/mês</span>
          </div>
          <span className="qs-endereco">21go.com.br/{contratado.slug}</span>
        </div>

        <div className="qs-abas">
          <button
            className={`qs-aba ${aba === 'pix' ? 'qs-abaOn' : ''}`}
            onClick={() => setAba('pix')}
          >
            <QrCode size={16} /> Pix
            <em className="qs-abaDica">na hora</em>
          </button>
          <button
            className={`qs-aba ${aba === 'boleto' ? 'qs-abaOn' : ''}`}
            onClick={() => setAba('boleto')}
          >
            <Barcode size={16} /> Boleto
          </button>
        </div>

        {!cobranca ? (
          <div className="qs-carregandoBox">
            <Loader2 className="qs-spin" size={22} />
            <span>Gerando seu pagamento...</span>
          </div>
        ) : aba === 'pix' ? (
          <div className="qs-pixBox">
            {cobranca.pix?.qr && (
              <div className="qs-qrMoldura">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${cobranca.pix.qr}`}
                  alt="QR code do Pix"
                  className="qs-qr"
                />
              </div>
            )}
            <p className="qs-pDim">Abra o app do banco, escaneie o código e pronto.</p>
            {cobranca.pix?.copiaECola && (
              <button
                className="qs-btnCopiar"
                onClick={() => copiar(cobranca.pix!.copiaECola!, 'pix')}
              >
                {copiado === 'pix' ? <Check size={16} /> : <Copy size={16} />}
                {copiado === 'pix' ? 'Copiado!' : 'Copiar código Pix'}
              </button>
            )}
          </div>
        ) : (
          <div className="qs-boletoBox">
            <p className="qs-pDim">Linha digitável:</p>
            <div className="qs-linha">{cobranca.boleto?.linha || '—'}</div>
            {cobranca.boleto?.linha && (
              <button
                className="qs-btnCopiar"
                onClick={() => copiar(cobranca.boleto!.linha!, 'boleto')}
              >
                {copiado === 'boleto' ? <Check size={16} /> : <Copy size={16} />}
                {copiado === 'boleto' ? 'Copiado!' : 'Copiar linha digitável'}
              </button>
            )}
            {/* Sem data de vencimento na tela de venda (ordem do dono,
                14/08/2026): o consultor ve o VALOR, nunca a data. Data de
                primeira mensalidade dava a leitura de "so pago la na frente" e
                empurrava o pagamento pra depois. O `vencimento` continua vindo
                da API pro nosso controle — so nao e exibido. */}
          </div>
        )}

        <div className="qs-esperando">
          <span className="qs-pontoPulsa" />
          Esperando o pagamento — esta tela muda sozinha quando cair.
        </div>
      </Cartao>
    )
  }

  // ─── o quiz ──────────────────────────────────────────────────────────────
  return (
    <Cartao>
      <Progresso passo={passo} />

      {passo === 1 && (
        <form onSubmit={verificar} className="qs-passo" key="p1">
          <span className="qs-etiqueta">Pergunta 1 de {TOTAL_PASSOS}</span>
          <h2 className="qs-h2">Qual seu e-mail no Power e CRM?</h2>
          <p className="qs-p">É por ele que eu encontro seu cadastro de consultor no Power e CRM.</p>
          <input
            className="qs-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            autoFocus
            required
          />
          {erro && <Erro texto={erro} />}
          <Botao carregando={carregando} texto="Continuar" />
        </form>
      )}

      {passo === 2 && achado && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setErro('')
            setPasso(3)
          }}
          className="qs-passo"
          key="p2"
        >
          <span className="qs-etiqueta">Pergunta 2 de {TOTAL_PASSOS}</span>
          <div className="qs-achei">
            <div className="qs-acheiIcone">
              <Check size={16} strokeWidth={3} />
            </div>
            <div>
              <span className="qs-acheiLabel">Achei no Power e CRM</span>
              <strong className="qs-acheiNome">{achado.nome}</strong>
              <span className="qs-acheiFone">{achado.telefone}</span>
            </div>
          </div>
          <h2 className="qs-h2">Confirma seu WhatsApp?</h2>
          <p className="qs-p">
            Digite completo — tem que ser o mesmo do Power e CRM. É pra onde seus leads vão chegar.
          </p>
          <input
            className="qs-input"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(21) 99999-9999"
            inputMode="tel"
            autoFocus
            required
          />
          <Botao carregando={false} texto="Continuar" />
          <button type="button" className="qs-voltar" onClick={() => setPasso(1)}>
            voltar
          </button>
        </form>
      )}

      {passo === 3 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setErro('')
            setPasso(4)
          }}
          className="qs-passo"
          key="p3"
        >
          <span className="qs-etiqueta">Pergunta 3 de {TOTAL_PASSOS}</span>
          <h2 className="qs-h2">Seu CPF</h2>
          <p className="qs-p">Só pra emitir a cobrança no seu nome.</p>
          <input
            className="qs-input"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoFocus
            required
          />
          <Botao carregando={false} texto="Continuar" />
          <button type="button" className="qs-voltar" onClick={() => setPasso(2)}>
            voltar
          </button>
        </form>
      )}

      {passo === 4 && (
        <form onSubmit={contratar} className="qs-passo" key="p4">
          <span className="qs-etiqueta">Última pergunta</span>
          <h2 className="qs-h2">Qual vai ser seu endereço?</h2>
          <p className="qs-p">Escolha com carinho: depois de criado, ele não muda.</p>
          {/* Homônimo: o campo vem vazio de propósito e o consultor completa com
              o sobrenome. Nunca sugerimos "gustavo2" — número no endereço não
              identifica ninguém (ordem do dono, 14/08/2026). */}
          {achado?.avisoSlug && (
            <p className="qs-p" style={{ color: '#B45309', fontWeight: 600 }}>
              {achado.avisoSlug}
            </p>
          )}
          <div className="qs-slugBox">
            <span className="qs-slugPrefixo">21go.com.br/</span>
            <input
              className="qs-slugInput"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              autoFocus
              required
            />
          </div>
          {erro && <Erro texto={erro} />}
          <Botao carregando={carregando} texto={`Contratar por R$ ${MENSALIDADE}/mês`} />
          <button type="button" className="qs-voltar" onClick={() => setPasso(3)}>
            voltar
          </button>
        </form>
      )}
    </Cartao>
  )
}

/* ─── peças ───────────────────────────────────────────────────────────────── */

function Cartao({ children, largo }: { children: React.ReactNode; largo?: boolean }) {
  return <div className={`qs-cartao ${largo ? 'qs-cartaoLargo' : ''}`}>{children}</div>
}

function Progresso({ passo }: { passo: number }) {
  return (
    <div className="qs-progresso">
      {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
        <span key={i} className={`qs-tick ${i < passo ? 'qs-tickOn' : ''}`} />
      ))}
    </div>
  )
}

function Botao({ carregando, texto }: { carregando: boolean; texto: string }) {
  return (
    <button type="submit" className="qs-btn" disabled={carregando}>
      {carregando ? (
        <>
          <Loader2 className="qs-spin" size={18} /> Só um instante...
        </>
      ) : (
        <>
          {texto} <ArrowRight size={18} />
        </>
      )}
    </button>
  )
}

function Selo({ tipo, children }: { tipo: 'ok' | 'alerta'; children: React.ReactNode }) {
  return <div className={`qs-selo ${tipo === 'ok' ? 'qs-seloOk' : 'qs-seloAlerta'}`}>{children}</div>
}

function Erro({ texto }: { texto: string }) {
  return (
    <div className="qs-erro">
      <AlertCircle size={16} />
      <span>{texto}</span>
    </div>
  )
}
