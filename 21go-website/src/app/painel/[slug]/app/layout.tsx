import Link from '@/components/Link'

export const dynamic = 'force-dynamic'

/**
 * A aba "Equipe" aparece pra todo mundo, mas a pagina se resolve sozinha: quem
 * nao e admin leva 403 da API e ve o aviso. Esconder o link exigiria buscar o
 * papel no servidor a cada navegacao, e o custo nao paga o ganho.
 */
export default function LayoutLogado({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/app" className="text-[#293C82]">
            Início
          </Link>
          <Link href="/app/leads" className="text-[#293C82]">
            Leads
          </Link>
          <Link href="/app/usuarios" className="text-[#293C82]">
            Equipe
          </Link>
        </nav>
        <form action="/api/painel/sair" method="post">
          <button className="text-sm text-slate-500 underline">Sair</button>
        </form>
      </header>
      {children}
    </div>
  )
}
