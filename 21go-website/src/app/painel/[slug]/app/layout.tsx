import NavPainel from '@/components/painel/NavPainel'

export const dynamic = 'force-dynamic'

export default function LayoutLogado({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <NavPainel />
        <form action="/api/painel/sair" method="post">
          <button className="text-sm text-slate-500 underline">Sair</button>
        </form>
      </header>
      {children}
    </div>
  )
}
