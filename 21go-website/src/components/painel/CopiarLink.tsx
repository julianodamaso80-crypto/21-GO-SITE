'use client'
import { useState } from 'react'

/**
 * O link e o produto do divulgador. Copiar tem que ser um toque — ele vai
 * colar isso em story, grupo e bio, varias vezes por semana.
 */
export default function CopiarLink({
  link,
  compacto = false,
}: {
  link: string
  compacto?: boolean
}) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    void navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2200)
  }

  if (compacto) {
    return (
      <button
        onClick={copiar}
        title={link}
        className="rounded-lg border border-[#3D3D5C] px-2.5 py-1 text-[11px] font-semibold text-[#C5C5D2] transition-colors hover:bg-[#2A2A42]"
      >
        {copiado ? '✓ copiado' : 'copiar link'}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-[#E07620]/30 bg-gradient-to-br from-[#E07620]/10 to-[#1A1F35] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9D9DB5]">
        Meu link de divulgação
      </p>
      <p className="mt-2 break-all font-mono text-sm text-[#E8E8EE]">{link}</p>
      <button
        onClick={copiar}
        className="mt-4 rounded-lg bg-[#E07620] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C4651A]"
      >
        {copiado ? 'Copiado!' : 'Copiar meu link'}
      </button>
      <p className="mt-3 text-xs text-[#9D9DB5]">
        Quem fizer a simulação por este link conta como seu.
      </p>
    </div>
  )
}
