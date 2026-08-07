import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getPostSlugs } from '@/lib/blog'

export const dynamic = 'force-dynamic'

const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: 'weekly' | 'monthly' }> = [
  { path: '', priority: 1.0, changefreq: 'weekly' },
  { path: '/protecao-veicular', priority: 0.9, changefreq: 'weekly' },
  // Pagina local (07/08/2026): o top 18 de "protecao veicular rj" e todo de concorrente do
  // Rio e o 21go.site nao aparecia em nenhuma posicao.
  { path: '/protecao-veicular-rj', priority: 0.9, changefreq: 'weekly' },
  { path: '/cotacao', priority: 0.9, changefreq: 'weekly' },
  // Resposta oficial a "a 21Go e confiavel?" — a busca da marca traz 6.600/mes e a primeira
  // pagina dela tem Reclame Aqui e video negativo (medido em 06/08/2026).
  { path: '/a-21go-e-confiavel', priority: 0.8, changefreq: 'monthly' },
  { path: '/blog', priority: 0.8, changefreq: 'weekly' },
  { path: '/indique', priority: 0.8, changefreq: 'weekly' },
  { path: '/sobre', priority: 0.7, changefreq: 'weekly' },
  { path: '/faq', priority: 0.7, changefreq: 'weekly' },
  { path: '/seja-consultor', priority: 0.7, changefreq: 'weekly' },
  { path: '/criativos', priority: 0.7, changefreq: 'weekly' },
  { path: '/ouvidoria', priority: 0.7, changefreq: 'weekly' },
  { path: '/denuncia', priority: 0.7, changefreq: 'weekly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers()
  const host = hdrs.get('host') ?? '21go.site'
  const proto = hdrs.get('x-forwarded-proto') ?? 'https'
  const base = `${proto}://${host}`
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, priority, changefreq }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: changefreq,
    priority,
  }))

  const blogEntries: MetadataRoute.Sitemap = getPostSlugs().map((slug) => ({
    url: `${base}/blog/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticEntries, ...blogEntries]
}
