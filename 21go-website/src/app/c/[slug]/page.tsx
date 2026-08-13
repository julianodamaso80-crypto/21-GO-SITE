import { notFound } from 'next/navigation'
import { HomeContent } from '@/components/HomeContent'
import { VIDEO_POR_CONSULTOR, videoDoConsultor } from '@/lib/consultores-video'

/**
 * A home de um consultor que tem vídeo próprio.
 *
 * Por que existe uma rota só pra isso: a home da 21Go é prerenderizada e o slug
 * só aparece depois da hidratação, então trocar o hero no cliente fazia o hero
 * do presidente PISCAR antes do vídeo entrar — parecia que o visitante ia cair
 * no site antigo. Aqui o HTML já sai com o vídeo, e a troca deixa de existir.
 *
 * Continua estático: `generateStaticParams` prerenderiza uma página por
 * consultor do mapa no build. Nada de dinâmico, nada de banco por pageview.
 *
 * Ninguém digita este endereço — o middleware reescreve `/<slug>` pra cá, e a
 * URL que o visitante vê continua sendo a dele.
 */
export function generateStaticParams() {
  return Object.keys(VIDEO_POR_CONSULTOR).map((slug) => ({ slug }))
}

export const dynamicParams = false

export default async function HomeConsultor({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const video = videoDoConsultor(slug)
  if (!video) notFound()

  return <HomeContent video={video} />
}
