export default function Cartao({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number | string
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destaque ? 'border-[#C7D301] bg-[#C7D301]/10' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#293C82]">{valor}</p>
    </div>
  )
}
