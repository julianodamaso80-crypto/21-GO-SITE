export function SchemaOrg() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://21go.site/#organization',
        name: '21Go Proteção Veicular',
        url: 'https://21go.site',
        logo: {
          '@type': 'ImageObject',
          url: 'https://21go.site/logo21go.png',
        },
        description: 'Associação de proteção veicular no Rio de Janeiro com mais de 20 anos de mercado. Proteção por mutualismo contra roubo, furto, colisão e incêndio.',
        foundingDate: '2004',
        sameAs: [
          'https://instagram.com/21go.veicular',
          'https://facebook.com/21goveicular',
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': 'https://21go.site/#localbusiness',
        name: '21Go Proteção Veicular',
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
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://21go.site/#faq',
        mainEntity: [
          { '@type': 'Question', name: 'O que é proteção veicular?', acceptedAnswer: { '@type': 'Answer', text: 'Proteção veicular é um sistema cooperativo (mutualismo) onde associados dividem os custos de eventos. Diferente do seguro tradicional, não há análise de perfil e o custo é significativamente menor.' } },
          { '@type': 'Question', name: 'Qual a diferença entre proteção veicular e seguro?', acceptedAnswer: { '@type': 'Answer', text: 'O seguro é oferecido por seguradoras com análise de perfil e preços altos. A proteção veicular funciona por mutualismo — todos contribuem para um fundo comum, o que reduz o custo em até 60%.' } },
          { '@type': 'Question', name: 'Quanto custa a proteção veicular na 21Go?', acceptedAnswer: { '@type': 'Answer', text: 'Para carros a partir de R$106,50/mês (Básico), para motos a partir de R$77,50/mês. Temos 8 planos: Básico, Do Seu Jeito, VIP, Premium, SUV, VIP Moto 400cc, VIP Moto 1000cc e Veículos Especiais.' } },
          { '@type': 'Question', name: 'Posso cancelar a qualquer momento?', acceptedAnswer: { '@type': 'Answer', text: 'Sim. Não existe fidelidade nem multa por cancelamento. Você pode cancelar quando quiser.' } },
          { '@type': 'Question', name: 'A 21Go aceita carros antigos?', acceptedAnswer: { '@type': 'Answer', text: 'Sim! A 21Go protege qualquer carro, qualquer ano, sem análise de perfil.' } },
        ],
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
