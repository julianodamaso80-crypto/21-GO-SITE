'use client'
import { useState } from 'react'

/** O link e a razao de o divulgador abrir o painel. Fica grande e no topo. */
export default function LinkDivulgacao({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Meu link</p>
      <p className="mt-1 break-all text-sm text-slate-800">{link}</p>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(link)
          setCopiado(true)
        }}
        className="mt-3 rounded-xl bg-[#F2911D] px-4 py-2 text-sm font-semibold text-white"
      >
        {copiado ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}
