/**
 * Schema.org JSON-LD pra posts de blog.
 * Article + BreadcrumbList + WebPage com author/publisher entity-linked.
 *
 * Decisao 2026-05-25: FAQPage REMOVIDO (Google retirou rich results em 07/05/2026).
 * Foco em Article + BreadcrumbList + Organization (the trifecta de 2026).
 *
 * Refs:
 *  - https://developers.google.com/search/docs/appearance/structured-data/article
 *  - https://www.digitalapplied.com/blog/structured-data-after-io-2026-schema-updates
 */
import type { BlogPost } from '@/lib/blog'

interface ArticleSchemaProps {
  post: BlogPost
}

const SITE_URL = 'https://21go.site'
const ORG_NAME = '21Go'
const ORG_LOGO = `${SITE_URL}/logo.png`

const AUTHORS: Record<string, { url: string; sameAs: string[]; description: string }> = {
  '21Go': {
    url: `${SITE_URL}/sobre`,
    sameAs: [
      'https://www.instagram.com/21goprotpatri/',
      'https://www.reclameaqui.com.br/empresa/21go-protecao-patrimonial-veicular/',
    ],
    description: 'Equipe Editorial 21Go — Associação de proteção patrimonial veicular do Rio de Janeiro, 20+ anos de mercado.',
  },
  'Letycya': {
    url: `${SITE_URL}/sobre`,
    sameAs: [
      'https://www.instagram.com/21goprotpatri/',
    ],
    description: 'Consultora especialista em proteção patrimonial veicular da 21Go, 15+ anos de experiência.',
  },
}

export function ArticleSchema({ post }: ArticleSchemaProps) {
  const url = `${SITE_URL}/blog/${post.slug}`
  const author = AUTHORS[post.author ?? '21Go'] ?? AUTHORS['21Go']!
  const datePublished = new Date(post.date).toISOString()
  const dateModified = post.lastUpdated ? new Date(post.lastUpdated).toISOString() : datePublished
  const imageBase = post.image ?? '/blog/default.jpg'
  const imageUrl = imageBase.startsWith('http') ? imageBase : `${SITE_URL}${imageBase}`

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    // 3 aspect ratios recomendado pelo Google (Article schema 2026)
    image: [
      imageUrl,
      imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '-4x3.$1').includes('-4x3') ? imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '-4x3.$1') : imageUrl,
      imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '-16x9.$1').includes('-16x9') ? imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '-16x9.$1') : imageUrl,
    ],
    datePublished,
    dateModified,
    author: {
      '@type': 'Person',
      name: post.author ?? '21Go',
      url: author.url,
      sameAs: author.sameAs,
      description: author.description,
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      logo: { '@type': 'ImageObject', url: ORG_LOGO },
      url: SITE_URL,
      sameAs: [
        'https://www.instagram.com/21goprotpatri/',
        'https://www.reclameaqui.com.br/empresa/21go-protecao-patrimonial-veicular/',
      ],
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: (post.keywords ?? []).join(', '),
    inLanguage: 'pt-BR',
    isAccessibleForFree: true,
    articleSection: post.category ?? 'Blog',
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  )
}
