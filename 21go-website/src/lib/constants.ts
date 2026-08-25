/**
 * Números de WhatsApp que recebem os contatos dos sites .site.
 *
 * NÚMERO ÚNICO (decisão do dono, 2026-08-25): **todo contato vai pro 4824**,
 * instância `site4824` na Evolution — o mesmo chip que já envia o PDF. O 4882
 * saiu porque a instância dele (`disparo_xHH2aIEs_site21go`) não existe mais na
 * Evolution: o site continuava mandando cliente pra um chip que ninguém mais
 * acompanhava pelo sistema.
 *
 * Um número só = mais volume por chip. É o risco aceito conscientemente; se o
 * 4824 começar a cair, o caminho de volta é reinserir alvos nesta lista (o
 * rodízio em whatsapp-rotation.ts continua funcionando com N alvos).
 */
export interface WhatsAppTarget {
  /** Número no formato E.164 sem "+" (o que o wa.me espera). */
  number: string
  /** Instância na Evolution — usada pra checar se o chip está no ar. */
  instance: string
  /** Quantos contatos seguidos este número recebe no ciclo. */
  share: number
  /**
   * Env com a apikey DESTA instância. Cada instância da Evolution tem a sua:
   * a chave de uma devolve 401 na outra, então não dá pra usar uma só.
   */
  apiKeyEnv: string
}

export const WHATSAPP_TARGETS: WhatsAppTarget[] = [
  {
    number: '5521969454824',
    instance: 'site4824',
    share: 1,
    apiKeyEnv: 'EVOLUTION_API_KEY_4824',
  },
]

/**
 * Número usado quando não dá pra passar pelo rodízio (ex: link dentro do PDF
 * renderizado, fallback de erro). Com um alvo só, é o mesmo de sempre.
 */
export const WHATSAPP_NUMBER = WHATSAPP_TARGETS[0].number

/** Mesmo número formatado para exibição (textos visíveis). */
export const WHATSAPP_NUMBER_DISPLAY = '(21) 96945-4824'

/** Rota interna que sorteia o número e redireciona pro WhatsApp. */
export const WHATSAPP_ROUTE = '/api/wa'

/** Monta o link do rodízio já com a mensagem pré-preenchida. */
export function whatsappLink(text?: string): string {
  return text ? `${WHATSAPP_ROUTE}?text=${encodeURIComponent(text)}` : WHATSAPP_ROUTE
}
