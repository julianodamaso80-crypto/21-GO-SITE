/**
 * Consultores com taxa de ativacao FIXA, combinada na venda do site.
 *
 * A regra oficial da 21Go (`calcActivation` em `data/pricing.ts`) calcula a
 * ativacao pela mensalidade: base + R$ 50, piso R$ 249. Ou seja, ela muda de
 * veiculo pra veiculo. Tem consultor que prefere um numero unico, igual pra
 * qualquer carro, porque e mais facil de falar no telefone e no anuncio.
 *
 * Isso e acordo de UMA venda, nao regra do produto — por isso mapa nominal no
 * codigo, escolhido pelo slug, e nao coluna no banco. Quem nao esta aqui
 * (inclusive a casa) continua na tabela oficial.
 *
 * ⚠️ BYD nao entra: a ativacao dele e R$ 1.550 fixo em todos os sites
 * (`BYD_ACTIVATION`) e nao e negociavel por consultor.
 *
 * Mesmo padrao do `PARCELAMENTO_POR_CONSULTOR`, do `VIDEO_POR_CONSULTOR` e do
 * `PIXEL_POR_CONSULTOR`.
 */
const ATIVACAO_FIXA_POR_CONSULTOR: Record<string, number> = {
  // Pedido do dono em 31/08/2026: R$ 400 pra qualquer veiculo (BYD segue 1.550).
  paivarj21go: 400,
}

/**
 * A ativacao que este site deve mostrar.
 *
 * @param slug   dono do site, ou null/undefined quando e o site da propria 21Go
 * @param padrao valor ja calculado pela tabela oficial (`calcActivation`)
 * @param isBYD  BYD tem valor proprio e ignora o acordo do consultor
 */
export function ativacaoDoConsultor(
  slug: string | null | undefined,
  padrao: number,
  isBYD: boolean,
): number {
  if (isBYD || !slug) return padrao
  const fixa = ATIVACAO_FIXA_POR_CONSULTOR[slug]
  return typeof fixa === 'number' ? fixa : padrao
}
