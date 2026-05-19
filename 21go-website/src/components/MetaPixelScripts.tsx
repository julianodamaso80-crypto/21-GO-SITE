/**
 * Server Component que injeta o Meta Pixel direto no HTML SSR.
 *
 * Pixel IDs sao HARDCODED de proposito: o ID e publico (sai no HTML cliente)
 * e usar env aqui criava bug — paginas estaticas prerenderizadas em build
 * time pegavam env vazia (Easypanel injeta env so em runtime, sem build-args).
 * Pra trocar de pixel, edita esse arquivo direto e commita.
 *
 * Token CAPI (secret) continua em env runtime pelo lado server (conversion-apis.ts).
 */

// Pixel 1 — "21go" (BM 2783265268660874 / dono Marcos Alves)
const PIXEL_1 = '2777380499304351'
// Pixel 2 — "PIXEL 21" (BM 215936062346243 / dono Juliano Damaso)
const PIXEL_2 = '999953532385177'

export function MetaPixelScripts() {
  const script = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_1}');
fbq('init', '${PIXEL_2}');`

  const noscriptImgs =
    `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL_1}&ev=PageView&noscript=1"/>` +
    `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL_2}&ev=PageView&noscript=1"/>`

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
