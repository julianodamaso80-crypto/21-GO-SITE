/**
 * Quem entra no alcance da abordagem: DDD 21, e o resto do Brasil só quando o
 * negócio paga a viagem.
 *
 * A 21Go atende o país inteiro — isto NÃO é regra de cobertura, e nada aqui
 * bloqueia quem procura a gente. É só o critério de quem vale a pena procurar
 * PRIMEIRO, numa abordagem que parte de nós e consome saldo de chip.
 *
 * A ativação é calculada pela mesma função da tela (`calcActivation`), sobre o
 * que ficou gravado na simulação. Ela não aparece na mensagem — serve só pra
 * decidir se o lead entra na fila, então não há risco de divergir do que o
 * cliente viu.
 */

import { calcActivation } from '@/data/pricing'
import type { PlanoDaTela } from '@/lib/mensagem-recuperacao'

/** O DDD de casa. Todo lead daqui é abordado, valha o que valer. */
export const DDD_DA_CASA = '21'

/** Fora do 21, a ativação tem que alcançar isto (decisão do dono, 09/09/2026). */
export const ATIVACAO_MINIMA_FORA_DO_RJ = 500

/** DDD de um telefone com DDI (5521999999999 → "21"). Vazio se não der pra ler. */
export function dddDe(telefoneComDDI: string): string {
  const d = telefoneComDDI.replace(/\D/g, '')
  const nacional = d.startsWith('55') ? d.slice(2) : d
  return nacional.length >= 10 ? nacional.slice(0, 2) : ''
}

/**
 * A taxa de ativação da simulação, pela regra oficial: o maior entre o VIP de
 * referência e o plano escolhido, mais R$ 50, com piso — e BYD fixo.
 */
export function ativacaoDaSimulacao(input: {
  marca?: string | null
  planos?: PlanoDaTela[] | null
  valorEscolhido?: number | null
}): number {
  const lista = input.planos || []
  const vip = lista.find((p) => p.id === 'vip')?.monthly
    ?? lista.find((p) => p.popular)?.monthly
    ?? 0
  const escolhido = input.valorEscolhido ?? 0
  const eBYD = (input.marca || '').toUpperCase().includes('BYD')
  return calcActivation(vip, eBYD, escolhido)
}

export interface Alcance {
  dentro: boolean
  ddd: string
  ativacao: number
  motivo: string
}

export function dentroDoAlcance(input: {
  telefone: string
  marca?: string | null
  planos?: PlanoDaTela[] | null
  valorEscolhido?: number | null
}): Alcance {
  const ddd = dddDe(input.telefone)
  const ativacao = ativacaoDaSimulacao(input)

  if (ddd === DDD_DA_CASA) {
    return { dentro: true, ddd, ativacao, motivo: 'ddd 21' }
  }
  if (ativacao >= ATIVACAO_MINIMA_FORA_DO_RJ) {
    return { dentro: true, ddd, ativacao, motivo: `ativação R$ ${ativacao.toFixed(2)}` }
  }
  return {
    dentro: false,
    ddd,
    ativacao,
    motivo: `ddd ${ddd || '?'} fora do 21 e ativação R$ ${ativacao.toFixed(2)} abaixo de ${ATIVACAO_MINIMA_FORA_DO_RJ}`,
  }
}
