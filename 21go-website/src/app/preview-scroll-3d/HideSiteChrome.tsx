'use client'

/**
 * Esconde o chrome global do site (Header/Footer/CTA mobile/botão WhatsApp)
 * SOMENTE dentro do protótipo /preview-scroll-3d — o layout raiz não é
 * alterado, então nenhuma outra página é afetada.
 */
export function HideSiteChrome() {
  return (
    <style>{`
      body:has([data-preview-3d]) header:not(.preview3d-header),
      body:has([data-preview-3d]) footer,
      body:has([data-preview-3d]) [data-cta-section="mobile_cta"],
      body:has([data-preview-3d]) a[aria-label="Fale conosco pelo WhatsApp"] {
        display: none !important;
      }
      body:has([data-preview-3d]) main { padding: 0 !important; }
    `}</style>
  )
}
