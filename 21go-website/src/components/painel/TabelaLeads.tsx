'use client'
import { useEffect, useState } from 'react'

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

const COR_ETAPA: Record<string, string> = {
  Fechado: 'bg-[#C7D301]/25 text-[#3f4a00]',
  Perdido: 'bg-slate-200 text-slate-600',
  'Em negociação': 'bg-[#F2911D]/20 text-[#8a4d00]',
  Novo: 'bg-[#293C82]/10 text-[#293C82]',
}

export default function TabelaLeads() {
  const [itens, setItens] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    setCarregando(true)
    fetch(`/api/painel/leads?pagina=${pagina}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/'
          return
        }
        const d = await r.json()
        setItens(d.itens ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setCarregando(false))
  }, [pagina])

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>
  if (!itens.length)
    return (
      <p className="text-sm text-slate-500">
        Nenhum lead ainda. Assim que alguém simular pelo link, aparece aqui.
      </p>
    )

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3 font-medium">Data</th>
              <th className="p-3 font-medium">Nome</th>
              <th className="p-3 font-medium">WhatsApp</th>
              <th className="p-3 font-medium">Veículo</th>
              <th className="p-3 font-medium">Mensal</th>
              <th className="p-3 font-medium">Situação</th>
              <th className="p-3 font-medium">Trazido por</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="p-3 whitespace-nowrap">
                  {new Date(l.criadoEm).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-3 font-medium text-slate-800">{l.nome}</td>
                <td className="p-3 whitespace-nowrap">{l.telefone}</td>
                <td className="p-3">{l.veiculo}</td>
                <td className="p-3 whitespace-nowrap">
                  {l.valorMensal ? `R$ ${l.valorMensal.toFixed(2).replace('.', ',')}` : '—'}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      COR_ETAPA[l.etapa] ?? COR_ETAPA.Novo
                    }`}
                  >
                    {l.etapa}
                  </span>
                </td>
                <td className="p-3">{l.vendedorNome ?? 'Direto'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} lead(s)</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina === 1}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => setPagina((p) => p + 1)}
            disabled={pagina * 50 >= total}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  )
}
