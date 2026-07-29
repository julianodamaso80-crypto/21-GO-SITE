/**
 * Números de WhatsApp que recebem os contatos dos sites .site.
 *
 * REGRA DE RODÍZIO (decisão do dono, 2026-07-29): a cada 3 cliques, **2 vão pro
 * 4882 e 1 vai pro 4240**. O objetivo é diluir o volume entre dois chips pra
 * nenhum dos dois cair — estava caindo muito com um número só.
 *
 * A escolha acontece server-side em `/api/wa` (ver whatsapp-rotation.ts). Os
 * links do site apontam pra essa rota, não pro wa.me direto.
 */
export interface WhatsAppTarget {
  /** Número no formato E.164 sem "+" (o que o wa.me espera). */
  number: string
  /** Instância na Evolution — só pra rastrear de qual chip é o número. */
  instance: string
  /** Quantos contatos seguidos este número recebe no ciclo. */
  share: number
}

export const WHATSAPP_TARGETS: WhatsAppTarget[] = [
  { number: '5521980214882', instance: 'disparo_xHH2aIEs_site21go', share: 2 },
  { number: '5521965774240', instance: '4240', share: 1 },
]

/**
 * Número usado quando não dá pra passar pelo rodízio (ex: link dentro do PDF
 * renderizado, fallback de erro). É o que tem a maior fatia do ciclo.
 */
export const WHATSAPP_NUMBER = WHATSAPP_TARGETS[0].number

/** Mesmo número formatado para exibição (textos visíveis). */
export const WHATSAPP_NUMBER_DISPLAY = '(21) 98021-4882'

/** Rota interna que sorteia o número e redireciona pro WhatsApp. */
export const WHATSAPP_ROUTE = '/api/wa'

/** Monta o link do rodízio já com a mensagem pré-preenchida. */
export function whatsappLink(text?: string): string {
  return text ? `${WHATSAPP_ROUTE}?text=${encodeURIComponent(text)}` : WHATSAPP_ROUTE
}
