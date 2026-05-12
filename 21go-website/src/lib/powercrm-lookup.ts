import 'server-only'

/**
 * Wrapper dos endpoints do PowerCRM para Marca/Ano/Modelo (Hinova).
 * Substitui o fluxo de placa, que tinha cascata frágil: PowerCRM /plates →
 * API Brasil → Parallelum. Indo direto pelo cb/cmby/cmy o usuário escolhe
 * marca+ano+modelo na própria tabela do Hinova — 0 erro de mapeamento.
 *
 * Endpoints utilizados:
 *  - GET /api/quotation/cb?type=1|2    → marcas (carro|moto)
 *  - GET /api/quotation/cmby?cb=&cy=   → modelos por marca+ano (back = codFipe)
 *  - GET /api/quotation/cmy?cm=        → anos disponíveis para um modelo
 *
 * Cache in-memory: marcas/modelos raramente mudam → 7 dias.
 */

const POWERCRM_BASE = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN || ''
const TIMEOUT_MS = 10000
const TTL_LIST = 7 * 24 * 60 * 60 * 1000

export type PowerCrmKind = 'carro' | 'moto'

export interface PowerCrmItem {
  id: number
  text: string
  back?: string | null
  value?: string | null
}

type CacheEntry<T> = { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(k: string): T | null {
  const e = cache.get(k)
  if (!e) return null
  if (Date.now() > e.expiresAt) {
    cache.delete(k)
    return null
  }
  return e.value as T
}

function setCached<T>(k: string, v: T, ttl: number): void {
  cache.set(k, { value: v, expiresAt: Date.now() + ttl })
}

async function fetchPowerCrm<T>(path: string): Promise<T | null> {
  if (!POWERAPI_TOKEN) {
    throw new Error('POWERAPI_TOKEN ausente')
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${POWERCRM_BASE}${path}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${POWERAPI_TOKEN}` },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function typeFromKind(kind: PowerCrmKind): 1 | 2 {
  return kind === 'moto' ? 2 : 1
}

export async function listBrandsPowerCrm(kind: PowerCrmKind): Promise<PowerCrmItem[]> {
  const key = `pc:brands:${kind}`
  const cached = getCached<PowerCrmItem[]>(key)
  if (cached) return cached
  const data = await fetchPowerCrm<PowerCrmItem[]>(`/api/quotation/cb?type=${typeFromKind(kind)}`)
  const list = Array.isArray(data) ? data : []
  // Ordena alfabeticamente pra UI ficar previsível
  list.sort((a, b) => (a.text || '').localeCompare(b.text || '', 'pt-BR'))
  setCached(key, list, TTL_LIST)
  return list
}

export async function listModelsPowerCrm(
  brandId: number | string,
  year: number | string,
): Promise<PowerCrmItem[]> {
  const cb = String(brandId)
  const cy = String(year)
  const key = `pc:models:${cb}:${cy}`
  const cached = getCached<PowerCrmItem[]>(key)
  if (cached) return cached
  const data = await fetchPowerCrm<PowerCrmItem[]>(`/api/quotation/cmby?cb=${cb}&cy=${cy}`)
  const list = Array.isArray(data) ? data : []
  list.sort((a, b) => (a.text || '').localeCompare(b.text || '', 'pt-BR'))
  setCached(key, list, TTL_LIST)
  return list
}

export async function listYearsPowerCrm(modelId: number | string): Promise<PowerCrmItem[]> {
  const cm = String(modelId)
  const key = `pc:years:${cm}`
  const cached = getCached<PowerCrmItem[]>(key)
  if (cached) return cached
  const data = await fetchPowerCrm<PowerCrmItem[]>(`/api/quotation/cmy?cm=${cm}`)
  const list = Array.isArray(data) ? data : []
  // Anos mais recentes primeiro
  list.sort((a, b) => {
    const ay = Number((a.text || '').match(/(\d{4})/)?.[1] || 0)
    const by = Number((b.text || '').match(/(\d{4})/)?.[1] || 0)
    return by - ay
  })
  setCached(key, list, TTL_LIST)
  return list
}

/**
 * Lista de anos genéricos (1995..currentYear+1). Usado como dropdown
 * INTERMEDIÁRIO antes do modelo, já que o PowerCRM exige cb+cy juntos
 * pra retornar modelos. O ano selecionado aqui é o "ano de fabricação"
 * que filtra os modelos disponíveis. Depois de escolher o modelo, o
 * /api/quotation/cmy retorna a lista detalhada de ano+combustível.
 */
export function listGenericYears(): number[] {
  const current = new Date().getFullYear() + 1
  const oldest = 1995
  const out: number[] = []
  for (let y = current; y >= oldest; y--) out.push(y)
  return out
}
