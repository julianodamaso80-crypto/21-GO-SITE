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
 *     aprovado o veiculo — so podia virar "faz" em "nao faz").
 *
 * A allowlist extraida (`vehicle-allowlist.ts`) ficou so como sinal de "vale um humano
 * conferir": ela envelhece rapido — com 3 dias ja bloqueava o BYD Dolphin Mini, que o Power
 * cota normalmente — entao nao dispensa cliente sozinha.
 *
 * EXCECAO DE ANO (ordem do dono, 12/08/2026): o corte em 2006 VOLTOU e vale acima do Power.
 * Motivo: as tabelas de preco do Power cotam ate 1998, mas a 21Go nao aceita veiculo abaixo de
 * 2006 — sairam do site um Ford Ka 2003 (id 1678) e outros com plano cheio vindo do Power.
 * Aqui o Power nao e a autoridade: e cadastro dele que esta largo, nao regra comercial.
 */

export type Elegibilidade =
  /** Power confirmou plano de protecao (ou nao ha motivo pra duvidar) — segue a cotacao. */
  | { acao: 'cotar' }
  /**
   * Nao fazemos: `model` = o Power negou; `ano` = anterior a 2006; `byd_leilao` = BYD de
   * leilao/remarcado. A tela agradece e encerra.
   */
  | { acao: 'nao_fazemos'; motivo: 'model' | 'ano' | 'byd_leilao' }
  /** Nao deu pra confirmar. Cliente vai pro WhatsApp do consultor, nunca dispensado. */
  | { acao: 'consultor'; motivo: 'elegibilidade_indisponivel' }

/** Primeiro ano-modelo que a 21Go aceita. Abaixo disso nao ha cotacao, o Power que se entenda. */
export const ANO_MINIMO = 2006

/** Ano desconhecido nao reprova: dispensar cliente no escuro e o erro que custa venda. */
export function aceitaAno(ano: number | null | undefined): boolean {
  if (ano == null || !Number.isFinite(ano)) return true
  return ano >= ANO_MINIMO
}

/**
 * BYD de leilao ou remarcado nao e aceito — NENHUM modelo (ordem do dono, 27/08/2026).
 *
 * Como a exececao de ano, esta regra vence o Power: ele cota o veiculo normalmente (saiu do
 * site um Song Pro 2025 marcado como leilao, com plano Veiculos Especiais e ativacao de
 * R$ 1.550). Nao e cadastro largo do Power — e regra comercial que so existe aqui.
 *
 * Olha marca E modelo porque nem todo fluxo separa os dois: a descricao que chega pode ser
 * "BYD Song Pro GL 1.5 16V Aut. (Hibrido)" inteira no modelo. `\bbyd\b` pra nao pegar marca
 * nenhuma que apenas contenha essas tres letras.
 */
export function ehBydDeLeilao(
  marca: string | null | undefined,
  modelo: string | null | undefined,
  origem: string | null | undefined,
): boolean {
  if (!origem || origem === 'nao') return false
  return /\bbyd\b/i.test(`${marca || ''} ${modelo || ''}`)
}

export interface EntradaElegibilidade {
  /** Ano-modelo do veiculo. `null` quando nao deu pra resolver. */
  ano: number | null
  /** Resposta do `/api/plans/`: true da plano, false nao da, null nao deu pra perguntar. */
  powerAoVivo: boolean | null
  /** Allowlist extraida do painel: true/false, null quando nao ha id pra consultar. */
  allowlist: boolean | null
  /** Marca do veiculo, como o Power devolveu. So usada pra barrar BYD de leilao. */
  marca?: string | null
  /** Modelo/versao do veiculo. Idem. */
  modelo?: string | null
  /** Origem declarada pelo cliente: 'nao' | 'leilao' | 'remarcado'. */
  origem?: string | null
}

export function decidirElegibilidade(e: EntradaElegibilidade): Elegibilidade {
  // Antes do Power de proposito: sao as duas regras do site que vencem a resposta dele.
  if (!aceitaAno(e.ano)) return { acao: 'nao_fazemos', motivo: 'ano' }
  if (ehBydDeLeilao(e.marca, e.modelo, e.origem)) {
    return { acao: 'nao_fazemos', motivo: 'byd_leilao' }
  }

  if (e.powerAoVivo === true) return { acao: 'cotar' }
  if (e.powerAoVivo === false) return { acao: 'nao_fazemos', motivo: 'model' }

  // Power mudo. So mandamos pro consultor quando ha suspeita de verdade (a lista extraida diz
  // que essa versao nao esta em tabela nenhuma). Sem suspeita, cota normal: derrubar cotacao
  // porque uma API piscou custa venda.
  if (e.allowlist === false) return { acao: 'consultor', motivo: 'elegibilidade_indisponivel' }
  return { acao: 'cotar' }
}
