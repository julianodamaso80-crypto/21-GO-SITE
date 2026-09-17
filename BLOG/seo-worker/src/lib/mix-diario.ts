/**
 * Mix diario de artigos (decisao do dono em 17/09/2026): 10 por dia.
 *
 * Fonte unica: o write worker usa pra cota do dia e o Agente 01 usa pra dividir as
 * seeds e as vagas de keyword da pesquisa semanal. Mudar o mix e mudar SO aqui.
 *
 * E teto, nao meta a cumprir a qualquer custo: se a categoria nao tiver briefing que
 * passou pelo anti-canibalizacao, o dia sai com menos artigo — nunca com artigo
 * repetido pra fechar numero.
 */
export type SlotDiario = 'byd' | 'carros' | 'motos' | 'frotas';

export const MIX_DIARIO: ReadonlyArray<{ cat: SlotDiario; qtd: number }> = [
  { cat: 'byd', qtd: 3 },
  { cat: 'carros', qtd: 3 },
  { cat: 'motos', qtd: 3 },
  { cat: 'frotas', qtd: 1 },
];

/**
 * "Carros no geral": o slot de carros tambem aceita a pauta `educativo` (IPVA, CRLV,
 * multa, transferencia), que e assunto de dono de carro e ficou sem slot proprio.
 */
export const CATEGORIAS_DO_SLOT: Record<SlotDiario, readonly string[]> = {
  byd: ['byd'],
  carros: ['carros', 'educativo'],
  motos: ['motos'],
  frotas: ['frotas'],
};

export function somaPorSlot(slot: SlotDiario, porCategoria: Record<string, number>): number {
  return CATEGORIAS_DO_SLOT[slot].reduce((t, c) => t + (porCategoria[c] ?? 0), 0);
}
