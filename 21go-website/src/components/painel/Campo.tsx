interface Props {
  rotulo: string
  tipo?: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  autoComplete?: string
}

export default function Campo({ rotulo, tipo = 'text', valor, aoMudar, dica, autoComplete }: Props) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        autoComplete={autoComplete}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/20"
      />
      {dica && <span className="block text-xs text-slate-500 mt-1">{dica}</span>}
    </label>
  )
}
