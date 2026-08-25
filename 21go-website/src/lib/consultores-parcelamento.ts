/**
 * Consultores cujo site AINDA mostra a ativacao parcelada em 12x.
 *
 * Em 25/08/2026 o parcelamento saiu de todos os sites da 21Go — o principal e
 * os vendidos (ver [[project_taxa_ativacao_regra]]). Logo depois o dono abriu
 * UMA excecao: a Renata, que comprou o site dela, continua podendo oferecer o
 * 12x. Ninguem mais dos que compraram.
 *
 * Por isso a lista e nominal, e nao um flag no banco: e excecao de UMA venda,
 * nao regra do produto. Quem nao esta aqui — inclusive a casa — so mostra o
 * valor a vista.
 *
 * Mesmo padrao do `VIDEO_POR_CONSULTOR` e do `PIXEL_POR_CONSULTOR`: mapa no
 * codigo, escolhido pelo slug. Nao vai ao banco.
 *
 * ⚠️ Nao vale pro disparo automatico do chip da casa
 * (`buildQuoteSummaryMessage`): pela REGRA 0.1 ele nunca sai num site de
 * consultor, entao ali quem fala e sempre a 21Go — e a 21Go nao parcela.
 */
const PARCELAMENTO_POR_CONSULTOR = new Set<string>(['renatatenorio'])

/** `true` so pros consultores que ainda podem exibir o 12x no site deles. */
export function temParcelamento(slug: string | undefined | null): boolean {
  if (!slug) return false
  return PARCELAMENTO_POR_CONSULTOR.has(slug)
}
