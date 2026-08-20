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
        <Marca nome={consultor?.nome ?? ''} subtitulo='Cadastre-se para divulgar e acompanhar seus resultados' />
        <div className="rounded-xl border border-[#3D3D5C]/50 bg-[#1A1F35] p-6">
          <FormCadastro />
        </div>
        <p className="mt-5 text-center text-sm text-[#9D9DB5]">
          Já tem acesso?{' '}
          <Link href="/" className="font-semibold text-[#6B96EB] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
