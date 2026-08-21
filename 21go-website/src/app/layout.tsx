import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { GTMProvider } from '@/components/GTMProvider'
import { MetaPixelScripts } from '@/components/MetaPixelScripts'
import { GoogleAdsConversionScripts } from '@/components/GoogleAdsConversionScripts'
import { WhatsAppTracker } from '@/components/tracking/WhatsAppTracker'
import { CtaTracker } from '@/components/tracking/CtaTracker'
import { SchemaOrg } from '@/components/seo/SchemaOrg'
import SmoothScrollProvider from '@/components/SmoothScrollProvider'
import MobileCTA from '@/components/MobileCTA'
import { ConsultorProvider } from '@/components/ConsultorProvider'
import { PAINEL_POR_HOST } from '@/lib/consultores-painel'

/* Inter = fallback oficial (Google Fonts) do manual de marca 21Go v1.0 abr/2026 */
/* Pesos cobrindo: Light(300), Regular(400), Medium(500), Bold(700), Heavy/ExtraBold(800) */
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '21Go Proteção Patrimonial Veicular RJ — A partir de R$77,50/mês',
    template: '%s | 21Go',
  },
  description: '21Go Proteção Patrimonial Veicular no Rio de Janeiro. Proteja seu carro ou moto a partir de R$77,50/mês. Sem análise de perfil, sem burocracia. 20+ anos no mercado. Simule grátis em 30 segundos.',
  metadataBase: new URL('https://21go.site'),
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: '21Go',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://21go.site' },
  icons: {
    icon: '/favicon.ico',
    // 8,5 KB em vez dos 109 KB do logo original (era servido cru: images.unoptimized)
    apple: '/apple-icon-180.png',
  },
  // Meta Domain Verification — só BM Juliano Damaso (215936062346243),
  // dono do PIXEL 21 (999953532385177) — único pixel ativo desde 2026-06-01.
  other: {
    'facebook-domain-verification': [
      '0ruuwkhj1e6bnadcippr9exl3jqncs', // 21go.site
      '7ov5n8z6gtw4zo8qh9q3kue5bzhp9b', // 21goconsultoraleticya.site
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <MetaPixelScripts />
        <GoogleAdsConversionScripts />
        <GTMProvider />
        <WhatsAppTracker />
        <CtaTracker />
        <SchemaOrg />
        {/* Envolve tudo: num site de consultor (/julianodamaso) é o que faz
            todo <Link> carregar o slug junto e o visitante nunca escorregar
            pra home da 21Go. Fora dele, não faz nada. */}
        {/* O painel do parceiro (`parceiroanderson.21go.com.br`) NAO leva o site
            em volta: header e rodape de marketing la dentro mandariam o dono
            do painel pra "Simulacao", "Area do Associado" e ate pro "Falar com
            a 21Go" — a casa dentro do produto que ele comprou.

            Script inline em vez de efeito do React de proposito: roda ANTES da
            pintura, entao o header nao pisca antes de sumir. Mesmo padrao do
            MetaPixelScripts, que ja escolhe o pixel lendo `location`. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=(location.hostname||'').toLowerCase();if(${JSON.stringify(
              Object.keys(PAINEL_POR_HOST),
            )}.indexOf(h)>=0)document.documentElement.setAttribute('data-painel','1')}catch(e){}})()`,
          }}
        />
        <ConsultorProvider>
          <SmoothScrollProvider>
            {/* `display:contents` faz o embrulho sumir do layout: o header
                continua grudando no topo como sempre no site normal. */}
            <div data-chrome-do-site style={{ display: 'contents' }}>
              <Header />
            </div>
            <main>{children}</main>
            <div data-chrome-do-site style={{ display: 'contents' }}>
              <Footer />
            </div>
            {/* Botão flutuante do WhatsApp removido (ordem do dono, 03/08/2026):
                o único caminho pro atendimento é a simulação em /cotacao. */}
            <div data-chrome-do-site style={{ display: 'contents' }}>
              <MobileCTA />
            </div>
          </SmoothScrollProvider>
        </ConsultorProvider>
      </body>
    </html>
  )
}
