import 'server-only'

/**
 * Placa → veículo identificado na tabela do PowerCRM.
 *
 * O `/plates/` do PowerCRM consulta a base do DENATRAN e devolve, além dos
 * metadados do veículo, DUAS chaves que amarram tudo sem nenhum chute:
 *
 *   brandId → é o MESMO id do `/cb` do PowerCRM (33 = GM-Chevrolet, 88 = VW)
 *   codFipe → é o MESMO valor do campo `back` no `/cmby`
 *
 * Então placa → modelo é uma busca exata:
 *   1. /plates/{placa}          → brandId, codFipe, year, vehicleType
 *   2. /cmby?cb={brandId}&cy={ano} → o item com back === codFipe
 *
 * O resultado sai no MESMO formato que os dropdowns produzem hoje, então o
 * cálculo de preço continua passando inteiro por /api/vehicle/powercrm/preco.
 * Esta lib NÃO resolve valor FIPE e NÃO chama nada pago.
 *
 * Quando o DENATRAN não devolve codFipe (acontece — Santana 86, Golf 02,
 * Onix 2019 nos testes de 05/08/2026), a marca e o ano ainda valem: o front
 * pré-preenche os dois e mostra só a lista de versões daquele modelo.
 * NUNCA escolhemos a versão pelo cliente — versão errada = FIPE errado.
 */

import { listBrandsPowerCrm, listModelsPowerCrm } from './powercrm-lookup'

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN || ''

/**
 * O DENATRAN é lento na primeira consulta de uma placa (medimos 3s a 18s) e
 * rápido depois, porque o PowerCRM cacheia do lado dele. Esperar vale mais que
 * jogar o cliente no formulário manual à toa.
 */
const PLATES_TIMEOUT_MS = 20000

export type PlateIdentifyStatus = 'found' | 'partial' | 'notfound' | 'unknown' | 'invalid'

export interface PlateModelOption {
  code: string
  name: string
  codFipe: string | null
}

export interface PlateIdentifyResult {
  status: PlateIdentifyStatus
  /** "CHEVROLET MONTANA LS · 2013" — o que o cliente lê pra reconhecer o carro */
  label?: string
  tipo?: 'carro' | 'moto'
  brandId?: string
  brandText?: string
  /** Ano-modelo, 4 dígitos */
  year?: string
  modelId?: string
  modelText?: string
  codFipe?: string
  /**
   * Versões possíveis quando não deu pra fechar uma só. Já filtradas pelo nome
   * do modelo que veio do DENATRAN, então costuma ter 2-5 itens em vez de 70.
   */
  candidates?: PlateModelOption[]
  /** Lista completa da marca+ano — o "ver todos" quando o filtro erra a mão */
  allModels?: PlateModelOption[]
  cor?: string
}

interface PowerPlatesResp {
  mensagem?: string
  brand?: string
  brandId?: number
  year?: string
  color?: string
  fuel?: string
  cilinderCapacity?: string
  vehicleType?: string
  codFipe?: string
}

