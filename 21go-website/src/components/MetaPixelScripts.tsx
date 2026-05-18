/**
 * Server Component que injeta o Meta Pixel direto no HTML SSR.
 *
 * Le `process.env.META_PIXEL_ID` e `META_PIXEL_ID_2` (sem NEXT_PUBLIC_ prefix)
 * em runtime do servidor — funciona com qualquer env runtime do Easypanel sem
 * precisar passar build args.
 *
 * Suporta ate 2 pixels: todos os `fbq('track',...)` do client disparam pra ambos.
 */
export function MetaPixelScripts() {
  const pixel1 = process.env.META_PIXEL_ID
  const pixel2 = process.env.META_PIXEL_ID_2

  if (!pixel1 && !pixel2) return null

  const initLines = [
    pixel1 ? `fbq('init', '${pixel1}');` : '',
    pixel2 ? `fbq('init', '${pixel2}');` : '',
  ].filter(Boolean).join('\n')

  const script = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
${initLines}
fbq('track', 'PageView');`

  const noscriptImgs = [
    pixel1 ? `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixel1}&ev=PageView&noscript=1"/>` : '',
    pixel2 ? `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixel2}&ev=PageView&noscript=1"/>` : '',
  ].filter(Boolean).join('')

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
