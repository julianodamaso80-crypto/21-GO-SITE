import type { Metadata } from 'next'
import { Barlow } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'
import { GTMProvider } from '@/components/GTMProvider'
import { MetaPixelScripts } from '@/components/MetaPixelScripts'
import { WhatsAppTracker } from '@/components/tracking/WhatsAppTracker'
import { SchemaOrg } from '@/components/seo/SchemaOrg'
import SmoothScrollProvider from '@/components/SmoothScrollProvider'
import MobileCTA from '@/components/MobileCTA'

/* Barlow = equivalente web da fonte DIN (família oficial da 21Go) */
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Proteja Seu Carro ou Moto | 21Go — A partir de R$77,50/mês',
    template: '%s | 21Go',
  },
  description: 'Proteja seu carro ou moto no Rio de Janeiro a partir de R$77,50/mês. Sem análise de perfil, sem burocracia. 20+ anos cuidando do seu veículo. Simule grátis em 30 segundos.',
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={barlow.variable}>
      <body>
        <MetaPixelScripts />
        <GTMProvider />
        <WhatsAppTracker />
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