/* ─── Cache (placa → resultado, 6h) ─── */
type CacheEntry = { value: PlateIdentifyResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** Ano-modelo: o PowerCRM manda "2013/2014" ou "1986/0000". Vale o último válido. */
function parseYear(raw: string | undefined): string | undefined {
  const anos = raw?.match(/(\d{4})/g)
  if (!anos) return undefined
  for (let i = anos.length - 1; i >= 0; i--) {
    if (/^(19|20)\d{2}$/.test(anos[i])) return anos[i]
  }
  return undefined
}

/** "I TOYOTA HILUXSW4 SRV4X4" → "TOYOTA HILUXSW4 SRV4X4" e sem espaço duplo. */
function prettyBrand(raw: string): string {
  return raw.trim().replace(/^[A-Z]\s+/i, '').replace(/\s+/g, ' ')
}

const TIPOS_MOTO = ['MOTOCICLETA', 'MOTONETA', 'CICLOMOTOR', 'TRICICLO', 'QUADRICICLO', 'MOTO']

/**
 * Tipo (carro/moto) e o NOME da marca como o PowerCRM a chama.
 *
 * Os dois saem da mesma consulta porque as listas de marca são separadas por
 * tipo: o brandId do DENATRAN só existe numa delas, então achar o id já diz o
 * tipo. As listas ficam em cache de 7 dias — é busca local.
 *
 * O nome da marca importa: quem calcula o preço faz match do texto contra a
 * tabela FIPE, e ali vale "GM - Chevrolet", não "CHEVROLET MONTANA LS" (que é
 * marca e modelo grudados, do jeito que o DENATRAN devolve). Mandar o texto
 * cru faria a busca de valor falhar.
 */
async function resolverMarca(
  vehicleType: string | undefined,
  brandId: number | undefined,
): Promise<{ tipo: 'carro' | 'moto' | null; brandText: string | null }> {
  const t = (vehicleType || '').toUpperCase()
  let tipo: 'carro' | 'moto' | null = null
  if (TIPOS_MOTO.some((m) => t.includes(m))) tipo = 'moto'
  else if (
    t.includes('AUTOMOVEL') || t.includes('CAMINHONETE')
    || t.includes('CAMIONETA') || t.includes('UTILITARIO')
  ) {
    tipo = 'carro'
  }

  if (!brandId) return { tipo, brandText: null }

  try {
    const [carros, motos] = await Promise.all([
      listBrandsPowerCrm('carro'),
      listBrandsPowerCrm('moto'),
    ])
    const noCarro = carros.find((m) => m.id === brandId)
    const naMoto = motos.find((m) => m.id === brandId)
    // Quando o vehicleType não decidiu, o lado em que o id aparece decide.
    if (!tipo) {
      if (naMoto && !noCarro) tipo = 'moto'
      else if (noCarro && !naMoto) tipo = 'carro'
    }
    const hit = tipo === 'moto' ? naMoto : tipo === 'carro' ? noCarro : noCarro || naMoto
    return { tipo, brandText: hit?.text || null }
  } catch {
    return { tipo, brandText: null }
  }
}

/**
 * Acha o nome do modelo dentro do texto cru do DENATRAN testando token a token
 * contra a lista real de modelos da marca. "CHEVROLET MONTANA LS" → "CHEVROLET"
 * não bate com nenhum modelo e cai fora; "MONTANA" bate com 3 e vence.
 * Fica com o token mais restritivo, que é o que descreve melhor o veículo.
 */
function filtrarCandidatos(brandRaw: string, modelos: PlateModelOption[]): PlateModelOption[] {
  const tokens = prettyBrand(brandRaw)
    .toUpperCase()
    .split(/[\s/]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t))

  let melhor: PlateModelOption[] | null = null
  for (const tok of tokens) {
    const hits = modelos.filter((m) => m.name.toUpperCase().includes(tok))
    if (hits.length === 0) continue
    if (!melhor || hits.length < melhor.length) melhor = hits
  }
  return melhor || []
}

async function tentarPlates(placa: string): Promise<PowerPlatesResp | null | 'error'> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/plates/${placa}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${POWERAPI_TOKEN}` },
      signal: AbortSignal.timeout(PLATES_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn(`[plate-identify] ${placa} HTTP ${res.status} em ${Date.now() - t0}ms`)
      return 'error'
    }
    const data = (await res.json().catch(() => null)) as PowerPlatesResp | null
    if (!data) return 'error'
    // "DENATRAN indisponível" cobre os dois casos: placa que não existe e base
    // fora do ar. Como não dá pra separar, tratamos como "não achamos" — que é
    // o que o cliente precisa saber. Em nenhum dos dois ele fica travado.
    if (data.mensagem !== 'ok' || !data.brand) return null
    return data
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause
    console.warn(
      `[plate-identify] ${placa} falhou em ${Date.now() - t0}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
      '| cause:',
      cause instanceof Error ? `${cause.name}: ${cause.message}` : JSON.stringify(cause),
    )
    return 'error'
  }
}

