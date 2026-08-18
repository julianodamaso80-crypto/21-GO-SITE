'use client'
import { useEffect, useState } from 'react'
import Cartao from './Cartao'
import LinkDivulgacao from './LinkDivulgacao'

interface Dados {
  papel: 'admin' | 'vendedor'
  nome: string
  link: string
  resumo: {
    total: number
    noMes: number
    hoje: number
    ganhos: number
    perdidos: number
    emNegociacao: number
    porVendedor: { slug: string; nome: string; total: number; noMes: number; ganhos: number }[]
  }
}

export default function PainelResumo() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch('/api/painel/resumo')
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/'
          return
        }
        if (!r.ok) throw new Error('falhou')
        setDados(await r.json())
      })
      .catch(() => setErro('Não deu pra carregar agora.'))
  }, [])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!dados) return <p className="text-sm text-slate-500">Carregando…</p>

  const r = dados.resumo
  const ehAdmin = dados.papel === 'admin'

  return (
    <div className="space-y-6">
      {!ehAdmin && <LinkDivulgacao link={dados.link} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao rotulo="Leads no mês" valor={r.noMes} destaque />
        <Cartao rotulo="Hoje" valor={r.hoje} />
        <Cartao rotulo="Em negociação" valor={r.emNegociacao} />
        <Cartao rotulo="Fechados" valor={r.ganhos} />
      </div>

      {ehAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-[#293C82]">Quem está trazendo</h2>
          {r.porVendedor.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ninguém cadastrado ainda. Mande o link de cadastro pra sua equipe.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Pessoa</th>
                    <th className="pb-2 font-medium">No mês</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Fechados</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porVendedor.map((v) => (
                    <tr key={v.slug || 'direto'} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-800">{v.nome}</td>
                      <td className="py-2">{v.noMes}</td>
                      <td className="py-2">{v.total}</td>
                      <td className="py-2">{v.ganhos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
