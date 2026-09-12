'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ETIQUETAS } from '@/lib/isa/etiquetas.regras'

/**
 * Painel de atendimento da Isa — mesa de despacho da 21Go.
 *
 * Azul da marca como base, verde-limao = Isa ligada, laranja = precisa de gente. Cobre o
 * cabecalho/rodape do site (tela cheia, fixed) porque vive dentro do layout raiz.
 * Dados: /api/atendimento/* (tudo exige a sessao do painel).
 */

type Aba = 'todos' | 'precisa' | 'isa' | 'off' | 'transferidos'

interface ItemLista {
  telefone: string
  nome: string | null
  ligada: boolean
  pausa_motivo: string | null
  transferido_em: string | null
  aguardando_dono: string | null
  preco_da_tabela: boolean
  ultima: string | null
  ultima_direcao: string | null
  ultima_em: string | null
  janela_ate: string | null
  etiquetas: string[]
  /** "Vou confirmar e ja te retorno" sem resposta ainda (auditoria 12/09/2026). */
  pergunta_pendente: { texto: string; em: string } | null
}

interface ItemConversa {
  tipo: 'mensagem' | 'evento'
  em: string
  direcao?: string
  autor?: string
  conteudo?: string
  mensagem_tipo?: string
  media_id?: string | null
  evento?: string
  detalhe?: Record<string, unknown> | null
}

interface Contato {
  telefone: string
  nome: string | null
  ligada: boolean
  pausa_motivo: string | null
  pausa_por: string | null
  transferido_em: string | null
  entrada: string | null
  aguardando_dono: string | null
  preco_da_tabela: boolean
  janela_ate: string | null
  genero: string | null
  etiquetas: string[]
  pergunta_pendente: { texto: string; em: string } | null
}

interface Simulacao {
  leadId: string
  veiculo: string
  fipe: number | null
  ativacao: number | null
  desconto: { de: number; para: number } | null
  planos: { nome: string; mensal: number }[]
}

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'precisa', rotulo: 'Precisa de você' },
  { id: 'todos', rotulo: 'Todos' },
  { id: 'isa', rotulo: 'Isa' },
  { id: 'off', rotulo: 'Off' },
  { id: 'transferidos', rotulo: 'Transferidos' },
]

const MOTIVO: Record<string, string> = {
  documento: 'mandou documento',
  associado: 'é associado',
  sem_preco: 'sem preço',
  robo: 'perguntou se é robô',
  hostil: 'xingou / ameaçou',
  validador: 'número barrado',
  desconto: 'pediu desconto',
  manual: 'desligada no painel',
  humano_assumiu: 'humano assumiu',
}

const EVENTO: Record<string, string> = {
  pausou: 'Isa pausou',
  sem_informacao: 'Isa não soube — prometeu retornar',
  resposta_dono: 'resposta do dono entregue ao cliente',
  beneficios: 'lista de cobertura enviada',
  retomada_adiada: 'retomada adiada (cliente se despediu)',
  aviso_fora_horario: 'aviso de fora do horário',
  transferiu: 'transferido pro 4824',
  alerta: 'alerta enviado ao dono',
  alerta_falhou: 'ALERTA NÃO SAIU',
  desconto: 'desconto',
  orcamento: 'simulação',
  ligou: 'Isa ligada',
  desligou: 'Isa desligada',
  retomada: 'retomada enviada',
  versoes: 'versões listadas',
  sem_preco: 'sem preço',
  interrompida: 'resposta interrompida',
  envio_falhou: 'envio falhou',
  envio_bloqueado: 'bloqueado (modo teste)',
  silenciado_modo_teste: 'silenciado (modo teste)',
  reiniciou: 'conversa reiniciada (teste)',
  '5min': 'mensagem dos 5 min enviada',
  botao_5min: 'tocou no botão dos 5 min',
  erro: 'erro',
}

const ETIQUETA_POR_ID = new Map(ETIQUETAS.map((e) => [e.id, e]))

function ChipEtiqueta({ id, ativa = true, onClick }: { id: string; ativa?: boolean; onClick?: () => void }) {
  const e = ETIQUETA_POR_ID.get(id)
  if (!e) return null
  const estilo: React.CSSProperties = ativa
    ? { backgroundColor: e.cor, color: e.claro ? '#141d45' : '#fff', borderColor: e.cor }
    : { borderColor: `${e.cor}88`, color: e.cor }
  const cls = `rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide [font-family:var(--fonte-rotulo)] ${onClick ? 'transition hover:brightness-110' : ''}`
  return onClick ? (
    <button type="button" onClick={onClick} style={estilo} className={cls}>{e.nome}</button>
  ) : (
    <span style={estilo} className={cls}>{e.nome}</span>
  )
}

const brl = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function hora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  return dia === hoje ? hm : `${dia.slice(0, 5)} ${hm}`
}

