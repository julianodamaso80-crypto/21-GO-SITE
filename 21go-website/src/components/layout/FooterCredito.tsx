'use client'
import { useConsultor } from '@/components/ConsultorProvider'

const MARCA = (
  <>
    <span className="text-[10px] uppercase tracking-widest text-[#64748B] group-hover:text-[#94A3B8] transition-colors">
      Desenvolvido por
    </span>
    <picture>
      <source srcSet="/images/flowai-digital-branca.webp" type="image/webp" />
      <img
        src="/images/flowai-digital-branca.png"
        alt="FlowAI Digital"
        width={640}
        height={210}
        className="h-8 w-auto"
        loading="lazy"
        decoding="async"
      />
    </picture>
  </>
)

/**
 * O credito da agencia no rodape.
 *
 * No site da 21Go ele abre o WhatsApp da FlowAI — e por ali que entra quem viu
 * o site e quer um igual.
 *
 * No site de um consultor ele NAO e link. Era o unico contato do site vendido
 * que saia pra um numero que nao e o do dono do site: quem clicasse ali,
 * achando que falava com o atendimento, caia noutro WhatsApp. E a REGRA 0.1
 * (todo contato de `/<slug>` e do consultor) — a marca fica, o link sai.
 */
export function FooterCredito() {
  const consultor = useConsultor()

  if (consultor) {
    return <div className="group inline-flex flex-col items-center gap-1.5 opacity-80">{MARCA}</div>
  }

  return (
    <a
      href="https://wa.me/5521992208062?text=Ol%C3%A1%21%20Vi%20o%20site%20da%2021Go%20e%20quero%20um%20site%20assim."
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Site desenvolvido por FlowAI Digital — fale no WhatsApp"
      className="group inline-flex flex-col items-center gap-1.5 opacity-80 transition-all duration-200 hover:opacity-100"
    >
      {MARCA}
    </a>
  )
}
