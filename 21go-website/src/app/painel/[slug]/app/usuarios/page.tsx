import GestaoUsuarios from '@/components/painel/GestaoUsuarios'

export const dynamic = 'force-dynamic'

export default function PaginaUsuarios() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Equipe</h1>
      <GestaoUsuarios />
    </main>
  )
}
