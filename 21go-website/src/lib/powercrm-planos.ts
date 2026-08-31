import 'server-only'
import { lerPlanosDoPower, type PlanoLidoDoPower } from './powercrm-planos.regras'

/**
 * Pergunta ao PowerCRM quais planos ELE daria para um veiculo — a mesma resposta que o
 * consultor ve na cotacao dele (`POST /api/plans/`).
 *
 * Ele nao decide so "faz ou nao faz": decide TAMBEM quais planos aparecem e por quanto. O site
 * tinha tabela e heuristica proprias e errava — medido em 31/08/2026 contra os prints de
 * cliente: a BMW X1 sDrive20i 2013 saiu como "SUV R$ 377,50" quando o Power da 4 planos com
 * VIP 359,04, e um Tiida 2009 de R$ 28 mil esta em VEICULOS ESPECIAIS (238,50), nao na tabela
 * de carro comum. Nome do modelo nao diz em que tabela a versao esta; so o Power diz.
 *
 * Nunca derruba a cotacao: se o Power oscilar, devolve null e quem chama decide pela
 * allowlist. Recusar cliente porque a API piscou custa venda.
 */

const BASE = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const TOKEN = process.env.POWERAPI_TOKEN || ''

/** Rio de Janeiro. O `/api/plans/` exige cidade e o site cota pela tabela da praca do RJ. */
export const CIDADE_PADRAO = 3658

/** Curto de proposito: e uma checagem no meio da cotacao, nao pode segurar a tela. */
const TIMEOUT_MS = 6000

interface PlanoPower {
  name?: string | null
  price?: string | null
  priceValue?: number | null
}

async function consultar(
  carModelId: number,
  carModelYearId: number,
  cityId: number,
  workVehicle: boolean,
): Promise<PlanoPower[] | null> {
  if (!TOKEN) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}/api/plans/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        carModelId,
        carModelYearId,
        cityId,
        quotationWorkVehicle: workVehicle,
        token: TOKEN,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { plans?: PlanoPower[] }
    return Array.isArray(data?.plans) ? data.plans : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface ConsultaDePlanos {
  /**
   * `null` = nao deu pra perguntar (Power mudo) — quem chama cai na allowlist.
   * `[]`   = perguntamos e ele NAO da plano de protecao: nao fazemos esse veiculo.
   */
  planos: PlanoLidoDoPower[] | null
  /** true quando os planos vieram da tabela de veiculo de trabalho (app/taxi). */
  tabelaDeTrabalho: boolean
}

/**
 * Quais planos o Power da pra esse veiculo, com o preco dele.
 *
 * Quando a consulta normal nao acha protecao, tenta de novo como veiculo de trabalho: app/taxi
 * tem tabela propria e um carro pode estar so nela. Nao negamos veiculo por ser de aplicativo
 * (ordem do dono, 31/08/2026) — se a tabela de trabalho da plano, fazemos, e o preco mostrado
 * passa a ser o dela.
 */
export async function planosDoPowerAoVivo(
  carModelId: number | string | null | undefined,
  carModelYearId: number | string | null | undefined,
  opcoes?: { cityId?: number | null; cilindrada?: number },
): Promise<ConsultaDePlanos> {
  const modelo = Number(carModelId)
  const ano = Number(carModelYearId)
  const mudo: ConsultaDePlanos = { planos: null, tabelaDeTrabalho: false }
  if (!Number.isFinite(modelo) || modelo <= 0) return mudo
  if (!Number.isFinite(ano) || ano <= 0) return mudo

  const cidade = Number(opcoes?.cityId) > 0 ? Number(opcoes?.cityId) : CIDADE_PADRAO

  const normal = await consultar(modelo, ano, cidade, false)
  if (normal === null) return mudo
  const daNormal = lerPlanosDoPower(normal, opcoes?.cilindrada)
  if (daNormal.length > 0) return { planos: daNormal, tabelaDeTrabalho: false }

  const trabalho = await consultar(modelo, ano, cidade, true)
  // A primeira resposta ja foi conclusiva: sem protecao na tabela normal e sem segunda opiniao.
  if (trabalho === null) return { planos: [], tabelaDeTrabalho: false }
  const daTrabalho = lerPlanosDoPower(trabalho, opcoes?.cilindrada)
  return { planos: daTrabalho, tabelaDeTrabalho: daTrabalho.length > 0 }
}

/**
 * O Power da plano de protecao pra esse veiculo?
 *
 * `true` da, `false` nao da, `null` nao deu pra perguntar. Mantida pra quem so precisa do
 * veredicto — quem vai MOSTRAR preco tem que usar `planosDoPowerAoVivo`.
 */
export async function temProtecaoNoPowerAoVivo(
  carModelId: number | string | null | undefined,
  carModelYearId: number | string | null | undefined,
  opcoes?: { cityId?: number | null },
): Promise<boolean | null> {
  const { planos } = await planosDoPowerAoVivo(carModelId, carModelYearId, opcoes)
  if (planos === null) return null
  return planos.length > 0
}
