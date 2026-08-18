import TabelaLeads from '@/components/painel/TabelaLeads'

export const dynamic = 'force-dynamic'

export default function PaginaLeads() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Leads</h1>
      <TabelaLeads />
    </main>
  )
}
