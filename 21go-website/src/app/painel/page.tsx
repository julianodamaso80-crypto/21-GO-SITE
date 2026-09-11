import type { Metadata } from 'next'
import { Barlow, Barlow_Condensed, JetBrains_Mono } from 'next/font/google'
import { PainelIsa } from '@/components/isa/PainelIsa'

/**
 * 21go.site/painel — o painel de atendimento da Isa (dono e Leticya).
 *
 * Pagina UNICA de proposito: /painel/<qualquer-coisa> e do painel do PARCEIRO
 * (src/app/painel/[slug], alcancado pelo subdominio parceiroX.21go.com.br). Toda a
 * navegacao aqui e interna ao componente; os dados vem de /api/atendimento/*.
 */

export const metadata: Metadata = {
  title: 'Atendimento Isa · 21Go',
  robots: { index: false, follow: false },
}

// Barlow e da familia DIN — a fonte da marca e a DIN Next (manual_marca_21go v1.0).
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fonte-painel' })
const barlowCond = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--fonte-rotulo' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--fonte-mono' })

export default function PaginaPainel() {
  return (
    <div className={`${barlow.variable} ${barlowCond.variable} ${mono.variable}`}>
      <PainelIsa />
    </div>
  )
}
