import type { Metadata } from 'next'
import Image from 'next/image'
import Link from '@/components/Link'
import { ScrollCinema } from '@/components/cinema/ScrollCinema'
import { HideSiteChrome } from './HideSiteChrome'

/**
 * PROTÓTIPO ISOLADO — experiência cinematográfica de scroll-scrub.
 * Não linkado em nenhum menu, noindex, sem impacto no restante do site.
 */
export const metadata: Metadata = {
  title: 'Preview Scroll 3D (protótipo interno)',
  robots: { index: false, follow: false },
}

export default function PreviewScroll3D() {
  return (
    <div data-preview-3d className="bg-[#0c1330] min-h-screen">
      <HideSiteChrome />

      {/* Header reduzido do protótipo */}
      <header className="preview3d-header fixed top-0 left-0 right-0 z-[80] flex h-14 items-center justify-between border-b border-white/10 bg-[#0c1330]/70 px-5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo21go.png" alt="21Go Proteção Veicular" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-bold text-white">21Go</span>
          <span className="ml-2 rounded-full border border-[#C7D301]/40 bg-[#C7D301]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#C7D301]">
            protótipo scroll 3D
          </span>
        </Link>
        <Link
          href="/cotacao"
          className="rounded-lg bg-[#F2911D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#D67A0F] transition-colors"
        >
          Fazer minha cotação
        </Link>
      </header>

      <main className="pt-0">
        <ScrollCinema />
      </main>
    </div>
  )
}
