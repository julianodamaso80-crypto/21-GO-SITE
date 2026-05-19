'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { captureClickIds, captureUtms } from '@/lib/cookies'
import { trackPageView } from '@/lib/tracking'

// GTM ID é público (vai pro HTML em texto claro) — fallback hardcoded é seguro.
// NEXT_PUBLIC_* é inlinada em build time pelo Next; se o EasyPanel não passar
// como build arg do Dockerfile, o bundle sai sem GTM. Fallback garante que o
// contêiner oficial (21Go - Web - 2) sempre carregue.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-WQ9L62XN'
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const META_PIXEL_ID_2 = process.env.NEXT_PUBLIC_META_PIXEL_ID_2

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

      {/* Meta Pixel — suporta multiplos pixels (todos os fbq('track',...) disparam pra ambos) */}
      {(META_PIXEL_ID || META_PIXEL_ID_2) && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              ${META_PIXEL_ID ? `fbq('init', '${META_PIXEL_ID}');` : ''}
              ${META_PIXEL_ID_2 ? `fbq('init', '${META_PIXEL_ID_2}');` : ''}
            `,
          }}
        />
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
