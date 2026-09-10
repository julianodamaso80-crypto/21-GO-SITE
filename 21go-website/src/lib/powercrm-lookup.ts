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
  /** Código FIPE do modelo (ex: "005490-9"). */
  back?: string | null
  /** Valor FIPE que o Power já calculou. Chega como número no JSON. */
  value?: string | number | null
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

/**
 * O valor FIPE que o PROPRIO PowerCRM devolve, junto do modelo.
 *
 * O `/cmby` sempre trouxe `value` e `back` (codFipe) em cada modelo — é a
 * "Cotação FIPE" nativa do Power, a mesma que a 21Go usa pra cotar. O site
 * ignorava esse campo e ia buscar o mesmo número na Parallelum, o que custava
 * 3 a 4 chamadas externas por cotação.
 *
 * Em 09/09/2026 isso quebrou o site: a Parallelum passou a responder
 * `429 limite de taxa excedido` e 90% das cotações caíram na tela de "fale com
 * a consultora". Conferido no Gol 1.0 Flex 12V 5p 2020: Power 44472.0 e
 * Parallelum R$ 44.472,00, mesmo codFipe `005490-9`.
 *
 * Reaproveita o cache de modelos (7 dias), então não custa chamada nova.
 */
export async function valorFipeDoPowerCrm(
  brandId: number | string,
  year: number | string,
  modelId: number | string,
): Promise<{ valor: number; codFipe: string | null } | null> {
  const modelos = await listModelsPowerCrm(brandId, year)
  const achado = modelos.find((m) => String(m.id) === String(modelId))
  if (!achado) return null
  // `value` chega como número no JSON, mas o tipo aceita string — normaliza.
  const bruto = typeof achado.value === 'string' ? Number(achado.value) : achado.value
  if (!bruto || !Number.isFinite(bruto) || bruto <= 0) return null
  return { valor: bruto, codFipe: achado.back || null }
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
