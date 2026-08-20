import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { resolverConsultor, estaNoAr } from '@/lib/consultor'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Painel do parceiro',
  robots: { index: false, follow: false },
}

/**
 * O painel e SEMPRE dinamico. Ele nao pode ser prerenderizado como o resto do
 * site: cada resposta depende da sessao. Isolar aqui tambem garante que o
 * `force-dynamic` nao vaze pras paginas de marketing, que vivem do prerender.
 */
export default async function LayoutPainel({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)
  if (!consultor || !estaNoAr(consultor)) notFound()

  return <div className="min-h-screen bg-[#0B1120] text-[#E8E8EE]">{children}</div>
}
