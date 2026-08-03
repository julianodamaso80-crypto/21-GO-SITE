import 'server-only'
import { ePlanoDeProtecao } from './powercrm-planos.regras'

/**
 * Pergunta ao PowerCRM quais planos ELE daria para um veiculo — a mesma resposta que o
 * consultor ve na cotacao dele (`POST /api/plans/`).
 *
 * Existe porque lista extraida envelhece. A allowlist de versoes
 * (`src/data/vehicle-allowlist.ts`) sabe se o modelo esta amarrado numa tabela de protecao,
 * mas nao sabe de faixa de FIPE, de ano nem de cidade: medindo 40 versoes contra o Power ao
 * vivo, 3 estavam na tabela e mesmo assim nao davam plano nenhum (Jeep Wrangler Unlimited,
 * Ford F-1000, Fiat Ducato). Aqui a resposta e do proprio Power, no momento da cotacao.
 *
 * Nunca derruba a cotacao: se o Power oscilar, devolve null e quem chama decide pela
 * allowlist. Recusar cliente porque a API piscou custa venda.
 */

const BASE = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const TOKEN = process.env.POWERAPI_TOKEN || ''

/** Rio de Janeiro. O `/api/plans/` exige cidade e o site cota pela tabela da praca do RJ. */
const CIDADE_PADRAO = 3658

/** Curto de proposito: e uma checagem no meio da cotacao, nao pode segurar a tela. */
const TIMEOUT_MS = 6000

interface PlanoPower {
  name?: string | null
  price?: string | null
}

async function consultar(
  carModelId: number,
  carModelYearId: number,
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
        cityId: CIDADE_PADRAO,
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

/**
 * O Power da plano de protecao pra esse veiculo?
 *
 * `true` da, `false` nao da (so monitoramento/roubo e furto, ou nada), `null` nao deu pra
 * perguntar — nesse caso quem chama cai na allowlist.
 *
 * Quando a consulta normal nao acha protecao, tenta de novo como veiculo de trabalho: app/taxi
 * tem tabela propria e um carro pode estar so nela. So bloqueia quando os dois vem vazios.
 */
export async function temProtecaoNoPowerAoVivo(
  carModelId: number | string | null | undefined,
  carModelYearId: number | string | null | undefined,
): Promise<boolean | null> {
  const modelo = Number(carModelId)
  const ano = Number(carModelYearId)
  if (!Number.isFinite(modelo) || modelo <= 0) return null
  if (!Number.isFinite(ano) || ano <= 0) return null

  const normal = await consultar(modelo, ano, false)
  if (normal === null) return null
  if (normal.some((p) => ePlanoDeProtecao(p.name || ''))) return true

  const trabalho = await consultar(modelo, ano, true)
  if (trabalho === null) return false // a primeira resposta ja foi conclusiva
  return trabalho.some((p) => ePlanoDeProtecao(p.name || ''))
}
