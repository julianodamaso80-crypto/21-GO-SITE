/**
 * Quem decide se a 21Go faz o veiculo — a regra sozinha, sem rede, pra poder ser testada.
 *
 * A lista certa e a do PowerCRM (`POST /api/plans/`), que e a mesma resposta que o consultor
 * ve na cotacao dele. Regra do dono (06/08/2026), depois de perder venda com veiculo que a
 * 21Go faz: o site segue 100% o Power, sem lista paralela e sem regra propria.
 *
 *   1. "nao fazemos esse veiculo" so pode ser dito quando o Power CONFIRMA que nao ha plano.
 *   2. Silencio do Power nao e "nao": se a consulta falhou, o cliente vai pro consultor.
 *
 * O que saiu junto desta decisao:
 *   - a lista de ~100 marcas/modelos escrita a mao (rodava no front DEPOIS de o Power ja ter
 *     aprovado o veiculo — so podia virar "faz" em "nao faz");
 *   - o corte de ano em 2006 (o Power da plano pra Gol, Uno, Celta e Civic de 2005 ate 1998).
 *
 * A allowlist extraida (`vehicle-allowlist.ts`) ficou so como sinal de "vale um humano
 * conferir": ela envelhece rapido — com 3 dias ja bloqueava o BYD Dolphin Mini, que o Power
 * cota normalmente — entao nao dispensa cliente sozinha.
 */

export type Elegibilidade =
  /** Power confirmou plano de protecao (ou nao ha motivo pra duvidar) — segue a cotacao. */
  | { acao: 'cotar' }
  /** Power confirmou que nao ha plano. A tela agradece e encerra. */
  | { acao: 'nao_fazemos'; motivo: 'model' }
  /** Nao deu pra confirmar. Cliente vai pro WhatsApp do consultor, nunca dispensado. */
  | { acao: 'consultor'; motivo: 'elegibilidade_indisponivel' }

export interface EntradaElegibilidade {
  /** Resposta do `/api/plans/`: true da plano, false nao da, null nao deu pra perguntar. */
  powerAoVivo: boolean | null
  /** Allowlist extraida do painel: true/false, null quando nao ha id pra consultar. */
  allowlist: boolean | null
}

export function decidirElegibilidade(e: EntradaElegibilidade): Elegibilidade {
  if (e.powerAoVivo === true) return { acao: 'cotar' }
  if (e.powerAoVivo === false) return { acao: 'nao_fazemos', motivo: 'model' }

  // Power mudo. So mandamos pro consultor quando ha suspeita de verdade (a lista extraida diz
  // que essa versao nao esta em tabela nenhuma). Sem suspeita, cota normal: derrubar cotacao
  // porque uma API piscou custa venda.
  if (e.allowlist === false) return { acao: 'consultor', motivo: 'elegibilidade_indisponivel' }
  return { acao: 'cotar' }
}
