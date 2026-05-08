/**
 * Plate lookup via PowerCRM (mesma estratégia do /cotar local que funcionou).
 *
 * Fluxo:
 *   1. PowerCRM /api/quotation/plates/{placa} → marca, codFipe, year, city, uf, chassi
 *   2. PowerCRM /api/quotation/cb?type=1 → mapear marca string pra cb id interno
 *   3. PowerCRM /api/quotation/cmby?cb=X&cy=Y → modelos com codFipe match
 *   4. PowerCRM /api/quotation/cmy?cm=X → ano modelo (mdlYr)
 *   5. PowerCRM /api/quotation/stt + ct → cityId
 *   6. PowerCRM /api/plans/ POST {mdl, mdlYr, cityId} → planos com preços REAIS
 *
 * Para o `fipeValue` em reais (que aparece no PDF do cliente), fazemos
 * engenharia reversa cruzando o preço retornado pelo PowerCRM (plano BÁSICO
 * normalmente) com a tabela PRICING_TABLES local — encontra a faixa FIPE e
 * retorna a média.
 */

import {
  PRICING_TABLES,
  type PlanId,
  type QuotePlan,
} from '@/data/pricing'
import { lookupFipeDirect } from './fipe-direct'
import { lookupApiBrasilByPlate, isApiBrasilConfigured } from './apibrasil-lookup'

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN || ''
const API_TIMEOUT = 15000

export interface PlateResponse {
  success: true
  vehicle: {
    marca: string
    modelo: string
    ano: string
    cor: string
    fipeValue: number
    fipeCode: string
    categoria: string
    combustivel: string
    cilindrada?: number
    chassi?: string
  }
  plans: QuotePlan[]
  // Internos pra criação do lead — não usados pelo front
  _internal?: {
    mdl?: number
    mdlYr?: number
    cityId?: number
    pcVehicle?: unknown
  }
}

export interface PlateErrorResponse {
  success: false
  error: string
  /** Sinaliza pro frontend mostrar tela de atendimento humano em vez de erro genérico */
  requires_human_support?: boolean
}

const apiHeaders = {
  accept: 'application/json',
  Authorization: `Bearer ${POWERAPI_TOKEN}`,
}

