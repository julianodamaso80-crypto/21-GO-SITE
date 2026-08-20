import Link from '@/components/Link'
import { redirect } from 'next/navigation'
import { sessaoDoServidor } from '@/lib/painel/contexto'
import { buscarPorId } from '@/lib/painel/usuarios'

export const dynamic = 'force-dynamic'

/**
 * O papel sai da SESSAO, no servidor.
 *
 * A primeira versao decidia isso por um cookie gravado no login — e quem ja
 * estava logado antes daquele deploy ficou sem a aba "Equipe", porque o cookie
 * so nascia em login novo. Estado derivado da sessao nao pode depender de
 * quando a pessoa entrou.
 */
export default async function LayoutLogado({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoDoServidor()
  if (!sessao) redirect('/')

  const usuario = await buscarPorId(sessao.uid, sessao.slug)
  const ehAdmin = sessao.papel === 'admin'

  const abas = [
    { href: '/app', texto: 'Início' },
    { href: '/app/leads', texto: 'Leads' },
    ...(ehAdmin ? [{ href: '/app/usuarios', texto: 'Quem me indica' }] : []),
  ]

  return (
    <div className="min-h-screen bg-[#0B1120]">
      <header className="border-b border-[#3D3D5C]/40 bg-[#111827]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E07620] font-bold text-white">
              21
            </span>
            <nav className="flex gap-1">
              {abas.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-[#C5C5D2] transition-colors hover:bg-[#1A1F35] hover:text-[#E8E8EE]"
                >
                  {a.texto}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[#9D9DB5] sm:inline">
              {usuario?.nome}
              {ehAdmin && ' · dono'}
            </span>
            <form action="/api/painel/sair" method="post">
              <button className="rounded-lg border border-[#3D3D5C] px-3 py-1.5 text-xs font-semibold text-[#C5C5D2] transition-colors hover:bg-[#1A1F35]">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  )
}
