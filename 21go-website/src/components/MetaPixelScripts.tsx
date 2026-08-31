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

// PIXEL 21 — pixel da casa, ativo em TODAS as paginas
const PIXEL_ID = '999953532385177'

/**
 * Pixel PROPRIO do consultor, so no site dele (`21go.com.br/<slug>`).
 *
 * Quem anuncia o proprio site precisa do proprio pixel: sem isso ele paga o
 * anuncio e o Meta otimiza pra conta da casa, nao pra dele.
 *
 * O slug NAO existe em build time (o site do consultor e a mesma pagina
 * prerenderizada, servida por rewrite do middleware), entao o mapa vai inteiro
 * pro HTML e a escolha acontece no navegador lendo `location.pathname` — o
 * mesmo motivo pelo qual o ConsultorProvider le a URL em vez de header. ID de
 * pixel e publico por natureza, entao expor o mapa nao vaza nada.
 *
 * Aqui so o `init`: os `fbq('track', ...)` do site (PageView, Lead) disparam
 * pra todo pixel inicializado, entao o consultor recebe os eventos do site dele
 * sem duplicar codigo de evento. Pra somar consultor novo, e so acrescentar uma
 * linha e commitar.
 */
const PIXEL_POR_CONSULTOR: Record<string, string> = {
  andersonagripino: '1044939631609503',
  regionalararuama: '1011719121892329',
}

export function MetaPixelScripts() {
  // Preview (GitHub Pages): nao dispara analytics fora do dominio oficial
  if (process.env.NEXT_PUBLIC_PREVIEW === '1') return null

  const script = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
var pxConsultor = (${JSON.stringify(PIXEL_POR_CONSULTOR)})[location.pathname.split('/')[1] || ''];
if (pxConsultor) fbq('init', pxConsultor);`

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