async function powerGet<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${POWERCRM_BASE_URL}${path}`, {
      headers: apiHeaders,
      signal: signal ?? AbortSignal.timeout(API_TIMEOUT),
    })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as T | null
  } catch {
    return null
  }
}

async function powerPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${POWERCRM_BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...apiHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT),
    })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as T | null
  } catch {
    return null
  }
}

interface PowerPlatesResp {
  mensagem?: string
  city?: string
  uf?: string
  chassi?: string
  brand?: string
  brandId?: number
  year?: string
  fuel?: string
  color?: string
  cilinderCapacity?: string
  vehicleType?: string
  codFipe?: string
}

interface PowerCbItem {
  id: number
  text: string
}

interface PowerCmbyItem {
  id: number
  text: string
  back: string
}

interface PowerCmyItem {
  id: number
  text: string
}

interface PowerSttItem {
  id: number
  text: string
  back: string
}

interface PowerCtItem {
  id: number
  text: string
}

interface PowerPlansResp {
  plans?: Array<{
    planId: number
    name: string
    tppId: number
    price: string
    priceValue: number
    accessPrice?: string
    trackerPrice?: string
    franchisePrice?: string
  }>
  error?: string | null
}

/** Mapeia nome do plano PowerCRM pra PlanId interno do site */
function planIdFromPowerName(name: string): PlanId {
  const n = (name || '').toLowerCase().trim()
  if (n.includes('especial')) return 'especial'
  if (n.includes('suv')) return 'suv'
  if (n.includes('moto') && n.includes('400')) return 'moto-400'
  if (n.includes('moto')) return 'moto-1000'
  if (n.includes('premium')) return 'premium'
  if (n.includes('vip')) return 'vip'
  if (n.includes('jeito')) return 'do-seu-jeito'
  return 'basico'
}

/**
 * Calcula fipeValue REVERSO baseado no plano BÁSICO do PowerCRM.
 * Cruza o preço retornado com PRICING_TABLES.basico — se achar uma faixa
 * (min/max) com price match, retorna a média. Senão, retorna null.
 */
function reverseFipeValue(plans: QuotePlan[]): number | null {
  // Procura plano BÁSICO ou similar (basico, do-seu-jeito, vip, premium, suv)
  const candidates: PlanId[] = ['basico', 'do-seu-jeito', 'vip', 'premium', 'suv', 'moto-400', 'moto-1000', 'especial']
  for (const planId of candidates) {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) continue
    const table = PRICING_TABLES[planId]
    if (!table) continue
    const band = table.find((b) => Math.abs(b.price - plan.monthly) < 0.01)
    if (band) {
      return Math.round((band.min + band.max) / 2)
    }
  }
  return null
}

/* ─── Cache em memória (placa → resposta, TTL 24h) ─── */
type CacheEntry = { value: PlateResponse; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function getCached(key: string): PlateResponse | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCached(key: string, value: PlateResponse) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

export async function lookupPlate(
  placa: string,
): Promise<PlateResponse | PlateErrorResponse> {
  const normalized = placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.length !== 7) {
    return { success: false, error: 'Placa deve ter 7 caracteres' }
  }
  if (!POWERAPI_TOKEN) {
    return { success: false, error: 'Serviço de consulta indisponível no momento.' }
  }

  const cached = getCached(normalized)
  if (cached) return cached

  // 1) plates/{placa}
  const pcVehicle = await powerGet<PowerPlatesResp>(
    `/api/quotation/plates/${normalized}`,
  )
  if (!pcVehicle || pcVehicle.mensagem !== 'ok' || !pcVehicle.brand) {
    return { success: false, error: 'Veículo não encontrado' }
  }

  const brandName = pcVehicle.brand
  const codFipe = pcVehicle.codFipe || ''
  const yearStr = pcVehicle.year || ''
  // PowerCRM retorna year no formato "AAAA/MMMM" (ano fabricação / ano modelo)
  // OU só "AAAA". Pegamos o ÚLTIMO 4-dígito = ano modelo (que é o que bate
  // com o cy do cmby do PowerCRM e com a FIPE).
  const yearMatches = [...yearStr.matchAll(/(\d{4})/g)]
  const year = yearMatches.length > 0 ? yearMatches[yearMatches.length - 1][1] : undefined

  if (!codFipe || !year) {
    return { success: false, error: 'Dados do veículo incompletos' }
  }

  // Tipo do veículo (1 = carro/utilitário, 2 = moto, 3 = caminhão)
  const vt = (pcVehicle.vehicleType || '').toUpperCase()
  const isMoto = vt.includes('MOTO')
  const isCaminhao = vt.includes('CAMINHAO') || vt.includes('CAMINHÃO') || vt.includes('ONIBUS')
  const tipo = isMoto ? 2 : isCaminhao ? 3 : 1

  // 2) cb?type=tipo → mapear marca
  const cbList = await powerGet<PowerCbItem[]>(`/api/quotation/cb?type=${tipo}`)
  if (!cbList || !Array.isArray(cbList)) {
    return { success: false, error: 'Falha ao consultar marcas no PowerCRM' }
  }

  // Aliases DENATRAN → PowerCRM (siglas que não batem direto com cb.text)
  const BRAND_ALIASES: Record<string, string> = {
    MMC: 'MITSUBISHI',
    VW: 'VOLKSWAGEN',
    GM: 'CHEVROLET',
    FCA: 'FIAT',
    'MERCEDES-BENZ': 'MERCEDES',
    'CITROËN': 'CITROEN',
    'CITROEN': 'CITROEN',
    LR: 'LAND ROVER',
    'LAND-ROVER': 'LAND ROVER',
    BMC: 'BMW',
  }

  // Tokens significativos do brand (ignora 'I', 'II' lixo)
  // Tenta primeiro via alias (ex: MMC → MITSUBISHI), depois token literal.
  const rawTokens = brandName
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^I+$/.test(t))
  const tokens: string[] = []
  for (const t of rawTokens) {
    const alias = BRAND_ALIASES[t]
    if (alias) tokens.push(alias)
    tokens.push(t)
  }

  let cbMatch: PowerCbItem | undefined
  // 1ª passada: match exato (case-insensitive)
  for (const tok of tokens) {
    cbMatch = cbList.find((c) => (c.text || '').toUpperCase() === tok)
    if (cbMatch) break
  }
  // 2ª passada: cb.text contém token
  if (!cbMatch) {
    for (const tok of tokens) {
      cbMatch = cbList.find((c) => (c.text || '').toUpperCase().includes(tok))
      if (cbMatch) break
    }
  }
  // 3ª passada: token contém cb.text (ex: "MERCEDES-BENZ" contém "MERCEDES")
  if (!cbMatch) {
    for (const tok of tokens) {
      cbMatch = cbList.find((c) => {
        const cbText = (c.text || '').toUpperCase()
        return cbText.length >= 3 && tok.includes(cbText)
      })
      if (cbMatch) break
    }
  }
  // ─── PowerCRM chain INTERNA (cb→cmby→cmy→ct→plans) ───────
  // REGRA: se qualquer ponto da chain interna falhar, NÃO retornamos erro.
  // Pulamos pra API Brasil (que tem o veículo + valor FIPE oficial).
  // Isso resolve casos como Hyundai Elantra 2012 (codFipe não cadastrado em
  // cmby pra todos os anos) — a placa é achada, mas a chain não fecha.
  let mdl: number | undefined
  let cmbyExactBack: string | null = null
  let cmbyExactText: string | null = null
  if (cbMatch) {
    const cmbyList = await powerGet<PowerCmbyItem[]>(
      `/api/quotation/cmby?cb=${cbMatch.id}&cy=${year}`,
    )
    if (cmbyList && Array.isArray(cmbyList)) {
      const exact = cmbyList.find((m) => m.back === codFipe)
      if (exact) {
        mdl = exact.id
        cmbyExactBack = exact.back || null
        cmbyExactText = exact.text || null
      } else {
        console.log(
          `[plate-lookup] cmby sem match codFipe=${codFipe} cb=${cbMatch.id} cy=${year} (vai pra API Brasil)`,
        )
      }
    }
  } else {
    console.log(`[plate-lookup] cb sem match brand="${brandName}" (vai pra API Brasil)`)
  }
  // Suprime warning de variáveis usadas só pra resposta — preenchidas mais abaixo
  void cmbyExactBack
  void cmbyExactText

  // 4) cmy?cm=mdl → ano modelo
  const cmyList = await powerGet<PowerCmyItem[]>(
    `/api/quotation/cmy?cm=${mdl}`,
  )
  let mdlYr: number | undefined
  if (cmyList && Array.isArray(cmyList)) {
    const matchYear = cmyList.find((y) => (y.text || '').startsWith(year))
    if (matchYear) mdlYr = matchYear.id
  }

  // 5) stt + ct → cityId
  let cityId: number | undefined
  if (pcVehicle.uf && pcVehicle.city) {
    const sttList = await powerGet<PowerSttItem[]>(`/api/quotation/stt`)
    const state = sttList?.find((s) => s.back === pcVehicle.uf)
    if (state) {
      const ctList = await powerGet<PowerCtItem[]>(
        `/api/quotation/ct?st=${state.id}`,
      )
      const cityName = pcVehicle.city.toUpperCase()
      const city = ctList?.find((c) => (c.text || '').toUpperCase() === cityName)
      if (city) cityId = city.id
    }
  }

  // 6) /api/plans/ → planos com preços
  const plansResp = mdlYr && cityId
    ? await powerPost<PowerPlansResp>('/api/plans/', {
        carModelId: mdl,
        carModelYearId: mdlYr,
        cityId,
        quotationWorkVehicle: false,
      })
    : null

  // Mapeia plans do PowerCRM pro formato QuotePlan do site
  const plans: QuotePlan[] = []
  if (plansResp?.plans && Array.isArray(plansResp.plans)) {
    const seen = new Set<PlanId>()
    for (const p of plansResp.plans) {
      const id = planIdFromPowerName(p.name)
      if (seen.has(id)) continue
      seen.add(id)
      plans.push({
        id,
        name: p.name,
        monthly: p.priceValue,
        popular: id === 'vip',
      })
    }
  }

  // fipeValue REVERSO (procura faixa em PRICING_TABLES baseado nos planos PowerCRM)
  let fipeValue = reverseFipeValue(plans) ?? 0
  let fipeSource: 'powercrm-reverse' | 'apibrasil' | 'parallelum' = 'powercrm-reverse'

  // Marca/modelo finais — começam com PowerCRM cb/cmby (se achou) ou
  // brand cru do /plates/. Podem ser sobrescritos por API Brasil (mais limpo).
  let resolvedMarca = cbMatch?.text || brandName
  let resolvedModelo = cmbyExactText || ''

  // ─── Cascata de fallbacks (REGRA ABSOLUTA: fipeValue NUNCA pode ser zero) ───
  // Etapa 2: API Brasil — consulta direta pela placa (Denatran + FIPE oficial).
  if (fipeValue <= 0 && isApiBrasilConfigured()) {
    try {
      const ab = await lookupApiBrasilByPlate(normalized)
      if (ab && ab.fipeValue > 0) {
        console.log(
          `[plate-lookup] FIPE reverse falhou, usando API Brasil: R$ ${ab.fipeValue} (${ab.marca} ${ab.modelo} ${ab.ano})`,
        )
        fipeValue = ab.fipeValue
        fipeSource = 'apibrasil'
        // Se PowerCRM não fechou cmby (sem modelo), aproveita marca/modelo da API Brasil
        if (!resolvedModelo) {
          resolvedMarca = ab.marca || resolvedMarca
          resolvedModelo = ab.modelo || ''
        }
      }
    } catch (err) {
      console.warn(
        '[plate-lookup] API Brasil falhou:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Etapa 3: Parallelum — fuzzy match brand/model/year/codFipe (último recurso).
  if (fipeValue <= 0) {
    try {
      const direct = await lookupFipeDirect({
        brand: resolvedMarca,
        model: resolvedModelo || brandName,
        year,
        codFipe,
        categoria: isMoto ? 'MOTOCICLETA' : isCaminhao ? 'CAMINHAO' : 'AUTOMOVEL',
      })
      if (direct && direct.fipeValue > 0) {
        console.log(
          `[plate-lookup] reverse + API Brasil falharam, usando Parallelum: R$ ${direct.fipeValue} (matched: ${direct.matchedBrand} ${direct.matchedModel} ${direct.matchedYear})`,
        )
        fipeValue = direct.fipeValue
        fipeSource = 'parallelum'
        if (!resolvedModelo) {
          resolvedMarca = direct.matchedBrand || resolvedMarca
          resolvedModelo = direct.matchedModel || ''
        }
      }
    } catch (err) {
      console.warn(
        '[plate-lookup] Parallelum falhou:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // GUARD ABSOLUTO: se as 3 etapas falharam, NUNCA retornamos zero/valor inventado.
  // Cliente vai ver tela de atendimento humano (sem fallback manual).
  if (fipeValue <= 0) {
    console.error(
      `[plate-lookup] FALHA TOTAL pra placa ${normalized}: PowerCRM reverse + API Brasil + Parallelum não acharam valor. brand="${brandName}" year="${year}" codFipe="${codFipe}"`,
    )
    return {
      success: false,
      requires_human_support: true,
      error:
        'Não conseguimos consultar o valor do seu veículo automaticamente. Fale com nosso consultor pelo WhatsApp pra fazer sua cotação personalizada.',
    }
  }
  console.log(`[plate-lookup] OK placa=${normalized} fipe=R$${fipeValue} source=${fipeSource}`)

  const response: PlateResponse = {
    success: true,
    vehicle: {
      // Marca: PowerCRM cb (preferência) > API Brasil > brand cru.
      marca: resolvedMarca,
      // Modelo: PowerCRM cmby (preferência) > API Brasil. Se nada veio, usa brand cru.
      modelo: resolvedModelo || brandName,
      ano: year,
      cor: pcVehicle.color || '',
      fipeValue,
      fipeCode: codFipe,
      categoria: isMoto ? 'MOTOCICLETA' : isCaminhao ? 'CAMINHAO' : 'AUTOMOVEL',
      combustivel: pcVehicle.fuel || '',
      cilindrada: pcVehicle.cilinderCapacity ? Number(pcVehicle.cilinderCapacity) : undefined,
      chassi: pcVehicle.chassi,
    },
    plans,
    _internal: { mdl, mdlYr, cityId, pcVehicle },
  }

  setCached(normalized, response)
  return response
}
