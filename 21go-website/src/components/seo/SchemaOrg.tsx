/**
 * Schema.org global (root layout) — Organization + LocalBusiness.
 *
 * FAQPage REMOVIDO (Google retirou rich results FAQ em 07/05/2026).
 * Foco em entity linking via sameAs pra Knowledge Graph + AI Overviews citation.
 *
 * Refs:
 *  - https://developers.google.com/search/docs/appearance/structured-data
 *  - https://www.digitalapplied.com/blog/structured-data-after-io-2026-schema-updates
 */
export function SchemaOrg() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://21go.site/#organization',
        name: '21Go Proteção Patrimonial Veicular',
        alternateName: '21Go',
        url: 'https://21go.site',
        logo: {
          '@type': 'ImageObject',
          url: 'https://21go.site/logo21go.png',
        },
        description: 'Associação de proteção patrimonial veicular no Rio de Janeiro, 20+ anos. Proteção por mutualismo contra roubo, furto, colisão e incêndio para carros, motos e frotas.',
        foundingDate: '2004',
        // sameAs robusto pra entity linking no Knowledge Graph (+200% citation em AI Overviews)
        sameAs: [
          'https://www.instagram.com/21goprotpatri/',
          'https://www.facebook.com/21goprotpatri',
          'https://www.reclameaqui.com.br/empresa/21go-protecao-patrimonial-veicular/',
          'https://www.youtube.com/@21goprotpatri',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+55-21-96945-4824',
          contactType: 'customer service',
          areaServed: 'BR',
          availableLanguage: ['Portuguese'],
        },
      },
      {
        '@type': 'LocalBusiness',
        '@id': 'https://21go.site/#localbusiness',
        name: '21Go Proteção Patrimonial Veicular',
        url: 'https://21go.site',
        logo: 'https://21go.site/logo21go.png',
        image: 'https://21go.site/logo21go.png',
        telephone: '+55-21-96945-4824',
        email: 'contato@21go.org',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Rio de Janeiro',
          addressRegion: 'RJ',
          postalCode: '20040-020',
          addressCountry: 'BR',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -22.9068,
          longitude: -43.1729,
        },
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '08:00',
          closes: '18:00',
        },
        priceRange: '$$',
        areaServed: { '@type': 'Country', name: 'Brasil' },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://21go.site/#website',
        url: 'https://21go.site',
        name: '21Go Proteção Patrimonial Veicular',
        publisher: { '@id': 'https://21go.site/#organization' },
        inLanguage: 'pt-BR',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://21go.site/blog?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
