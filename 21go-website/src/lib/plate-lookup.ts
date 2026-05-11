/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ REGRAS ABSOLUTAS — CASCATA DE VALOR FIPE                                 ║
 * ║                                                                          ║
 * ║ O valor FIPE mostrado ao cliente PRECISA bater com o que o Hinova/Power  ║
 * ║ cobra na ativação. Cliente que vê R$ 32.501 no site e R$ 37.817 no       ║
 * ║ PowerCRM PERDE confiança e a 21Go perde receita.                         ║
 * ║                                                                          ║
 * ║ ETAPAS (estritas, nessa ordem — NUNCA pula etapa):                       ║
 * ║   1. PowerCRM /plates/{placa} — valida placa + pega codFipe + dados      ║
 * ║      (chassi, marca, ano, cor, combustivel, vehicleType, cidade/uf)      ║
 * ║      Esse endpoint NÃO retorna valor FIPE — só metadados.                ║
 * ║                                                                          ║
 * ║   2. API Brasil pela placa (R$ 0,10/consulta, créditos da 21Go)          ║
 * ║      Retorna FIPE OFICIAL atualizado mensalmente, ano modelo correto,    ║
 * ║      codFipe oficial. ESSA é a fonte de verdade do valor.                ║
 * ║                                                                          ║
 * ║   3. Parallelum por codFipe+ano (gratuito, fallback)                     ║
 * ║      Só roda se API Brasil falhar. Usa o codFipe do PowerCRM se tiver.   ║
 * ║                                                                          ║
 * ║   4. ATENDIMENTO HUMANO (requires_human_support: true)                   ║
 * ║      Se as 3 etapas acima falharem em achar valor REAL, NUNCA inventa.   ║
 * ║      Cliente vai ver tela pedindo pra chamar no WhatsApp.                ║
 * ║                                                                          ║
 * ║ PROIBIÇÕES (regras de OURO — NUNCA QUEBRAR):                             ║
 * ║   ❌ NUNCA inferir valor FIPE por engenharia reversa de preço de plano   ║
 * ║      (média de faixa da tabela). Pode errar até R$ 5k.                   ║
 * ║   ❌ NUNCA retornar fipeValue=0 ou fallback inventado.                   ║
 * ║   ❌ NUNCA parar a cascata antes de tentar as 3 fontes.                  ║
 * ║   ❌ NUNCA mostrar planos calculados em cima de valor FIPE chutado.      ║
 * ║                                                                          ║
 * ║ Os planos exibidos ao cliente são calculados LOCALMENTE com              ║
 * ║ findPrice/getApplicablePlans em cima do fipeValue OFICIAL — assim o      ║
 * ║ preço bate exatamente com PRICING_TABLES (fonte única da verdade).       ║
 * ║                                                                          ║
 * ║ PowerCRM /plans/ ainda é chamado best-effort APÓS ter o valor oficial,   ║
 * ║ apenas pra integração de lead no PowerCRM (não pra exibir preço).        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import {
  PRICING_TABLES,
  findPrice,
  getApplicablePlans,
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
  /** Fonte do valor FIPE final (auditoria) */
  fipe_source: 'apibrasil' | 'parallelum'
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

/** Resposta padrão de escalation pra humano — usada quando a cascata falha */
function humanSupportResponse(reason: string, placa: string): PlateErrorResponse {
  console.error(`[plate-lookup] ESCALATION humano placa=${placa} motivo=${reason}`)
  return {
    success: false,
    requires_human_support: true,
    error:
      'Não conseguimos consultar o valor do seu veículo automaticamente. Fale com nosso consultor pelo WhatsApp pra fazer sua cotação personalizada.',
  }
}

/**
 * Tenta /plates/ do PowerCRM. Retorna null se falhar — caller decide se continua
 * cascata sem dados do PowerCRM (API Brasil resolve sozinha pela placa).
 */
async function fetchPowerPlates(placa: string): Promise<PowerPlatesResp | null> {
  const r = await powerGet<PowerPlatesResp>(`/api/quotation/plates/${placa}`)
  if (!r || r.mensagem !== 'ok' || !r.brand) return null
  return r
}

/**
 * Parser do campo year do PowerCRM. Aceita "AAAA", "AAAA/MMMM" ou "MMMM/AAAA".
 * Sempre retorna o ÚLTIMO 4-dígito (ano modelo) — esse é o que bate com FIPE.
 */
function parsePowerYear(yearStr: string | undefined | null): string | undefined {
  if (!yearStr) return undefined
  const matches = [...yearStr.matchAll(/(\d{4})/g)]
  if (matches.length === 0) return undefined
  return matches[matches.length - 1][1]
}

/**
 * Categoria do veículo pra calcular planos.
 * Aceita info do PowerCRM (vehicleType) OU da API Brasil (categoria).
 */
function inferCategoria(
  pcVehicleType?: string,
  abCategoria?: string,
): { tipo: number; categoria: 'AUTOMOVEL' | 'MOTOCICLETA' | 'CAMINHAO'; isMoto: boolean; isCaminhao: boolean } {
  const raw = `${pcVehicleType || ''} ${abCategoria || ''}`.toUpperCase()
  const isMoto = raw.includes('MOTO')
  const isCaminhao = raw.includes('CAMINHAO') || raw.includes('CAMINHÃO') || raw.includes('ONIBUS')
  const tipo = isMoto ? 2 : isCaminhao ? 3 : 1
  const categoria = isMoto ? 'MOTOCICLETA' : isCaminhao ? 'CAMINHAO' : 'AUTOMOVEL'
  return { tipo, categoria, isMoto, isCaminhao }
}

/**
 * Tenta resolver mdl/mdlYr/cityId pelo PowerCRM (cb→cmby→cmy→stt→ct).
 * Best-effort: se falhar, retorna undefined nos campos — sem afetar o valor FIPE
 * mostrado ao cliente (esse já veio da API Brasil/Parallelum).
 *
 * O retorno aqui só serve pra integração de lead em /api/plans/ depois.
 */
async function resolvePowerInternals(
  pc: PowerPlatesResp,
  tipo: number,
  year: string,
  codFipe: string,
): Promise<{ mdl?: number; mdlYr?: number; cityId?: number }> {
  const cbList = await powerGet<PowerCbItem[]>(`/api/quotation/cb?type=${tipo}`)
  if (!cbList || !Array.isArray(cbList)) return {}

  const BRAND_ALIASES: Record<string, string> = {
    MMC: 'MITSUBISHI',
    VW: 'VOLKSWAGEN',
    GM: 'CHEVROLET',
    FCA: 'FIAT',
    'MERCEDES-BENZ': 'MERCEDES',
    'CITROËN': 'CITROEN',
    CITROEN: 'CITROEN',
    LR: 'LAND ROVER',
    'LAND-ROVER': 'LAND ROVER',
    BMC: 'BMW',
  }

  const brandName = pc.brand || ''
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
  for (const tok of tokens) {
    cbMatch = cbList.find((c) => (c.text || '').toUpperCase() === tok)
    if (cbMatch) break
  }
  if (!cbMatch) {
    for (const tok of tokens) {
      cbMatch = cbList.find((c) => (c.text || '').toUpperCase().includes(tok))
      if (cbMatch) break
    }
  }
  if (!cbMatch) {
    for (const tok of tokens) {
      cbMatch = cbList.find((c) => {
        const cbText = (c.text || '').toUpperCase()
        return cbText.length >= 3 && tok.includes(cbText)
      })
      if (cbMatch) break
    }
  }
  if (!cbMatch) return {}

  const cmbyList = await powerGet<PowerCmbyItem[]>(
    `/api/quotation/cmby?cb=${cbMatch.id}&cy=${year}`,
  )
  if (!cmbyList || !Array.isArray(cmbyList)) return {}

  const exact = cmbyList.find((m) => m.back === codFipe)
  if (!exact) return {}

  const mdl = exact.id

  const cmyList = await powerGet<PowerCmyItem[]>(`/api/quotation/cmy?cm=${mdl}`)
  let mdlYr: number | undefined
  if (cmyList && Array.isArray(cmyList)) {
    const matchYear = cmyList.find((y) => (y.text || '').startsWith(year))
    if (matchYear) mdlYr = matchYear.id
  }

  let cityId: number | undefined
  if (pc.uf && pc.city) {
    const sttList = await powerGet<PowerSttItem[]>(`/api/quotation/stt`)
    const state = sttList?.find((s) => s.back === pc.uf)
    if (state) {
      const ctList = await powerGet<PowerCtItem[]>(`/api/quotation/ct?st=${state.id}`)
      const cityName = pc.city.toUpperCase()
      const city = ctList?.find((c) => (c.text || '').toUpperCase() === cityName)
      if (city) cityId = city.id
    }
  }

  return { mdl, mdlYr, cityId }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ETAPA 1 — PowerCRM /plates/ (best-effort: dá metadados, NÃO dá valor FIPE)
  // ═══════════════════════════════════════════════════════════════════════════
  const pcVehicle = await fetchPowerPlates(normalized)
  const pcCodFipe = pcVehicle?.codFipe || ''
  const pcYear = parsePowerYear(pcVehicle?.year)
  const pcBrand = pcVehicle?.brand || ''

  if (!pcVehicle) {
    console.log(
      `[plate-lookup] PowerCRM /plates/ falhou pra placa ${normalized} — indo direto pra API Brasil`,
    )
  } else if (!pcCodFipe || !pcYear) {
    console.log(
      `[plate-lookup] PowerCRM /plates/ sem codFipe/year pra placa ${normalized} — indo pra API Brasil`,
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ETAPA 2 — API Brasil pela placa (FIPE OFICIAL, fonte de verdade do valor)
  // ═══════════════════════════════════════════════════════════════════════════
  let fipeValue = 0
  let fipeCode = pcCodFipe
  let year = pcYear || ''
  let marca = pcBrand
  let modelo = ''
  let cor = pcVehicle?.color || ''
  let combustivel = pcVehicle?.fuel || ''
  let chassi = pcVehicle?.chassi
  let cilindrada: number | undefined = pcVehicle?.cilinderCapacity
    ? Number(pcVehicle.cilinderCapacity)
    : undefined
  let abCategoriaRaw = ''
  let fipeSource: 'apibrasil' | 'parallelum' | null = null

  if (isApiBrasilConfigured()) {
    try {
      const ab = await lookupApiBrasilByPlate(normalized)
      if (ab && ab.fipeValue > 0) {
        fipeValue = ab.fipeValue
        fipeSource = 'apibrasil'
        // API Brasil é fonte de verdade: sobrescreve marca/modelo/ano/codFipe
        marca = ab.marca || marca
        modelo = ab.modelo || modelo
        year = ab.ano || year
        fipeCode = ab.codFipe || fipeCode
        cor = ab.cor || cor
        combustivel = ab.combustivel || combustivel
        chassi = ab.chassi || chassi
        cilindrada = ab.cilindrada ?? cilindrada
        abCategoriaRaw = ab.categoria || ''
      }
    } catch (err) {
      console.warn(
        '[plate-lookup] API Brasil falhou:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ETAPA 3 — Parallelum por codFipe+ano (fallback se API Brasil falhou)
  // ═══════════════════════════════════════════════════════════════════════════
  if (fipeValue <= 0) {
    if (!pcCodFipe || !pcYear) {
      // Sem codFipe do PowerCRM e sem API Brasil, não dá pra consultar Parallelum
      return humanSupportResponse('sem_codfipe_e_sem_apibrasil', normalized)
    }

    const { isMoto, isCaminhao } = inferCategoria(pcVehicle?.vehicleType)
    try {
      const direct = await lookupFipeDirect({
        brand: pcBrand,
        model: pcBrand, // sem modelo confiável (cmby pode ter falhado), tenta brand
        year: pcYear,
        codFipe: pcCodFipe,
        categoria: isMoto ? 'MOTOCICLETA' : isCaminhao ? 'CAMINHAO' : 'AUTOMOVEL',
      })
      if (direct && direct.fipeValue > 0) {
        fipeValue = direct.fipeValue
        fipeSource = 'parallelum'
        marca = direct.matchedBrand || marca
        modelo = direct.matchedModel || modelo
        if (direct.matchedYear) {
          const yMatch = String(direct.matchedYear).match(/(\d{4})/)
          if (yMatch) year = yMatch[1]
        }
      }
    } catch (err) {
      console.warn(
        '[plate-lookup] Parallelum falhou:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARD ABSOLUTO — Se as 3 etapas não acharam valor REAL, vai pra humano
  // ═══════════════════════════════════════════════════════════════════════════
  if (fipeValue <= 0 || !fipeSource) {
    return humanSupportResponse('fipe_nao_encontrado_em_nenhuma_fonte', normalized)
  }

  if (!year) {
    return humanSupportResponse('ano_nao_resolvido', normalized)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ETAPA 4 — Calcular planos LOCALMENTE em cima do FIPE oficial
  // (preço EXATO da PRICING_TABLES — bate sempre com a tabela oficial)
  // ═══════════════════════════════════════════════════════════════════════════
  const { tipo, categoria, isMoto, isCaminhao } = inferCategoria(
    pcVehicle?.vehicleType,
    abCategoriaRaw,
  )

  const plans = getApplicablePlans(
    fipeValue,
    categoria,
    combustivel,
    cilindrada,
    modelo || marca,
  )

  if (plans.length === 0) {
    // FIPE válido mas fora das faixas das tabelas (ex: caminhão pesado, especial fora de regra)
    return humanSupportResponse(
      `fipe_R$${fipeValue}_sem_plano_aplicavel`,
      normalized,
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ETAPA 5 — PowerCRM internals (best-effort, NÃO afeta o que cliente vê)
  // Usado só pra integração de lead no PowerCRM depois.
  // ═══════════════════════════════════════════════════════════════════════════
  let internals: { mdl?: number; mdlYr?: number; cityId?: number } = {}
  if (pcVehicle && pcCodFipe && pcYear) {
    try {
      internals = await resolvePowerInternals(pcVehicle, tipo, pcYear, pcCodFipe)
    } catch (err) {
      console.warn(
        '[plate-lookup] resolvePowerInternals falhou (best-effort, não bloqueia):',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-check (auditoria, NÃO altera resultado)
  // Se temos internals + PowerCRM /plans/, compara preço PowerCRM com preço
  // calculado local — divergência > R$ 1 vira log de alerta.
  // ═══════════════════════════════════════════════════════════════════════════
  if (internals.mdl && internals.mdlYr && internals.cityId) {
    const plansResp = await powerPost<PowerPlansResp>('/api/plans/', {
      carModelId: internals.mdl,
      carModelYearId: internals.mdlYr,
      cityId: internals.cityId,
      quotationWorkVehicle: false,
    }).catch(() => null)
    if (plansResp?.plans && Array.isArray(plansResp.plans)) {
      for (const pcPlan of plansResp.plans) {
        const lower = pcPlan.name.toLowerCase()
        const matchId: PlanId | null = lower.includes('especial')
          ? 'especial'
          : lower.includes('suv')
            ? 'suv'
            : lower.includes('moto') && lower.includes('400')
              ? 'moto-400'
              : lower.includes('moto')
                ? 'moto-1000'
                : lower.includes('premium')
                  ? 'premium'
                  : lower.includes('vip')
                    ? 'vip'
                    : lower.includes('jeito')
                      ? 'do-seu-jeito'
                      : lower.includes('básico') || lower.includes('basico')
                        ? 'basico'
                        : null
        if (!matchId) continue
        const ourPrice = findPrice(PRICING_TABLES[matchId], fipeValue)
        if (ourPrice != null && Math.abs(ourPrice - pcPlan.priceValue) > 1) {
          console.warn(
            `[plate-lookup] DIVERGENCIA placa=${normalized} plano=${matchId} fipe=R$${fipeValue} local=R$${ourPrice} powercrm=R$${pcPlan.priceValue}`,
          )
        }
      }
    }
  }

  console.log(
    `[plate-lookup] OK placa=${normalized} fipe=R$${fipeValue} source=${fipeSource} marca="${marca}" modelo="${modelo}" ano=${year}`,
  )

  const response: PlateResponse = {
    success: true,
    vehicle: {
      marca: marca || pcBrand,
      modelo: modelo || pcBrand,
      ano: year,
      cor,
      fipeValue,
      fipeCode,
      categoria,
      combustivel,
      cilindrada,
      chassi,
    },
    plans,
    fipe_source: fipeSource,
    _internal: {
      mdl: internals.mdl,
      mdlYr: internals.mdlYr,
      cityId: internals.cityId,
      pcVehicle,
    },
  }

  setCached(normalized, response)
  return response
}