function telefoneBonito(t: string): string {
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t
}

function janela(ate: string | null): { texto: string; tom: 'ok' | 'alerta' | 'fechada' } {
  if (!ate) return { texto: 'sem janela', tom: 'fechada' }
  const ms = new Date(ate).getTime() - Date.now()
  if (ms <= 0) return { texto: 'janela fechada', tom: 'fechada' }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { texto: `janela ${h}h${String(m).padStart(2, '0')}`, tom: h < 2 ? 'alerta' : 'ok' }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error((j as { erro?: string }).erro || `erro ${r.status}`), { status: r.status })
  return j as T
}

const FUNDO: React.CSSProperties = {
  backgroundColor: '#141d45',
  backgroundImage:
    'linear-gradient(rgba(199,211,1,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(199,211,1,0.035) 1px, transparent 1px), radial-gradient(1200px 600px at 85% -10%, rgba(41,60,130,0.9), transparent)',
  backgroundSize: '28px 28px, 28px 28px, 100% 100%',
}

export function PainelIsa() {
  const [usuario, setUsuario] = useState<string | null | false>(null)

  useEffect(() => {
    api<{ usuario: string }>('/api/atendimento/eu')
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(false))
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden text-[#E9ECF8] [font-family:var(--fonte-painel),system-ui,sans-serif]"
      style={FUNDO}
    >
      {usuario === null && <div className="grid h-full place-items-center text-sm text-white/50">carregando…</div>}
      {usuario === false && <Login aoEntrar={setUsuario} />}
      {typeof usuario === 'string' && <Mesa usuario={usuario} aoSair={() => setUsuario(false)} />}
    </div>
  )
}

/* ───────────────────────────── login ───────────────────────────── */

function Login({ aoEntrar }: { aoEntrar: (u: string) => void }) {
  const [usuario, setU] = useState('')
  const [senha, setS] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setIndo(true)
    setErro('')
    try {
      const r = await api<{ usuario: string }>('/api/atendimento/entrar', { method: 'POST', body: JSON.stringify({ usuario, senha }) })
      aoEntrar(r.usuario)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não deu')
    } finally {
      setIndo(false)
    }
  }

  return (
    <div className="grid h-full place-items-center p-6">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1b2657]/90 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F2911D] text-lg font-bold text-[#141d45] [font-family:var(--fonte-rotulo)]">21</span>
          <div>
            <p className="text-2xl font-bold leading-none tracking-tight [font-family:var(--fonte-rotulo)]">ATENDIMENTO ISA</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#C7D301]">mesa da 21Go</p>
          </div>
        </div>
        <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-white/50">usuário</label>
        <input value={usuario} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoComplete="username"
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#141d45] px-3 py-2.5 text-[#E9ECF8] outline-none focus:border-[#C7D301]" />
        <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-white/50">senha</label>
        <input type="password" value={senha} onChange={(e) => setS(e.target.value)} autoComplete="current-password"
          className="mb-6 w-full rounded-lg border border-white/10 bg-[#141d45] px-3 py-2.5 text-[#E9ECF8] outline-none focus:border-[#C7D301]" />
        {erro && <p className="mb-4 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-200">{erro}</p>}
        <button disabled={indo} className="w-full rounded-lg bg-[#F2911D] py-3 font-semibold text-[#141d45] transition hover:brightness-110 disabled:opacity-50">
          {indo ? 'entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

/* ───────────────────────────── mesa ───────────────────────────── */

function Mesa({ usuario, aoSair }: { usuario: string; aoSair: () => void }) {
  const [modo, setModo] = useState<'conversas' | 'funil'>('conversas')
  const [aba, setAba] = useState<Aba>('todos')
  const [busca, setBusca] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [lista, setLista] = useState<ItemLista[]>([])
  const [precisa, setPrecisa] = useState(0)
  const [sel, setSel] = useState<string | null>(null)

  // Link do alerta: 21go.site/painel?c=<telefone> abre a conversa direto.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c')
    if (c) setSel(c.replace(/\D/g, ''))
  }, [])

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ contatos: ItemLista[]; precisa: number }>(
        `/api/atendimento/contatos?aba=${aba}&q=${encodeURIComponent(busca)}&e=${encodeURIComponent(etiqueta)}`,
      )
      setLista(r.contatos)
      setPrecisa(r.precisa)
    } catch (err) {
      if ((err as { status?: number }).status === 401) aoSair()
    }
  }, [aba, busca, etiqueta, aoSair])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    return () => clearInterval(t)
  }, [carregar])

  async function sair() {
    await fetch('/api/atendimento/sair', { method: 'POST' }).catch(() => {})
    aoSair()
  }

  if (modo === 'funil') {
    return (
      <Funil
        usuario={usuario}
        aoSair={aoSair}
        aoVoltar={() => setModo('conversas')}
        aoAbrir={(t) => {
          setSel(t)
          setModo('conversas')
        }}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* barra lateral */}
      <aside className={`${sel ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.07] bg-[#141d45]/80 md:w-[360px]`}>
        <header className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <p className="text-[22px] font-bold leading-none tracking-tight [font-family:var(--fonte-rotulo)]">ATENDIMENTO</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/45">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C7D301] shadow-[0_0_10px_#C7D301]" /> isa · {usuario}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setModo('funil')}
              className="rounded-md border border-[#C7D301]/40 px-2.5 py-1 text-xs font-semibold text-[#C7D301] hover:bg-[#C7D301]/10">funil</button>
            <button onClick={sair} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:text-white">sair</button>
          </div>
        </header>

        <div className="px-4 pb-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar nome ou telefone"
            className="w-full rounded-lg border border-white/[0.08] bg-[#0f1638] px-3 py-2 text-sm text-[#E9ECF8] outline-none placeholder:text-white/30 focus:border-[#C7D301]/60" />
        </div>

        <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {ABAS.map((a) => {
            const ativo = aba === a.id
            const urgente = a.id === 'precisa' && precisa > 0
            return (
              <button key={a.id} onClick={() => setAba(a.id)}
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide transition [font-family:var(--fonte-rotulo)] ${
                  ativo ? (urgente ? 'bg-[#F2911D] text-[#141d45]' : 'bg-[#E9ECF8] text-[#141d45]') : urgente ? 'bg-[#F2911D]/15 text-[#F2911D]' : 'bg-white/[0.05] text-white/60 hover:text-white'
                }`}>
                {a.rotulo}
                {a.id === 'precisa' && precisa > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${ativo ? 'bg-[#141d45] text-[#F2911D]' : 'bg-[#F2911D] text-[#141d45]'}`}>{precisa}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* filtro por etiqueta */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          <button onClick={() => setEtiqueta('')}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide [font-family:var(--fonte-rotulo)] ${
              etiqueta ? 'border-white/15 text-white/45' : 'border-white/60 bg-white/10 text-white'
            }`}>
            todas
          </button>
          {ETIQUETAS.map((e) => (
            <span key={e.id} className="shrink-0">
              <ChipEtiqueta id={e.id} ativa={etiqueta === e.id} onClick={() => setEtiqueta(etiqueta === e.id ? '' : e.id)} />
            </span>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {lista.length === 0 && <li className="px-5 py-10 text-center text-sm text-white/35">nada por aqui</li>}
          {lista.map((c) => {
            const precisaGente = (!c.ligada && !c.transferido_em && c.pausa_motivo && c.pausa_motivo !== 'manual' && c.pausa_motivo !== 'humano_assumiu') || !!c.aguardando_dono || !!c.pergunta_pendente
            return (
              <li key={c.telefone}>
                <button onClick={() => setSel(c.telefone)}
                  className={`group flex w-full gap-3 border-l-[3px] px-4 py-3 text-left transition ${
                    sel === c.telefone ? 'border-[#C7D301] bg-white/[0.06]' : precisaGente ? 'border-[#F2911D] hover:bg-white/[0.03]' : 'border-transparent hover:bg-white/[0.03]'
                  }`}>
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c.transferido_em ? 'bg-sky-400' : c.ligada ? 'bg-[#C7D301] shadow-[0_0_8px_#C7D301]' : precisaGente ? 'bg-[#F2911D]' : 'bg-white/25'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{c.nome || telefoneBonito(c.telefone)}</span>
                      <span className="shrink-0 text-[11px] text-white/40">{hora(c.ultima_em)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-white/50">
                      {c.ultima_direcao === 'outbound' && <span className="text-white/35">↳ </span>}
                      {c.ultima || '—'}
                    </span>
                    {(precisaGente || c.transferido_em || c.preco_da_tabela || c.etiquetas?.length > 0) && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {precisaGente && <Etiqueta tom="laranja">{c.pergunta_pendente ? 'devendo resposta' : c.aguardando_dono ? 'esperando você' : MOTIVO[c.pausa_motivo || ''] || c.pausa_motivo}</Etiqueta>}
                        {c.transferido_em && <Etiqueta tom="azul">no 4824</Etiqueta>}
                        {c.preco_da_tabela && <Etiqueta tom="cinza">preço da tabela</Etiqueta>}
                        {(c.etiquetas || []).map((id) => <ChipEtiqueta key={id} id={id} />)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* conversa */}
      <section className={`${sel ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {sel ? (
          <Conversa key={sel} telefone={sel} aoVoltar={() => setSel(null)} aoMudar={carregar} />
        ) : (
          <div className="grid flex-1 place-items-center">
            <div className="text-center">
              <p className="text-5xl font-bold text-white/[0.06] [font-family:var(--fonte-rotulo)]">MESA DA ISA</p>
              <p className="mt-2 text-sm text-white/35">escolha uma conversa à esquerda</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Etiqueta({ tom, children }: { tom: 'laranja' | 'azul' | 'cinza' | 'verde'; children: React.ReactNode }) {
  const cores = {
    laranja: 'bg-[#F2911D]/15 text-[#F2911D]',
    azul: 'bg-sky-400/15 text-sky-300',
    cinza: 'bg-white/[0.07] text-white/55',
    verde: 'bg-[#C7D301]/15 text-[#C7D301]',
  }[tom]
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide [font-family:var(--fonte-rotulo)] ${cores}`}>{children}</span>
}

/* ───────────────────────────── conversa ───────────────────────────── */

function Conversa({ telefone, aoVoltar, aoMudar }: { telefone: string; aoVoltar: () => void; aoMudar: () => void }) {
  const [contato, setContato] = useState<Contato | null>(null)
  const [itens, setItens] = useState<ItemConversa[]>([])
  const [sim, setSim] = useState<Simulacao | null>(null)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // No celular os detalhes (simulacao + etiquetas) comecam recolhidos: abertos, comiam metade da tela.
  const [detalhes, setDetalhes] = useState(false)
  const [, setTique] = useState(0)
  const fim = useRef<HTMLDivElement>(null)
  const qtdAnterior = useRef(0)

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ contato: Contato; itens: ItemConversa[]; simulacao: Simulacao | null }>(`/api/atendimento/conversa?t=${telefone}`)
      setContato(r.contato)
      setItens(r.itens)
      setSim(r.simulacao)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'não carregou')
    }
  }, [telefone])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 4000)
    const relogio = setInterval(() => setTique((x) => x + 1), 30_000) // contador da janela
    return () => {
      clearInterval(t)
      clearInterval(relogio)
    }
  }, [carregar])

  useEffect(() => {
    if (itens.length !== qtdAnterior.current) fim.current?.scrollIntoView({ behavior: qtdAnterior.current ? 'smooth' : 'auto' })
    qtdAnterior.current = itens.length
  }, [itens])

  async function acao(url: string, corpo: Record<string, unknown>, sucesso?: () => void) {
    setOcupado(true)
    setAviso('')
    try {
      await api(url, { method: 'POST', body: JSON.stringify({ telefone, ...corpo }) })
      sucesso?.()
      await carregar()
      aoMudar()
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'não deu')
    } finally {
      setOcupado(false)
    }
  }

  const jan = janela(contato?.janela_ate ?? null)
  const nome = contato?.nome || telefoneBonito(telefone)
  const dias = useMemo(() => {
    const out: { dia: string; itens: ItemConversa[] }[] = []
    for (const it of itens) {
      const dia = new Date(it.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' })
      if (!out.length || out[out.length - 1].dia !== dia) out.push({ dia, itens: [] })
      out[out.length - 1].itens.push(it)
    }
    return out
  }, [itens])

  return (
    <>
      {/* cabecalho */}
      <header className="border-b border-white/[0.07] bg-[#141d45]/85 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={aoVoltar} className="rounded-md px-2 py-1 text-lg text-white/60 md:hidden">←</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold leading-tight">{nome}</p>
            <p className="text-xs text-white/45 [font-family:var(--fonte-mono)]">{telefoneBonito(telefone)}</p>
          </div>
          <button type="button" onClick={() => setDetalhes((d) => !d)}
            className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/60 md:hidden">
            {detalhes ? 'detalhes ▴' : 'detalhes ▾'}
          </button>
          <span className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide [font-family:var(--fonte-rotulo)] ${
            jan.tom === 'ok' ? 'bg-white/[0.06] text-white/60' : jan.tom === 'alerta' ? 'bg-[#F2911D]/15 text-[#F2911D]' : 'bg-red-500/15 text-red-300'
          }`}>⏱ {jan.texto}</span>
          {contato && (
            <button disabled={ocupado} onClick={() => acao('/api/atendimento/isa', { ligada: !contato.ligada })}
              title={contato.ligada ? 'desligar a Isa neste contato' : 'ligar a Isa — ela lê a conversa inteira'}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12px] font-bold uppercase tracking-wider transition [font-family:var(--fonte-rotulo)] ${
                contato.ligada ? 'bg-[#C7D301] text-[#141d45] shadow-[0_0_24px_-6px_#C7D301]' : 'bg-white/[0.08] text-white/60'
              }`}>
              <span className={`h-6 w-6 rounded-full transition ${contato.ligada ? 'bg-[#141d45]' : 'bg-white/30'}`} />
              isa {contato.ligada ? 'ligada' : 'off'}
            </button>
          )}
          {contato && !contato.transferido_em && (
            <button disabled={ocupado || jan.tom === 'fechada'}
              onClick={() => confirm(`Transferir ${nome} pro 4824? Ele recebe o link com o resumo e a Isa desliga.`) && acao('/api/atendimento/transferir', {})}
              className="rounded-full border border-[#F2911D]/60 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#F2911D] transition hover:bg-[#F2911D] hover:text-[#141d45] disabled:opacity-30 [font-family:var(--fonte-rotulo)]">
              ↪ 4824
            </button>
          )}
        </div>

        <div className={detalhes ? 'block' : 'hidden md:block'}>
        {(sim || contato?.pausa_motivo || contato?.aguardando_dono || contato?.pergunta_pendente) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            {sim && (
              <>
                <span className="font-semibold text-white/90">{sim.veiculo}</span>
                <span className="text-white/50">FIPE <b className="font-semibold text-white/80">{brl(sim.fipe)}</b></span>
                <span className="text-white/50">
                  ativação{' '}
                  {sim.desconto ? (
                    <><s className="text-white/35">{brl(sim.desconto.de)}</s> <b className="font-semibold text-[#C7D301]">{brl(sim.desconto.para)}</b></>
                  ) : (
                    <b className="font-semibold text-white/80">{brl(sim.ativacao)}</b>
                  )}
                </span>
                {sim.planos.map((p) => (
                  <span key={p.nome} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/70">{p.nome} {brl(p.mensal)}</span>
                ))}
                <a href={`/api/pdfs/${sim.leadId}`} target="_blank" rel="noreferrer" className="text-[#F2911D] underline-offset-2 hover:underline">PDF ↗</a>
              </>
            )}
            {contato?.preco_da_tabela && <Etiqueta tom="cinza">preço da tabela — conferir no Power</Etiqueta>}
            {contato?.aguardando_dono && <Etiqueta tom="laranja">esperando você decidir o desconto</Etiqueta>}
            {contato?.pergunta_pendente && (
              <Etiqueta tom="laranja">a Isa prometeu retornar: “{contato.pergunta_pendente.texto.slice(0, 90)}” — responda aqui ou pelo WhatsApp de avisos</Etiqueta>
            )}
            {!contato?.ligada && contato?.pausa_motivo && <Etiqueta tom="laranja">pausada: {MOTIVO[contato.pausa_motivo] || contato.pausa_motivo}</Etiqueta>}
          </div>
        )}

        {contato && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] uppercase tracking-[0.16em] text-white/35 [font-family:var(--fonte-rotulo)]">etiquetas</span>
            {ETIQUETAS.map((e) => {
              const tem = (contato.etiquetas || []).includes(e.id)
              return (
                <ChipEtiqueta key={e.id} id={e.id} ativa={tem} onClick={() => {
                  if (ocupado) return
                  const nova = tem ? contato.etiquetas.filter((x) => x !== e.id) : [...(contato.etiquetas || []), e.id]
                  acao('/api/atendimento/etiquetas', { etiquetas: nova })
                }} />
              )
            })}
          </div>
        )}
        </div>
      </header>

      {/* mensagens */}
      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-8">
        {dias.map((d) => (
          <div key={d.dia}>
            <p className="my-4 text-center text-[11px] uppercase tracking-[0.2em] text-white/30 [font-family:var(--fonte-rotulo)]">{d.dia}</p>
            {d.itens.map((it, i) => (it.tipo === 'evento' ? <Evento key={i} it={it} /> : <Balao key={i} it={it} />))}
          </div>
        ))}
        <div ref={fim} />
      </div>

      {/* resposta */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (texto.trim()) acao('/api/atendimento/responder', { texto }, () => setTexto(''))
        }}
        className="border-t border-white/[0.07] bg-[#141d45]/90 px-3 py-3 md:px-6">
        {aviso && <p className="mb-2 rounded-md bg-red-500/15 px-3 py-1.5 text-sm text-red-200">{aviso}</p>}
        <p className="mb-2 text-[12px] text-white/40">
          {contato?.ligada
            ? 'a Isa não manda nada por cima da sua mensagem. se o cliente responder, ela segue — pra atender sozinho, desligue a chave.'
            : 'Isa desligada: quem atende esta conversa é você.'}
        </p>
        <div className="flex items-end gap-2">
          <GravadorDeAudio
            telefone={telefone}
            desligado={jan.tom === 'fechada' || ocupado}
            aoEnviar={async () => {
              await carregar()
              aoMudar()
            }}
            aoFalhar={setAviso}
          />
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
            disabled={jan.tom === 'fechada'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
              }
            }}
            placeholder={jan.tom === 'fechada' ? 'janela de 24h fechada — a Meta só aceita template' : 'responder pelo 98004-0964…'}
            className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl border border-white/[0.08] bg-[#0f1638] px-3 py-2.5 text-[15px] text-[#E9ECF8] caret-[#C7D301] outline-none placeholder:text-white/30 focus:border-[#C7D301]/60 disabled:opacity-40" />
          <button disabled={ocupado || !texto.trim() || jan.tom === 'fechada'}
            className="h-11 rounded-xl bg-[#F2911D] px-5 font-semibold text-[#141d45] transition hover:brightness-110 disabled:opacity-30">
            Enviar
          </button>
        </div>
      </form>
    </>
  )
}

/**
 * Responder por ÁUDIO (dono, 11/09/2026). Grava no navegador (webm no Chrome/Android, mp4 no
 * iPhone) e manda pro servidor, que converte pra ogg/opus — o formato de mensagem de voz da Meta.
 */
function GravadorDeAudio({
  telefone,
  desligado,
  aoEnviar,
  aoFalhar,
}: {
  telefone: string
  desligado: boolean
  aoEnviar: () => Promise<void>
  aoFalhar: (m: string) => void
}) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const cancelado = useRef(false)

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [gravando])

  async function comecar() {
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
      const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
      const r = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined)
      pedacos.current = []
      cancelado.current = false
      r.ondataavailable = (e) => { if (e.data.size) pedacos.current.push(e.data) }
      r.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop())
        setGravando(false)
        const blob = new Blob(pedacos.current, { type: r.mimeType || 'audio/webm' })
        if (cancelado.current || blob.size < 1000) return
        setEnviando(true)
        try {
          const form = new FormData()
          form.append('telefone', telefone)
          form.append('audio', blob, 'audio')
          const resp = await fetch('/api/atendimento/responder-audio', { method: 'POST', body: form, cache: 'no-store' })
          const j = (await resp.json().catch(() => ({}))) as { erro?: string }
          if (!resp.ok) throw new Error(j.erro || `erro ${resp.status}`)
          await aoEnviar()
        } catch (err) {
          aoFalhar(err instanceof Error ? err.message : 'não deu pra enviar o áudio')
        } finally {
          setEnviando(false)
        }
      }
      r.start()
      rec.current = r
      setSegundos(0)
      setGravando(true)
    } catch {
      aoFalhar('não consegui acessar o microfone — autorize no navegador')
    }
  }

  const parar = (cancelar: boolean) => {
    cancelado.current = cancelar
    rec.current?.stop()
  }

  if (gravando) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => parar(true)} title="cancelar"
          className="h-11 rounded-xl border border-white/15 px-3 text-[13px] text-white/70 hover:bg-white/5">
          cancelar
        </button>
        <span className="min-w-[52px] text-center text-[13px] font-semibold text-[#C7D301] tabular-nums">
          ● {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')}
        </span>
        <button type="button" onClick={() => parar(false)} title="enviar áudio"
          className="h-11 rounded-xl bg-[#C7D301] px-4 font-semibold text-[#141d45] hover:brightness-110">
          enviar
        </button>
      </div>
    )
  }

  return (
    <button type="button" onClick={comecar} disabled={desligado || enviando} title="gravar áudio"
      className="h-11 w-11 shrink-0 rounded-xl border border-white/[0.08] bg-[#0f1638] text-lg text-white/70 transition hover:border-[#C7D301]/60 hover:text-[#C7D301] disabled:opacity-30">
      {enviando ? '…' : '🎤'}
    </button>
  )
}

function Balao({ it }: { it: ItemConversa }) {
  const cliente = it.direcao === 'inbound'
  const isa = !cliente && (it.autor === 'isa' || it.autor === 'agent')
  const temMidia = (it.mensagem_tipo === 'image' || it.mensagem_tipo === 'document') && it.media_id
  return (
    <div className={`mb-2 flex ${cliente ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] md:max-w-[62%] ${cliente ? '' : 'text-right'}`}>
        <p className={`mb-0.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] [font-family:var(--fonte-rotulo)] ${
          cliente ? 'text-white/40' : isa ? 'text-[#C7D301]/80' : 'text-[#F2911D]/85'
        }`}>
          {cliente ? 'cliente' : isa ? 'isa' : it.autor}
        </p>
        <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[15px] leading-snug ${
          cliente
            ? 'rounded-tl-sm bg-[#E9ECF8] text-[#141d45]'
            : isa
              ? 'rounded-tr-sm border-l-2 border-[#C7D301] bg-[#293C82] text-white'
              : 'rounded-tr-sm bg-[#F2911D]/20 text-[#FFE4C4] ring-1 ring-[#F2911D]/30'
        }`}>
          {temMidia ? (
            <a href={`/api/atendimento/midia?id=${encodeURIComponent(it.media_id!)}`} target="_blank" rel="noreferrer" className="font-semibold underline">
              {it.mensagem_tipo === 'image' ? '🖼 abrir imagem' : '📄 abrir documento'}
            </a>
          ) : null}
          {/* O que a Isa leu da foto/PDF (ou a legenda) — o "[imagem]" cru nao aparece. */}
          {temMidia ? (
            it.conteudo && !/^\[[^\]]*\]$/.test(it.conteudo.trim()) && <span className="mt-1 block">{linkar(it.conteudo)}</span>
          ) : (
            linkar(it.conteudo || '')
          )}
          <span className={`mt-1 block text-right text-[10.5px] ${cliente ? 'text-[#141d45]/45' : 'text-white/40'}`}>{hora(it.em)}</span>
        </div>
      </div>
    </div>
  )
}

function linkar(texto: string): React.ReactNode {
  const partes = texto.split(/(https?:\/\/\S+)/g)
  return partes.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all underline opacity-90">{p.length > 60 ? `${p.slice(0, 57)}…` : p}</a>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

function Evento({ it }: { it: ItemConversa }) {
  const d = it.detalhe || {}
  const extra =
    it.evento === 'pausou' || it.evento === 'transferiu'
      ? MOTIVO[String(d.motivo)] || String(d.motivo ?? '')
      : it.evento === 'desconto' && d.de
        ? `${brl(Number(d.de))} → ${brl(Number(d.para))}`
        : it.evento === 'orcamento'
          ? String(d.placa ?? d.modelo ?? '') + (d.resultado ? ` · ${String(d.resultado)}` : '')
          : it.evento === 'interrompida'
            ? d.por === 'humano' ? 'alguém do time escreveu' : 'cliente escreveu'
            : ''
  const grave = it.evento === 'alerta_falhou' || it.evento === 'erro' || it.evento === 'envio_falhou'
  return (
    <p className="my-2 text-center">
      <span className={`inline-block rounded-full px-3 py-1 text-[11px] [font-family:var(--fonte-mono)] ${grave ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.05] text-white/45'}`}>
        {hora(it.em)} · {EVENTO[it.evento || ''] || it.evento}
        {extra ? ` · ${extra}` : ''}
        {it.autor && it.autor !== 'isa' && it.autor !== 'sistema' ? ` · ${it.autor}` : ''}
      </span>
    </p>
  )
}

/* ───────────────────────────── funil (kanban) ───────────────────────────── */

interface CardFunil {
  telefone: string
  nome: string | null
  etapa: string
  etapa_manual: string | null
  veiculo: string | null
  fipe: number | null
  plano: string | null
  valor: number | null
  ultima: string | null
  ultima_em: string | null
  etiquetas: string[]
  ligada: boolean
  nota: string | null
}

/**
 * Funil do atendimento (dono, 11/09/2026). No computador arrasta o card; no celular usa o
 * seletor "mover" — arrastar com o dedo nao funciona com drag and drop do navegador.
 */
function Funil({
  usuario,
  aoSair,
  aoVoltar,
  aoAbrir,
}: {
  usuario: string
  aoSair: () => void
  aoVoltar: () => void
  aoAbrir: (telefone: string) => void
}) {
  const [etapas, setEtapas] = useState<{ id: string; rotulo: string; cor: string }[]>([])
  const [cards, setCards] = useState<CardFunil[]>([])
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ etapas: { id: string; rotulo: string; cor: string }[]; cards: CardFunil[] }>('/api/atendimento/funil')
      setEtapas(r.etapas)
      setCards(r.cards)
    } catch (err) {
      if ((err as { status?: number }).status === 401) aoSair()
    }
  }, [aoSair])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 10000)
    return () => clearInterval(t)
  }, [carregar])

  async function anotar(telefone: string, nota: string) {
    setCards((antes) => antes.map((c) => (c.telefone === telefone ? { ...c, nota } : c)))
    try {
      await api('/api/atendimento/nota', { method: 'POST', body: JSON.stringify({ telefone, nota }) })
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'não deu pra salvar a nota')
      await carregar()
    }
  }

  async function mover(telefone: string, etapa: string) {
    setCards((antes) => antes.map((c) => (c.telefone === telefone ? { ...c, etapa, etapa_manual: etapa } : c)))
    try {
      await api('/api/atendimento/funil', { method: 'POST', body: JSON.stringify({ telefone, etapa }) })
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'não deu pra mover')
      await carregar()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <p className="text-[22px] font-bold leading-none tracking-tight [font-family:var(--fonte-rotulo)]">FUNIL</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C7D301] shadow-[0_0_10px_#C7D301]" /> isa · {usuario} · {cards.length} conversas
          </p>
        </div>
        <button onClick={aoVoltar} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:text-white">
          voltar pras conversas
        </button>
      </header>

      {aviso && <p className="mx-5 mb-2 rounded-md bg-red-500/15 px-3 py-1.5 text-sm text-red-200">{aviso}</p>}

      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-5">
        {etapas.map((e) => {
          const doFunil = cards.filter((c) => c.etapa === e.id)
          return (
            <section key={e.id}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => { if (arrastando) mover(arrastando, e.id); setArrastando(null) }}
              className="flex w-[280px] shrink-0 flex-col rounded-xl border border-white/[0.07] bg-[#141d45]/70">
              <div className="flex items-center justify-between rounded-t-xl px-3 py-2" style={{ backgroundColor: `${e.cor}22`, borderBottom: `2px solid ${e.cor}` }}>
                <span className="text-[12px] font-bold uppercase tracking-wide [font-family:var(--fonte-rotulo)]" style={{ color: e.cor }}>{e.rotulo}</span>
                <span className="rounded-full bg-white/10 px-2 text-[11px] font-semibold text-white/70">{doFunil.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {doFunil.map((c) => (
                  <Card key={c.telefone} card={c} etapas={etapas}
                    aoArrastar={setArrastando} aoAbrir={aoAbrir} aoMover={mover} aoAnotar={anotar} />
                ))}
                {doFunil.length === 0 && <p className="px-1 py-6 text-center text-[12px] text-white/25">vazio</p>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Card do funil. O card INTEIRO arrasta (nada de botão por dentro: o navegador não começa o
 * arrasto quando a pessoa pega num botão) e um clique abre a conversa. A nota é interna — o
 * cliente nunca vê (dono, 12/09/2026).
 */
function Card({
  card: c,
  etapas,
  aoArrastar,
  aoAbrir,
  aoMover,
  aoAnotar,
}: {
  card: CardFunil
  etapas: { id: string; rotulo: string; cor: string }[]
  aoArrastar: (t: string | null) => void
  aoAbrir: (t: string) => void
  aoMover: (t: string, etapa: string) => void
  aoAnotar: (t: string, nota: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(c.nota ?? '')

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', c.telefone)
        aoArrastar(c.telefone)
      }}
      onDragEnd={() => aoArrastar(null)}
      className="cursor-grab select-none rounded-lg border border-white/[0.07] bg-[#0f1638] p-2.5 active:cursor-grabbing">
      <div onClick={() => aoAbrir(c.telefone)} className="cursor-pointer">
        <p className="truncate text-[14px] font-semibold text-[#E9ECF8]">{c.nome || telefoneBonito(c.telefone)}</p>
        {c.veiculo && <p className="mt-0.5 truncate text-[12px] text-white/55">{c.veiculo}</p>}
        {c.plano && (
          <p className="mt-0.5 text-[12px] text-[#C7D301]">
            {c.plano}
            {c.valor ? ` · ${brl(c.valor)}/mês` : ''}
          </p>
        )}
        {c.ultima && <p className="mt-1 truncate text-[11.5px] text-white/40">{c.ultima}</p>}
        <p className="mt-1 text-[10.5px] uppercase tracking-wide text-white/30">
          {hora(c.ultima_em)}
          {c.ligada ? '' : ' · isa off'}
        </p>
      </div>

      {c.etiquetas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.etiquetas.map((id) => (
            <ChipEtiqueta key={id} id={id} />
          ))}
        </div>
      )}

      {editando ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            autoFocus
            placeholder="anotação interna (o cliente não vê)"
            className="w-full resize-y rounded-md border border-white/10 bg-[#141d45] px-2 py-1.5 text-[12px] text-[#E9ECF8] outline-none placeholder:text-white/25 focus:border-[#C7D301]/60" />
          <div className="mt-1 flex gap-1.5">
            <button type="button"
              onClick={() => {
                aoAnotar(c.telefone, texto.trim())
                setEditando(false)
              }}
              className="rounded-md bg-[#C7D301] px-2.5 py-1 text-[11.5px] font-semibold text-[#141d45]">
              salvar
            </button>
            <button type="button"
              onClick={() => {
                setTexto(c.nota ?? '')
                setEditando(false)
              }}
              className="rounded-md border border-white/15 px-2.5 py-1 text-[11.5px] text-white/60">
              cancelar
            </button>
          </div>
        </div>
      ) : c.nota ? (
        <p onClick={() => setEditando(true)}
          className="mt-2 cursor-text whitespace-pre-wrap rounded-md border-l-2 border-[#F2911D] bg-[#F2911D]/10 px-2 py-1 text-[11.5px] text-[#FFE4C4]">
          {c.nota}
        </p>
      ) : (
        <button type="button" onClick={() => setEditando(true)}
          className="mt-2 w-full rounded-md border border-dashed border-white/15 px-2 py-1 text-[11.5px] text-white/40 hover:border-[#F2911D]/60 hover:text-[#F2911D]">
          + anotação
        </button>
      )}

      <select
        value={c.etapa}
        onChange={(ev) => aoMover(c.telefone, ev.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 w-full rounded-md border border-white/10 bg-[#141d45] px-2 py-1 text-[11.5px] text-white/70 outline-none focus:border-[#C7D301]/60">
        {etapas.map((op) => (
          <option key={op.id} value={op.id}>
            mover para: {op.rotulo}
          </option>
        ))}
      </select>
    </article>
  )
}
