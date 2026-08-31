/**
 * Converte a resposta do PowerCRM nos planos que vao pra tela do cliente.
 *
 * Fica aqui, e nao em `pricing.ts`, porque junta duas fontes: o PRECO e a LISTA sao do Power
 * (`powercrm-planos.regras.ts`) e as COBERTURAS sao nossas (`PLAN_INFO`). A tabela local
 * (`PRICING_TABLES`) so entra pra calcular o desconto de leilao — regra que e nossa, o Power
 * nao sabe que o veiculo e de leilao.
 */

import { PLAN_INFO, PRICING_TABLES, type QuotePlan } from '@/data/pricing'
import { descontoDeLeilao, type PlanoLidoDoPower } from './powercrm-planos.regras'

/**
 * Monta os planos da tela a partir do que o Power respondeu.
 *
 * Lista vazia entra e lista vazia sai: quando o Power nao da plano, o site NAO preenche a
 * lacuna com tabela propria — mostra a tela de "nao fazemos esse veiculo".
 */
export function planosDoPowerParaTela(
  lidos: PlanoLidoDoPower[],
  fipeValue: number,
  isLeilao = false,
): QuotePlan[] {
  const planos: QuotePlan[] = []
  for (const p of lidos) {
    const info = PLAN_INFO[p.id]
    if (!info) continue
    let monthly = p.monthly
    if (isLeilao) {
      const desconto = descontoDeLeilao(PRICING_TABLES[p.id], fipeValue)
      // Nunca zera nem inverte: o desconto so vale se sobrar preco de verdade.
      if (desconto > 0 && desconto < monthly) monthly = Number((monthly - desconto).toFixed(2))
    }
    planos.push({
      id: p.id,
      name: info.name,
      monthly,
      ...(p.id === 'vip' ? { popular: true } : {}),
    })
  }
  // Um plano so nao tem "mais escolhido"; com varios, o VIP e o destaque de sempre.
  if (planos.length === 1) delete planos[0].popular
  return planos
}
