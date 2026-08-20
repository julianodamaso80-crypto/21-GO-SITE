'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { Cartao, Kpi, TituloSecao, Vazio } from './ui'
import CopiarLink from './CopiarLink'
import MinhaSenha from './MinhaSenha'
import MeuWhatsApp from './MeuWhatsApp'

interface Fatia {
  total: number
  noMes: number
  ganhos: number
}

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
    doSite: Fatia
    deIndicacao: Fatia
    porVendedor: { slug: string; nome: string; total: number; noMes: number; ganhos: number }[]
  }
}

export default function PainelResumo() {
  const [d, setDados] = useState<Dados | null>(null)
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

  if (erro) return <p className="text-sm text-[#FB7185]">{erro}</p>
  if (!d) return <p className="text-sm text-[#9D9DB5]">Carregando…</p>

  const r = d.resumo
  const ehAdmin = d.papel === 'admin'
  const primeiroNome = d.nome.split(' ')[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#E8E8EE]">Olá, {primeiroNome}</h1>
          <p className="mt-1 text-sm text-[#9D9DB5]">
            {ehAdmin
              ? 'Seus leads do site e os que sua rede trouxe.'
              : 'Tudo que entrou pelo seu link de divulgação.'}
          </p>
        </div>
        {ehAdmin && (
          <Link
            href="/app/usuarios"
            className="rounded-lg bg-[#E07620] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C4651A]"
          >
            + Cadastrar quem vai me indicar
          </Link>
        )}
      </div>

      <MinhaSenha />

      {ehAdmin && <MeuWhatsApp />}

      {!ehAdmin && <CopiarLink link={d.link} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi rotulo="Leads no mês" valor={r.noMes} href="/app/leads" cor="azul" detalhe="ver todos" />
        <Kpi rotulo="Hoje" valor={r.hoje} href="/app/leads" cor="neutro" />
        <Kpi
          rotulo="Em negociação"
          valor={r.emNegociacao}
          href="/app/leads"
          cor="laranja"
          detalhe="andando no funil"
        />
        <Kpi rotulo="Fechados" valor={r.ganhos} href="/app/leads" cor="sucesso" />
      </div>

      {ehAdmin && (
        <>
          {/* As duas origens lado a lado: e a primeira pergunta que o dono faz —
              "quanto veio do meu site e quanto a minha rede trouxe?". Cada
              bloco abre a lista ja filtrada. */}
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/app/leads?origem=site" className="block">
              <Cartao className="h-full p-5 transition-all duration-200 hover:-translate-y-0.5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#6B96EB]" />
                  <h3 className="font-bold text-[#E8E8EE]">Direto do meu site</h3>
                </div>
                <p className="text-3xl font-bold text-[#6B96EB]">{r.doSite.noMes}</p>
                <p className="mt-1 text-xs text-[#9D9DB5]">
                  no mês · {r.doSite.total} no total · {r.doSite.ganhos} fechado(s)
                </p>
                <p className="mt-4 text-xs font-semibold text-[#6B96EB]">Ver esses leads →</p>
              </Cartao>
            </Link>

            <Link href="/app/leads?origem=indicacao" className="block">
              <Cartao className="h-full p-5 transition-all duration-200 hover:-translate-y-0.5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#E07620]" />
                  <h3 className="font-bold text-[#E8E8EE]">Por indicação</h3>
                </div>
                <p className="text-3xl font-bold text-[#F0932B]">{r.deIndicacao.noMes}</p>
                <p className="mt-1 text-xs text-[#9D9DB5]">
                  no mês · {r.deIndicacao.total} no total · {r.deIndicacao.ganhos} fechado(s)
                </p>
                <p className="mt-4 text-xs font-semibold text-[#F0932B]">Ver quem indicou →</p>
              </Cartao>
            </Link>
          </div>

          <Cartao className="p-5">
            <TituloSecao
              acao={
                <Link
                  href="/app/usuarios"
                  className="text-xs font-semibold text-[#6B96EB] hover:underline"
                >
                  gerenciar equipe →
                </Link>
              }
            >
              Quem está me indicando
            </TituloSecao>

            {r.porVendedor.length === 0 ? (
              <Vazio>
                Ninguém cadastrado ainda. Cadastre quem vai divulgar por você e cada um recebe um
                link próprio.
              </Vazio>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-[#757598]">
                      <th className="px-2 pb-3 font-semibold">Pessoa</th>
                      <th className="px-2 pb-3 font-semibold">No mês</th>
                      <th className="px-2 pb-3 font-semibold">Total</th>
                      <th className="px-2 pb-3 font-semibold">Fechados</th>
                      <th className="px-2 pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.porVendedor.map((v) => (
                      <tr key={v.slug} className="border-t border-[#3D3D5C]/40">
                        <td className="px-2 py-3 font-medium text-[#E8E8EE]">{v.nome}</td>
                        <td className="px-2 py-3 font-semibold text-[#F0932B]">{v.noMes}</td>
                        <td className="px-2 py-3 text-[#C5C5D2]">{v.total}</td>
                        <td className="px-2 py-3 text-[#34D399]">{v.ganhos}</td>
                        <td className="px-2 py-3 text-right">
                          <Link
                            href={`/app/leads?vendedor=${v.slug}`}
                            className="text-xs font-semibold text-[#6B96EB] hover:underline"
                          >
                            ver leads
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </>
      )}
    </div>
  )
}
