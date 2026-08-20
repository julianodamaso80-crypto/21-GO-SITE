/** Cabecalho das telas de entrada: o parceiro ve o nome DELE, nao o da 21Go. */
export default function Marca({ nome, subtitulo }: { nome: string; subtitulo?: string }) {
  return (
    <div className="mb-8 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E07620] text-xl font-bold text-white">
        21
      </div>
      <h1 className="text-2xl font-bold text-[#E8E8EE]">{nome || 'Painel do parceiro'}</h1>
      <p className="mt-1 text-sm text-[#9D9DB5]">
        {subtitulo ?? 'Acompanhe seus leads e quem te indica'}
      </p>
    </div>
  )
}
