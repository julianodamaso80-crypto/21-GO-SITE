'use client'
import { Instagram, Facebook, Linkedin } from 'lucide-react'
import { useConsultor } from '@/components/ConsultorProvider'
import { instagramDoConsultor } from '@/lib/consultores-instagram'

/**
 * As redes do rodape.
 *
 * No site da 21Go sao as tres da casa. No site de um consultor que esta no
 * `INSTAGRAM_POR_CONSULTOR`, o rodape mostra SO o Instagram DELE: mandar quem
 * chegou pelo site do consultor pras redes da casa e dar de graca pra 21Go o
 * seguidor que ele pagou anuncio pra trazer.
 *
 * Client component so por causa disso — o Footer em volta continua estatico. O
 * slug so existe depois da hidratacao (ver ConsultorProvider), entao o primeiro
 * render e sempre o padrao, igual ao HTML prerenderizado.
 */
const DA_CASA = [
  { icon: Instagram, href: 'https://instagram.com/21go.veicular', label: 'Instagram' },
  { icon: Facebook, href: 'https://facebook.com/21goveicular', label: 'Facebook' },
  { icon: Linkedin, href: 'https://linkedin.com/company/21go', label: 'LinkedIn' },
]

export function FooterSocials() {
  const consultor = useConsultor()
  const instagram = instagramDoConsultor(consultor?.slug)

  const redes = instagram
    ? [{ icon: Instagram, href: instagram, label: 'Instagram' }]
    : DA_CASA

  return (
    <div className="flex gap-3">
      {redes.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#94A3B8] hover:bg-[#F2911D]/10 hover:text-[#F2911D] hover:border-[#F2911D]/30 transition-all duration-200"
        >
          <s.icon size={16} />
        </a>
      ))}
    </div>
  )
}
