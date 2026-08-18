/**
 * As duas decisoes de roteamento do painel. Puro e sem import de proposito:
 * quem roda isto e o middleware, que roda em TODA navegacao dos 18 sites
 * vendidos. Erro aqui nao aparece como erro — aparece como consultor
 * reclamando que pagou anuncio e nao recebeu lead.
 */

const FORMATO_SLUG = /^[a-z0-9]{3,40}$/

/** `parceiroanderson.21go.com.br` -> `andersonagripino`. */
export function painelDoHost(host: string, mapa: Record<string, string>): string | null {
  if (!host) return null
  // `host` vem com porta em dev (`...:3000`).
  return mapa[host.split(':')[0].toLowerCase()] ?? null
}

/**
 * `/andersonagripino/juliano/cotacao` -> vendedor `juliano`, resto `/cotacao`.
 *
 * Quem chama ja conferiu que o 1o segmento e um consultor COM painel. Sem esse
 * corte, `/manghi/qualquercoisa` deixaria de ser 404 nos outros 17 sites.
 */
export function vendedorDoCaminho(
  segmentos: string[],
  reservadas: Set<string>,
): { vendedor: string; resto: string } | null {
  const candidato = segmentos[1]
  if (!candidato) return null
  if (reservadas.has(candidato)) return null
  if (!FORMATO_SLUG.test(candidato)) return null
  return { vendedor: candidato, resto: `/${segmentos.slice(2).join('/')}` }
}
