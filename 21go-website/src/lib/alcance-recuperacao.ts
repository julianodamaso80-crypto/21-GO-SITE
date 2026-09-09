/**
 * Quem entra no alcance da abordagem: o estado do Rio inteiro, e o resto do
 * Brasil só quando o negócio paga a viagem.
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

/**
 * Casa é o estado do Rio inteiro, não só a capital: 21 (Rio e Baixada), 22
 * (Campos, Macaé, região dos Lagos) e 24 (Volta Redonda, Petrópolis, Angra).
 * Todo lead daqui é abordado, valha o que valer.
 */
export const DDDS_DO_RJ = new Set(['21', '22', '24'])

/** Fora do RJ, a ativação tem que alcançar isto (decisão do dono, 09/09/2026). */
export const ATIVACAO_MINIMA_FORA_DO_RJ = 500

/**
 * O plano que serve de base da ativação, na ordem oficial — a mesma da tela
 * (`cotacao/page.tsx`) e do PDF (`pdf-quote.ts`). Carro usa o VIP; moto, SUV e
 * especial usam o "VIP" deles.
 */
const ORDEM_DE_REFERENCIA = [
  'vip', 'suv', 'moto-1000', 'moto-400', 'especial',
  'premium', 'do-seu-jeito', 'basico',
]

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
  // A MESMA ordem de referência da tela e do PDF. Não dá pra procurar só o
  // 'vip': moto, SUV e especial não têm VIP, e o plano de referência deles é
  // outro — errar aqui é mandar ao cliente uma ativação que ele não viu.
  const referencia =
    ORDEM_DE_REFERENCIA.map((id) => lista.find((p) => p.id === id)).find((p) => !!p)
    ?? lista.find((p) => p.popular)
    ?? lista[0]

  const escolhido = input.valorEscolhido ?? 0
  const eBYD = (input.marca || '').trim().toUpperCase() === 'BYD'
  return calcActivation(referencia?.monthly ?? 0, eBYD, escolhido)
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

  if (DDDS_DO_RJ.has(ddd)) {
    return { dentro: true, ddd, ativacao, motivo: `ddd ${ddd} (RJ)` }
  }
  if (ativacao >= ATIVACAO_MINIMA_FORA_DO_RJ) {
    return { dentro: true, ddd, ativacao, motivo: `ativação R$ ${ativacao.toFixed(2)}` }
  }
  return {
    dentro: false,
    ddd,
    ativacao,
    motivo: `ddd ${ddd || '?'} fora do RJ e ativação R$ ${ativacao.toFixed(2)} abaixo de ${ATIVACAO_MINIMA_FORA_DO_RJ}`,
  }
}
