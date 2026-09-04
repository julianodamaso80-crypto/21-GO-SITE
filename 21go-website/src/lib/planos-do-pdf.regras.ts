/**
 * Os planos que o PDF imprime sao os que o cliente VIU na tela — e o que ele viu veio do
 * PowerCRM (`POST /api/plans/`), ja com o desconto de leilao aplicado pelo servidor.
 *
 * Fica separado do `pdf-quote.ts` (que carrega o Puppeteer) pra rodar no `node --test`, mesmo
 * motivo do `powercrm-planos.regras.ts`.
 *
 * Ate 04/09/2026 o PDF nao recebia lista nenhuma: chamava `getAllRelevantPlans` e recalculava
 * tudo pela tabela local, escolhendo a categoria por palavra no nome do modelo. Medido contra o
 * Power ao vivo nesse dia: a Saveiro CROSS 1.6 (FIPE 88.070) e cotada por ele como CARRO COMUM
 * (4 planos, VIP R$ 418,88), mas "saveiro" esta em `SUV_MODELS`, entao o PDF imprimia um plano
 * so — "SUV / Caminhonete" R$ 437,30. O cliente escolhia um plano na tela e recebia outro, mais
 * caro, no WhatsApp. Nome de modelo nao diz em que tabela o Power colocou a versao.
 */

import type { PlanId } from '../data/pricing'

/** Um plano como saiu da tela (`QuotePlan`): o preco ja e o do Power. */
export interface PlanoDaTela {
  id?: string | null
  name?: string | null
  monthly?: number | null
  popular?: boolean
}

export interface PlanoDoPdf {
  id: PlanId
  name: string
  monthly: number
  /** Sempre true: o Power so devolve o que ele faz pra esse veiculo. */
  applicable: true
  categoryLabel: string
  popular?: boolean
}

const IDS_VALIDOS: PlanId[] = [
  'basico',
  'do-seu-jeito',
  'vip',
  'premium',
  'suv',
  'moto-400',
  'moto-1000',
  'especial',
]

const ROTULO: Partial<Record<PlanId, string>> = {
  suv: 'SUV',
  especial: 'Especial',
  'moto-400': 'Moto',
  'moto-1000': 'Moto',
}

/**
 * Converte a lista da tela nos planos do PDF.
 *
 * `null` significa "nao veio lista" — quem chama mantem o caminho antigo (tabela local), que
 * continua sendo a rede pra lead antigo, gravado antes desta coluna existir. Lista que so tem
 * entrada invalida tambem devolve `null`: PDF sem plano nenhum e pior que PDF pela tabela.
 */
export function planosDaTelaParaPdf(
  planos: PlanoDaTela[] | null | undefined,
): PlanoDoPdf[] | null {
  if (!Array.isArray(planos) || planos.length === 0) return null

  const out: PlanoDoPdf[] = []
  for (const p of planos) {
    const id = (p?.id || '') as PlanId
    if (!IDS_VALIDOS.includes(id)) continue
    const monthly = Number(p?.monthly)
    // Preco invalido nao pode ir pra tela do cliente: 0 vira "gratis" na cara dele.
    if (!Number.isFinite(monthly) || monthly <= 0) continue
    if (out.some((x) => x.id === id)) continue
    out.push({
      id,
      name: (p?.name || '').trim() || id,
      monthly,
      applicable: true,
      categoryLabel: ROTULO[id] ?? 'Carro',
      ...(p?.popular ? { popular: true } : {}),
    })
  }

  return out.length > 0 ? out : null
}

/**
 * Qual plano da lista o cliente escolheu, pelo valor que ele viu.
 *
 * O valor e a chave certa porque e o unico dado que atravessa tela -> lead -> PDF sem passar
 * por texto: nome de plano muda de rotulo ("VIP Moto ate 1.000cc") e ja quebrou o casamento por
 * nome antes. `null` quando nenhum bate — quem chama cai no nome.
 */
export function planoEscolhidoNaLista(
  planos: PlanoDoPdf[] | null | undefined,
  mensalidade: number,
): PlanId | null {
  if (!Array.isArray(planos) || !Number.isFinite(mensalidade)) return null
  const achado = planos.find((p) => Math.abs(p.monthly - mensalidade) < 0.01)
  return achado ? achado.id : null
}
