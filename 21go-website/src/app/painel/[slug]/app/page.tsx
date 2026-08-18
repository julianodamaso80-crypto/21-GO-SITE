import PainelResumo from '@/components/painel/PainelResumo'

export const dynamic = 'force-dynamic'

export default function PaginaInicio() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Meu painel</h1>
      <PainelResumo />
    </main>
  )
}
