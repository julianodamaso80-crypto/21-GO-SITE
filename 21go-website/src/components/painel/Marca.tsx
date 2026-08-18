/** Cabecalho das telas de entrada: o parceiro ve o nome DELE, nao o da 21Go. */
export default function Marca({ nome }: { nome: string }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#293C82] text-white font-bold text-xl mb-4">
        21
      </div>
      <h1 className="text-2xl font-bold text-[#293C82]">{nome || 'Painel do parceiro'}</h1>
      <p className="text-sm text-slate-500 mt-1">Acompanhe seus leads e sua equipe</p>
    </div>
  )
}
