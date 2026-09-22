/**
 * Reativacao da simulacao expirada — regra do dono (21/09/2026): "quando passar os 7 dias
 * que tiver que reativar, faca isso tambem" e "voce so vai reativar o cliente 2 vezes, nunca
 * mais que isso, de 7 em 7 dias". Vale so para clientes deste mes (setembro/2026) em diante.
 *
 * O botao "Reativar" do painel (`/company/renewQuotation`) da mais 7 dias e grava no historico
 * "Leticya reativou essa Simulacao por mais 7 dias". A contagem sai desse historico — do
 * proprio Power —, e nao de uma conta nossa que poderia se perder.
 */

export const MAX_REATIVACOES = 2
export const CORTE_REATIVACAO = '2026-09-01'

/** "22/09/2026 - 11:25" (formato do painel) e de `corte` (aaaa-mm-dd) em diante? */
export function criadoDesde(dataPainel: string | null | undefined, corte: string): boolean {
  const m = String(dataPainel ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return false
  return `${m[3]}-${m[2]}-${m[1]}` >= corte
}

export interface ItemDoFunil {
  quotationExpire?: boolean
  pipelineColumn?: number
  createdDate?: string
  salesmanName?: string | null
  isShelved?: boolean
  isFleet?: boolean
}

export function candidatoAReativar(i: ItemDoFunil): boolean {
  if (!i.quotationExpire || i.isShelved) return false
  // Da vistoria em diante e territorio do time interno (CLAUDE.md do CRM, 15.9).
  if (i.pipelineColumn !== 1 && i.pipelineColumn !== 2) return false
  if (!/^leticya/i.test(i.salesmanName ?? '')) return false
  return criadoDesde(i.createdDate, CORTE_REATIVACAO)
}

export function vezesReativada(historico: { message?: string | null }[] | null | undefined): number {
  return (historico ?? []).filter((h) => /reativou/i.test(h.message ?? '')).length
}
