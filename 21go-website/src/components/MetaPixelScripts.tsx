/**
 * Server Component que injeta o Meta Pixel direto no HTML SSR.
 *
 * Pixel ID HARDCODED de proposito: o ID e publico (sai no HTML cliente)
 * e usar env aqui criava bug — paginas estaticas prerenderizadas em build
 * time pegavam env vazia (Easypanel injeta env so em runtime, sem build-args).
 * Pra trocar de pixel, edita esse arquivo direto e commita.
 *
 * Token CAPI (secret) continua em env runtime pelo lado server (conversion-apis.ts).
 *
 * Decisao user 2026-06-01: usar SOMENTE o PIXEL 21 (999953532385177, BM Juliano Damaso
 * 215936062346243). O pixel anterior do Marcos Alves (2777380499304351) foi removido.
 */

// PIXEL 21 — UNICO pixel ativo (BM 215936062346243 / dono Juliano Damaso)
const PIXEL_ID = '999953532385177'

export function MetaPixelScripts() {
  const script = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');`

  const noscriptImgs =
    `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1"/>`

  return (
    <>
      <script
        id="meta-pixel-ssr"
        dangerouslySetInnerHTML={{ __html: script }}
      />
      <noscript dangerouslySetInnerHTML={{ __html: noscriptImgs }} />
    </>
  )
}
