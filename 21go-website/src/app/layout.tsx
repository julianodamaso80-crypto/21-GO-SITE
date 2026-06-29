import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'
import { GTMProvider } from '@/components/GTMProvider'
import { MetaPixelScripts } from '@/components/MetaPixelScripts'
import { GoogleAdsConversionScripts } from '@/components/GoogleAdsConversionScripts'
import { WhatsAppTracker } from '@/components/tracking/WhatsAppTracker'
import { CtaTracker } from '@/components/tracking/CtaTracker'
import { SchemaOrg } from '@/components/seo/SchemaOrg'
import SmoothScrollProvider from '@/components/SmoothScrollProvider'
import MobileCTA from '@/components/MobileCTA'

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
    default: '21Go Proteção Veicular RJ — A partir de R$77,50/mês',
    template: '%s | 21Go',
  },
  description: '21Go Proteção Veicular no Rio de Janeiro. Proteja seu carro ou moto a partir de R$77,50/mês. Sem análise de perfil, sem burocracia. 20+ anos no mercado. Simule grátis em 30 segundos.',
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
    apple: '/logo21go.png',
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
        <SmoothScrollProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <WhatsAppButton />
          <MobileCTA />
        </SmoothScrollProvider>
      </body>
    </html>
  )
}
