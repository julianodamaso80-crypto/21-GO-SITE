/**
 * Server Component que injeta o gtag.js do Google Ads direto no HTML SSR.
 *
 * Conversion ID HARDCODED de propósito — mesma decisão do MetaPixelScripts:
 * env NEXT_PUBLIC_* em build Easypanel é frágil e em prerender static a env
 * vai vazia (ver feedback_next_static_easypanel_env). Pra trocar de conta de
 * Google Ads, edita esse arquivo direto e commita.
 *
 * Labels usados (conta Google Ads 471-244-0780 — 21 GO / MEU CAIXA):
 *  - LEAD_LABEL          → 21go-site-lead (SUBMIT_LEAD_FORM, value R$ 50, 30d lookback)
 *
 * Disparado em:
 *  - trackCotacaoInicio() → fireConversion('lead', ...) — clique em "Ver Simulação"
 *  - trackCotacaoCompleta() → fireConversion('lead', ...) — resultado aparece (qualidade)
 *  - trackWhatsAppClick() → fireConversion('lead', ...) — fallback pra cliques no WhatsApp
 *
 * Window helpers expostos:
 *  - window.gtag           — função padrão do Google
 *  - window.__21GO_GADS    — objeto com {CONVERSION_ID, LEAD_LABEL} pra uso em tracking.ts
 */

// Conta Google Ads 471-244-0780 (21 GO - JULIANO / MEU CAIXA)
const CONVERSION_ID = '16811926370'

// Label do conversion action `21go-site-lead` (SUBMIT_LEAD_FORM)
const LEAD_LABEL = 'mqEWCIzt5KQcEOLGxtA-'

export function GoogleAdsConversionScripts() {
  // Init gtag inline (executa ANTES do gtag.js async carregar — fila em window.dataLayer)
  const initScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', 'AW-${CONVERSION_ID}', { allow_enhanced_conversions: true });
window.__21GO_GADS = { CONVERSION_ID: '${CONVERSION_ID}', LEAD_LABEL: '${LEAD_LABEL}' };
`.trim()

  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=AW-${CONVERSION_ID}`}
      />
      <script
        id="google-ads-gtag-ssr"
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
    </>
  )
}
