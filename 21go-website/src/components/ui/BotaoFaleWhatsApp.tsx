'use client'

/**
 * O botao "Fale no WhatsApp" — e o unico lugar onde ele se comporta diferente
 * nos dois tipos de site.
 *
 * Nos .site (21go.site / 21goconsultoraleticya.site) NADA abre o WhatsApp sem
 * formulario antes: contato anonimo em volume e o que vinha derrubando os chips
 * da casa (regra do dono, 07/08/2026). La o botao continua indo pra /cotacao,
 * exatamente como antes.
 *
 * No site do consultor (`21go.com.br/<slug>`) o numero e DELE, nao da casa: nao
 * ha rodizio pra proteger nem chip da 21Go em risco, e mandar o visitante pra
 * cotacao fazia os dois botoes do hero irem pro mesmo lugar — quem clicou em
 * "Fale no WhatsApp" queria falar. Vai direto, pelo `/api/wa?c=<slug>`, que
 * resolve o numero do consultor no servidor (e cai no rodizio da casa se o site
 * dele estiver cancelado, pra ninguem ficar sem atendimento).
 */

import Link from '@/components/Link'
import { useConsultor } from '@/components/ConsultorProvider'
import { trackWhatsAppClick } from '@/lib/tracking'

/** Sem nome nem veiculo — quem chega por aqui ainda nao preencheu nada. */
const MENSAGEM = 'Olá! Vim pelo seu site e quero fazer uma cotação de proteção veicular.'

export function BotaoFaleWhatsApp({
  origin,
  className,
  children,
}: {
  /** Origem pro tracking (ex: 'hero', 'final_cta'). */
  origin: string
  className?: string
  children: React.ReactNode
}) {
  const consultor = useConsultor()

  // O slug so aparece depois da hidratacao (ver ConsultorProvider), entao o
  // primeiro render e sempre este — e o mesmo do HTML prerenderizado.
  if (!consultor) {
    return (
      <Link href="/cotacao" className={className}>
        {children}
      </Link>
    )
  }

  return (
    <a
      href={`/api/wa?c=${consultor.slug}&text=${encodeURIComponent(MENSAGEM)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(origin, { buttonText: 'Fale no WhatsApp' })}
      className={className}
    >
      {children}
    </a>
  )
}
