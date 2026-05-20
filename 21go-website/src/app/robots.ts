import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers()
  const host = hdrs.get('host') ?? '21go.site'
  const proto = hdrs.get('x-forwarded-proto') ?? 'https'
  const base = `${proto}://${host}`

  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/api/', '/area-do-associado'] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
