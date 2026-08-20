'use client'
import { useCallback, useEffect, useState } from 'react'
import { Cartao, Etiqueta, Vazio } from './ui'

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
                    <td className="p-4 font-medium text-[#E8E8EE]">{l.nome}</td>
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
