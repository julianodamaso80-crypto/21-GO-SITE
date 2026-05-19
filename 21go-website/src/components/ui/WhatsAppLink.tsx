'use client'

import { trackWhatsAppClick } from '@/lib/tracking'

type Props = {
  href: string
  origin: string
  buttonText?: string
  className?: string
  children: React.ReactNode
}

// Wrapper client-side para qualquer link wa.me em página server component.
// Dispara whatsapp_click no dataLayer sem bloquear a navegação.
export function WhatsAppLink({ href, origin, buttonText, className, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(origin, { buttonText })}
      className={className}
    >
      {children}
    </a>
  )
}
