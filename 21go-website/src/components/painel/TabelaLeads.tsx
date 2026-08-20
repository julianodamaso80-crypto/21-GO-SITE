'use client'
import { useCallback, useEffect, useState } from 'react'
import { Botao, Campo, Cartao, Etiqueta, Vazio } from './ui'

interface Lead {
  id: string
  criadoEm: string
  nome: string
  telefone: string
  veiculo: string
  valorMensal: number | null
  plano: string | null
  etapa: string
  vendedorNome: string | null
  nota: string | null
}

type Origem = '' | 'site' | 'indicacao'

export default function TabelaLeads() {
  const [itens, setItens] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [origem, setOrigem] = useState<Origem>('')
  const [vendedor, setVendedor] = useState('')
  const [papel, setPapel] = useState<'admin' | 'vendedor'>('vendedor')
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Lead | null>(null)
  const [rascunho, setRascunho] = useState({ nome: '', telefone: '', nota: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // A URL manda no primeiro render: os cartoes do painel abrem esta tela ja
  // filtrada (`/app/leads?origem=indicacao`), entao o filtro tem que vir de la.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const o = p.get('origem')
    if (o === 'site' || o === 'indicacao') setOrigem(o)
    setVendedor(p.get('vendedor') ?? '')
  }, [])

  const buscar = useCallback(() => {
    setCarregando(true)
    const q = new URLSearchParams({ pagina: String(pagina) })
    if (origem) q.set('origem', origem)
    if (vendedor) q.set('vendedor', vendedor)
    fetch(`/api/painel/leads?${q}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/'
          return
        }
        const d = await r.json()
        setItens(d.itens ?? [])
        setTotal(d.total ?? 0)
        setPapel(d.papel ?? 'vendedor')
      })
      .finally(() => setCarregando(false))
  }, [pagina, origem, vendedor])

  useEffect(() => {
    buscar()
  }, [buscar])

  async function salvar() {
    if (!editando) return
    setSalvando(true)
    setErro('')
    const r = await fetch(`/api/painel/leads/${editando.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rascunho),
    })
    setSalvando(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErro(d.erro || 'Não deu pra salvar.')
      return
    }
    setEditando(null)
    buscar()
  }

  async function remover(l: Lead) {
    if (!confirm(`Tirar "${l.nome}" da sua lista? Ele some do painel, mas continua no seu Power.`))
      return
    const r = await fetch(`/api/painel/leads/${l.id}`, { method: 'DELETE' })
    if (!r.ok) {
      setErro('Não deu pra remover.')
      return
    }
    buscar()
  }

  function abrir(l: Lead) {
    setEditando(l)
    setErro('')
    setRascunho({
      nome: l.nome,
      // Vem formatado da API; o servidor normaliza de volta.
      telefone: l.telefone,
      nota: l.nota ?? '',
    })
  }

  const ehAdmin = papel === 'admin'
  const abas: { id: Origem; texto: string }[] = [
    { id: '', texto: 'Todos' },
    { id: 'site', texto: 'Direto do site' },
    { id: 'indicacao', texto: 'Por indicação' },
  ]

  function trocarAba(id: Origem) {
    setOrigem(id)
    setVendedor('')
    setPagina(1)
    const url = new URL(window.location.href)
    url.searchParams.delete('vendedor')
    if (id) url.searchParams.set('origem', id)
    else url.searchParams.delete('origem')
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#E8E8EE]">Leads</h1>
        <span className="text-sm text-[#9D9DB5]">{total} no filtro atual</span>
      </div>

      {ehAdmin && (
        <div className="flex flex-wrap gap-2">
          {abas.map((a) => (
            <button
              key={a.id || 'todos'}
              onClick={() => trocarAba(a.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                origem === a.id && !vendedor
                  ? 'bg-[#1B4DA1] text-white'
                  : 'border border-[#3D3D5C] text-[#C5C5D2] hover:bg-[#2A2A42]'
              }`}
            >
              {a.texto}
            </button>
          ))}
          {vendedor && (
            <button
              onClick={() => trocarAba('')}
              className="rounded-lg border border-[#E07620]/40 bg-[#E07620]/10 px-4 py-2 text-sm font-semibold text-[#F0932B]"
            >
              só de {vendedor} · limpar ✕
            </button>
          )}
        </div>
      )}

      {erro && <p className="text-sm text-[#FB7185]">{erro}</p>}

      {editando && (
        <Cartao className="border-[#6B96EB]/40 p-5">
          <h2 className="mb-4 text-base font-bold text-[#E8E8EE]">
            Editar lead · {editando.veiculo}
          </h2>
          <div className="grid gap-x-4 md:grid-cols-2">
            <Campo
              rotulo="Nome"
              valor={rascunho.nome}
              aoMudar={(v) => setRascunho({ ...rascunho, nome: v })}
            />
            <Campo
              rotulo="WhatsApp"
              valor={rascunho.telefone}
              aoMudar={(v) => setRascunho({ ...rascunho, telefone: v })}
              dica="Com DDD"
            />
          </div>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#9D9DB5]">
              Comentário
            </span>
            <textarea
              value={rascunho.nota}
              onChange={(e) => setRascunho({ ...rascunho, nota: e.target.value })}
              rows={3}
              placeholder="O que ficou combinado, quando retornar, o que ele pediu…"
              className="w-full rounded-lg border border-[#3D3D5C] bg-[#2A2A42] px-4 py-3 text-[#E8E8EE] outline-none transition-colors placeholder:text-[#757598] focus:border-[#6B96EB] focus:ring-1 focus:ring-[#6B96EB]/30"
            />
            <span className="mt-1 block text-xs text-[#757598]">
              Fica só no seu painel. Apagar o texto remove o comentário.
            </span>
          </label>
          <div className="flex gap-2">
            <Botao tipo="primario" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
            <Botao tipo="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
          </div>
        </Cartao>
      )}

      {carregando ? (
        <p className="text-sm text-[#9D9DB5]">Carregando…</p>
      ) : !itens.length ? (
        <Vazio>
          {origem === 'indicacao'
            ? 'Nenhum lead por indicação ainda. Assim que alguém simular pelo link de um indicador, aparece aqui.'
            : 'Nenhum lead ainda. Assim que alguém fizer uma simulação, aparece aqui.'}
        </Vazio>
      ) : (
        <>
          <Cartao className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[#757598]">
                  <th className="p-4 font-semibold">Data</th>
                  <th className="p-4 font-semibold">Nome</th>
                  <th className="p-4 font-semibold">WhatsApp</th>
                  <th className="p-4 font-semibold">Veículo</th>
                  <th className="p-4 font-semibold">Mensal</th>
                  <th className="p-4 font-semibold">Situação</th>
                  <th className="p-4 font-semibold">Origem</th>
                  {ehAdmin && <th className="p-4 font-semibold">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-[#3D3D5C]/40 transition-colors hover:bg-[#2A2A42]/40"
                  >
                    <td className="whitespace-nowrap p-4 text-[#9D9DB5]">
                      {new Date(l.criadoEm).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 font-medium text-[#E8E8EE]">
                      {l.nome}
                      {l.nota && (
                        <span
                          title={l.nota}
                          className="mt-1 block max-w-[220px] truncate text-xs font-normal italic text-[#FBBF24]"
                        >
                          “{l.nota}”
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-4 font-mono text-[#C5C5D2]">{l.telefone}</td>
                    <td className="p-4 text-[#C5C5D2]">{l.veiculo}</td>
                    <td className="whitespace-nowrap p-4 font-semibold text-[#E8E8EE]">
                      {l.valorMensal ? `R$ ${l.valorMensal.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td className="p-4">
                      <Etiqueta texto={l.etapa} />
                    </td>
                    <td className="p-4">
                      {l.vendedorNome ? (
                        <span className="text-xs font-semibold text-[#F0932B]">
                          {l.vendedorNome}
                        </span>
                      ) : (
                        <span className="text-xs text-[#757598]">meu site</span>
                      )}
                    </td>
                    {ehAdmin && (
                      <td className="whitespace-nowrap p-4">
                        <button
                          onClick={() => abrir(l)}
                          className="mr-2 rounded-lg border border-[#3D3D5C] px-2.5 py-1 text-xs font-semibold text-[#C5C5D2] hover:bg-[#2A2A42]"
                        >
                          {l.nota ? 'Editar / nota' : 'Editar'}
                        </button>
                        <button
                          onClick={() => void remover(l)}
                          className="rounded-lg border border-[#FB7185]/30 bg-[#FB7185]/10 px-2.5 py-1 text-xs font-semibold text-[#FB7185] hover:bg-[#FB7185]/20"
                        >
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          {total > 50 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-[#C5C5D2] disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-[#9D9DB5]">página {pagina}</span>
              <button
                onClick={() => setPagina((p) => p + 1)}
                disabled={pagina * 50 >= total}
                className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-[#C5C5D2] disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
