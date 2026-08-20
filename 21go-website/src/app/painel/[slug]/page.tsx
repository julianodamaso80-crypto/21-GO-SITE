import Link from '@/components/Link'
import { resolverConsultor } from '@/lib/consultor'
import Marca from '@/components/painel/Marca'
import FormLogin from '@/components/painel/FormLogin'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Marca nome={consultor?.nome ?? ''} />
        <div className="rounded-xl border border-[#3D3D5C]/50 bg-[#1A1F35] p-6">
          <FormLogin />
        </div>
        <p className="mt-5 text-center text-sm text-[#9D9DB5]">
          Ainda não tem acesso?{' '}
          <Link href="/cadastro" className="font-semibold text-[#6B96EB] hover:underline">
            Quero divulgar e ganhar
          </Link>
        </p>
      </div>
    </main>
  )
}
