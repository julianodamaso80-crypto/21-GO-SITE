'use client'
import { useState } from 'react'
import Link from '@/components/Link'

/**
 * As pecas visuais do painel, no padrao do CRM da 21Go (`brand-guide.md`):
 * fundo `dark-900`, cards `dark-700` com borda `dark-500/50`, azul `blue-500`
 * na identidade e laranja `orange-500` so em acao.
 *
 * Vive num arquivo so porque sao atomos pequenos usados em toda tela do painel
 * — espalhar cada um num arquivo tornaria mais dificil manter a paleta coerente,
 * que e justamente o problema que este arquivo resolve.
 */

export const CORES = {
  fundo: '#0B1120',
  secao: '#111827',
  card: '#1A1F35',
  borda: '#3D3D5C',
  texto: '#E8E8EE',
  texto2: '#C5C5D2',
  texto3: '#9D9DB5',
  azul: '#1B4DA1',
  azulClaro: '#6B96EB',
  laranja: '#E07620',
  sucesso: '#34D399',
  alerta: '#FBBF24',
  erro: '#FB7185',
} as const

export function Cartao({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border border-[#3D3D5C]/50 bg-[#1A1F35] ${className}`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5)' }}
    >
      {children}
    </div>
  )
}

/**
 * KPI clicavel. Numero grande e, embaixo, pra onde ele leva — um painel de
 * numeros que nao abre a lista por tras deles obriga o dono a procurar na mao.
 */
export function Kpi({
  rotulo,
  valor,
  href,
  cor = 'azul',
  detalhe,
}: {
  rotulo: string
  valor: number | string
  href?: string
  cor?: 'azul' | 'laranja' | 'sucesso' | 'neutro'
  detalhe?: string
}) {
  const tom = {
    azul: { n: '#6B96EB', b: 'rgba(27,77,161,.35)', g: 'rgba(27,77,161,.12)' },
    laranja: { n: '#F0932B', b: 'rgba(224,118,32,.35)', g: 'rgba(224,118,32,.12)' },
    sucesso: { n: '#34D399', b: 'rgba(52,211,153,.3)', g: 'rgba(52,211,153,.1)' },
    neutro: { n: '#C5C5D2', b: 'rgba(61,61,92,.5)', g: 'transparent' },
  }[cor]

  const corpo = (
    <div
      className="h-full rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: tom.b,
        background: `linear-gradient(135deg, ${tom.g}, rgba(26,31,53,.9))`,
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9D9DB5]">{rotulo}</p>
      <p className="mt-2 text-3xl font-bold leading-none" style={{ color: tom.n }}>
        {valor}
      </p>
      {detalhe && <p className="mt-2 text-xs text-[#9D9DB5]">{detalhe}</p>}
    </div>
  )

  if (!href) return corpo
  return (
    <Link href={href} className="block h-full">
      {corpo}
    </Link>
  )
}

export function Etiqueta({ texto }: { texto: string }) {
  const tom: Record<string, { c: string; f: string }> = {
    Fechado: { c: '#34D399', f: 'rgba(52,211,153,.12)' },
    Perdido: { c: '#9D9DB5', f: 'rgba(157,157,181,.12)' },
    'Em negociação': { c: '#FBBF24', f: 'rgba(251,191,36,.12)' },
    Novo: { c: '#6B96EB', f: 'rgba(107,150,235,.14)' },
  }
  const t = tom[texto] ?? tom.Novo
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: t.c, background: t.f, border: `1px solid ${t.c}33` }}
    >
      {texto}
    </span>
  )
}

export function Botao({
  children,
  tipo = 'primario',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tipo?: 'primario' | 'cta' | 'ghost' | 'perigo' }) {
  const estilo = {
    primario: 'bg-[#1B4DA1] text-white hover:bg-[#164087]',
    cta: 'bg-[#E07620] text-white hover:bg-[#C4651A]',
    ghost: 'border border-[#3D3D5C] bg-transparent text-[#C5C5D2] hover:bg-[#2A2A42]',
    perigo: 'border border-[#FB7185]/30 bg-[#FB7185]/10 text-[#FB7185] hover:bg-[#FB7185]/20',
  }[tipo]
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${estilo} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Campo({
  rotulo,
  tipo = 'text',
  valor,
  aoMudar,
  dica,
  autoComplete,
}: {
  rotulo: string
  tipo?: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  autoComplete?: string
}) {
  // Senha com olhinho: quem digita errado sem ver so descobre no "senha
  // incorreta", e a senha daqui costuma ser gerada (`a557fftw`) — dificil de
  // acertar no escuro.
  const [mostrando, setMostrando] = useState(false)
  const ehSenha = tipo === 'password'
  const tipoReal = ehSenha && mostrando ? 'text' : tipo

  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#9D9DB5]">
        {rotulo}
      </span>
      <div className="relative">
        <input
          type={tipoReal}
          value={valor}
          autoComplete={autoComplete}
          onChange={(e) => aoMudar(e.target.value)}
          className={`w-full rounded-lg border border-[#3D3D5C] bg-[#2A2A42] py-3 pl-4 text-[#E8E8EE] outline-none transition-colors placeholder:text-[#757598] focus:border-[#6B96EB] focus:ring-1 focus:ring-[#6B96EB]/30 ${ehSenha ? 'pr-12' : 'pr-4'}`}
        />
        {ehSenha && (
          <button
            type="button"
            onClick={() => setMostrando((v) => !v)}
            aria-label={mostrando ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-3 py-2 text-xs font-semibold text-[#9D9DB5] transition-colors hover:text-[#E8E8EE]"
          >
            {mostrando ? 'ocultar' : 'ver'}
          </button>
        )}
      </div>
      {dica && <span className="mt-1 block text-xs text-[#757598]">{dica}</span>}
    </label>
  )
}

export function TituloSecao({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-bold text-[#E8E8EE]">{children}</h2>
      {acao}
    </div>
  )
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#3D3D5C] px-4 py-8 text-center text-sm text-[#9D9DB5]">
      {children}
    </div>
  )
}
