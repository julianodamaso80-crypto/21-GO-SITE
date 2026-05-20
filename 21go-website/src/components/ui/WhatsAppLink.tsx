type Props = {
  href: string
  origin: string
  buttonText?: string
  className?: string
  children: React.ReactNode
}

// Wrapper para links wa.me. O dispatch real do whatsapp_click vem do
// WhatsAppTracker global (event delegation). Aqui só anotamos o <a> com
// data-track-origin pro handler global usar a origem certa.
export function WhatsAppLink({ href, origin, buttonText, className, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-track-origin={origin}
      data-track-button-text={buttonText}
      className={className}
    >
      {children}
    </a>
  )
}