/**
 * O PowerCRM fica atrás de Cloudflare e recusa conexão nova de vez em quando
 * (ConnectTimeoutError, sem nem chegar ao servidor). Uma segunda tentativa
 * costuma pegar conexão quente e resolver. Só reenviamos em falha de rede —
 * resposta legítima, inclusive "não achei", passa direto.
 */
async function fetchPlates(placa: string): Promise<PowerPlatesResp | null | 'error'> {
  const primeira = await tentarPlates(placa)
  if (primeira !== 'error') return primeira
  await new Promise((r) => setTimeout(r, 400))
  return tentarPlates(placa)
}

export async function identifyPlate(placa: string): Promise<PlateIdentifyResult> {
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (p.length !== 7) return { status: 'invalid' }
  if (!POWERAPI_TOKEN) return { status: 'unknown' }

  const cached = cache.get(p)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  const pc = await fetchPlates(p)
  if (pc === 'error') return { status: 'unknown' }
  if (!pc) {
    const miss: PlateIdentifyResult = { status: 'notfound' }
    cache.set(p, { value: miss, expiresAt: Date.now() + CACHE_TTL_MS })
    return miss
  }

  const year = parseYear(pc.year)
  // Texto cru do DENATRAN ("CHEVROLET MONTANA LS") — serve pro cliente
  // reconhecer o carro e pra filtrar as versões, nunca pra calcular preço.
  const brandRaw = prettyBrand(pc.brand || '')
  const { tipo, brandText } = await resolverMarca(pc.vehicleType, pc.brandId)
  const label = year ? `${brandRaw} · ${year}` : brandRaw

  const base: PlateIdentifyResult = {
    status: 'partial',
    label,
    cor: pc.color || undefined,
    ...(brandText ? { brandText } : {}),
    ...(tipo ? { tipo } : {}),
    ...(year ? { year } : {}),
    // Só entrega o id junto com o nome: id sem nome faria o cálculo de preço
    // rodar sem marca, e aí o valor não sai.
    ...(pc.brandId && brandText ? { brandId: String(pc.brandId) } : {}),
    ...(pc.codFipe ? { codFipe: pc.codFipe } : {}),
  }

  // Sem marca resolvida ou sem ano não há como listar modelos: o cliente vê o
  // veículo que identificamos e escolhe na mão a partir daí.
  if (!pc.brandId || !brandText || !year) {
    cache.set(p, { value: base, expiresAt: Date.now() + CACHE_TTL_MS })
    return base
  }

  let modelos: PlateModelOption[] = []
  try {
    const raw = await listModelsPowerCrm(pc.brandId, year)
    modelos = raw.map((m) => ({ code: String(m.id), name: m.text, codFipe: m.back || null }))
  } catch {
    cache.set(p, { value: base, expiresAt: Date.now() + CACHE_TTL_MS })
    return base
  }

  // Caminho exato: o codFipe do DENATRAN é o `back` do PowerCRM.
  const exato = pc.codFipe ? modelos.find((m) => m.codFipe === pc.codFipe) : undefined
  if (exato) {
    const found: PlateIdentifyResult = {
      ...base,
      status: 'found',
      modelId: exato.code,
      modelText: exato.name,
      codFipe: exato.codFipe || pc.codFipe,
      allModels: modelos,
    }
    cache.set(p, { value: found, expiresAt: Date.now() + CACHE_TTL_MS })
    return found
  }

  const candidatos = filtrarCandidatos(pc.brand || '', modelos)
  const parcial: PlateIdentifyResult = {
    ...base,
    candidates: candidatos.length > 0 ? candidatos : modelos,
    allModels: modelos,
  }
  cache.set(p, { value: parcial, expiresAt: Date.now() + CACHE_TTL_MS })
  return parcial
}
