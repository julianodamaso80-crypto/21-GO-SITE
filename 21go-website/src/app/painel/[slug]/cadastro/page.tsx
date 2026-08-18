import Link from '@/components/Link'
import { resolverConsultor } from '@/lib/consultor'
import Marca from '@/components/painel/Marca'
import FormCadastro from '@/components/painel/FormCadastro'

export const dynamic = 'force-dynamic'

export default async function PaginaCadastro({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Marca nome={consultor?.nome ?? ''} />
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <FormCadastro />
        </div>
        <p className="mt-5 text-center text-sm text-slate-600">
          Já tem acesso?{' '}
          <Link href="/" className="font-semibold text-[#293C82] underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
