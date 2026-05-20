'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { captureClickIds, captureUtms } from '@/lib/cookies'
import { trackPageView } from '@/lib/tracking'

// GTM ID é público (vai pro HTML em texto claro) — fallback hardcoded é seguro.
// NEXT_PUBLIC_* é inlinada em build time pelo Next; se o EasyPanel não passar
// como build arg do Dockerfile, o bundle sai sem GTM. Fallback garante que o
// contêiner oficial (21Go - Web - 2) sempre carregue.
// Meta Pixel init agora vive 100% em MetaPixelScripts (SSR). Aqui só GTM.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-WQ9L62XN'

export function GTMProvider() {
  useEffect(() => {
    // Initialize dataLayer
    window.dataLayer = window.dataLayer || []

    // Capture click IDs and UTMs from URL on first load
    captureClickIds()
    captureUtms()

    // Track initial page view
    trackPageView()
  }, [])

  return (
    <>
      {/* Google Tag Manager */}
      {GTM_ID && (
        <>
          <Script
            id="gtm-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${GTM_ID}');
              `,
            }}
          />
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        </>
      )}

      {/* DataLayer init (always, even without GTM — for future use) */}
      {!GTM_ID && (
        <Script
          id="datalayer-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];`,
          }}
        />
      )}
    </>
  )
}
