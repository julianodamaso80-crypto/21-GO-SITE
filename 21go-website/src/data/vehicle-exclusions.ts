/* ─────────────────────────────────────────────────────────────────────────────
 * Lista de veiculos que a 21Go NAO faz protecao.
 * Quando o cliente digita uma placa e o veiculo cai nessa lista,
 * mostramos mensagem orientando a falar com um consultor via WhatsApp.
 *
 * Formato:
 *   - brand "TODOS" = marca inteira excluida
 *   - brand com array de modelos = apenas esses modelos excluidos
 * ───────────────────────────────────────────────────────────────────────────── */

interface ExclusionRule {
  brand: string
  /** Se undefined/vazio = marca inteira excluida */
  models?: string[]
}

const EXCLUSIONS: ExclusionRule[] = [
  { brand: 'AGRALLE' },
  { brand: 'AIRCROSS' },
  { brand: 'ALFA ROMEO' },
  { brand: 'AM GEN' },
  { brand: 'ASIA MOTORS' },
  { brand: 'AUDI' },
  { brand: 'BABY' },
  { brand: 'BRM' },
  { brand: 'BUGRE' },
  { brand: 'CAOA CHERY', models: ['ARRIZO', 'CELER', 'QQ', 'CIELO', 'FACE', 'J2', 'J3', 'J5', 'J6', 'S18', 'A3', 'A5'] },
  { brand: 'CHERY', models: ['ARRIZO', 'CELER', 'QQ', 'CIELO', 'FACE', 'J2', 'J3', 'J5', 'J6', 'S18', 'A3', 'A5'] },
  { brand: 'CHANA' },
  { brand: 'CHANGAN' },
  { brand: 'CHEVROLET', models: ['CAPTIVA', 'MALIBU', 'CAMARO', 'OMEGA', 'BLAZER', 'S10 BLAZER', 'CORVETTE', 'SONIC', 'BOLT', 'SUBURBAN', 'SUPREMA', 'SILVERADO', 'ZAFIRA'] },
  { brand: 'CHRYSLER' },
  { brand: 'CITROEN', models: ['XSARA', 'PICASSO', 'EVASION', 'XANTIA', 'XM', 'LOUNGE', 'C4', 'C5', 'C6', 'C8'] },
  { brand: 'CROSS LANDER' },
  { brand: 'DAEWOO' },
  { brand: 'DAIHATSU' },
  { brand: 'DODGE' },
  { brand: 'EFFA' },
  { brand: 'FIBRAVAN' },
  { brand: 'FIAT', models: ['500', 'BRAVA', 'BRAVO', 'MAREA', 'STILO', 'TEMPRA', 'TIPO', 'V1500E', '500 COUT', 'IDEA', 'LINEA', 'FREEMONT', 'PALIO WEEK', 'PALIO WEEKEND'] },
  { brand: 'FORD', models: ['EDGE', 'EXPLORER', 'MONDEO', 'TRANSIT', 'MAVERICK', 'MUSTANG', 'F150', 'F-150', 'BRONCO', 'ECOSPORT', 'SPORT', 'TERRITORY', 'FOCUS', 'COURIER', 'ESCORT', 'FUSION'] },
  { brand: 'FYBER' },
  { brand: 'GEELY' },
  { brand: 'GELLY' },
  { brand: 'HAFEI' },
  { brand: 'HAIMA' },
  { brand: 'HONDA', models: ['ACCORD', 'CIVIC COUPE', 'CIVIC SL'] },
  { brand: 'HYUNDAI', models: ['SANTA FE', 'SANTA FÉ', 'SONATA', 'VERACRUZ', 'VELOSTER', 'AZERA'] },
  { brand: 'JAC' },
  { brand: 'JAMBELI' },
  { brand: 'KIA', models: ['GRAND CARNIVAL', 'GRAND CARNIVAL', 'STINGER', 'QUORIS', 'PICANTO', 'NIRO', 'SORENTO', 'STONIC', 'CADENZA', 'OPTIMA', 'CARENS', 'MAGENTIS', 'MARGENTIS', 'MOHAVE', 'CERATO', 'SERATO'] },
  { brand: 'LADA' },
  { brand: 'LAND ROVER' },
  { brand: 'LANDWIND' },
  { brand: 'LEXUS' },
  { brand: 'LIFAN' },
  { brand: 'MAHINDRA' },
  { brand: 'MAZDA' },
  { brand: 'MINI' },
  { brand: 'MIURA' },
  { brand: 'MITSUBISHI', models: ['LANCER', 'L200 OUTDOOR', 'L200 GLS', 'L200 HPE', 'PAJERO HPE', 'PAJERO FULL', 'PAJERO SPORT'] },
  { brand: 'NISSAN', models: ['GT-R', 'GTR', 'X-TERRA', 'XTERRA', 'X-TRAIL', 'XTRAIL', 'TIIDA', 'TIDA'] },
  { brand: 'PEUGEOT', models: ['306', '405', '406', '407', '408', '504', '806', '807', 'RCZ', 'CONVERSIVEL', 'CONVERSÍVEL', 'CABRIOLET', 'CC'] },
  { brand: 'RELY' },
  { brand: 'RENAULT', models: ['LAGUNA', 'TWINGO', 'SYMBOL', 'FLUENCE', 'ZOE'] },
  { brand: 'SEAT' },
  { brand: 'SMART' },
  { brand: 'SSANGYONG' },
  { brand: 'SUBARU' },
  { brand: 'SUZUKI' },
  { brand: 'TAC' },
  { brand: 'TOYOTA', models: ['PRIUS'] },
  { brand: 'VOLKSWAGEN', models: ['BORA', 'PASSAT VARIANT', 'PASSAT', 'EOS', 'SPACEFOX', 'SPACE FOX', 'JETTA'] },
  { brand: 'VW', models: ['BORA', 'PASSAT VARIANT', 'PASSAT', 'EOS', 'SPACEFOX', 'SPACE FOX', 'JETTA'] },
  { brand: 'VOLVO' },
  { brand: 'WAKE' },
  { brand: 'YAMAHA', models: ['XJ6', 'XJ6 N'] },
]

/**
 * Normaliza string para comparacao: uppercase, sem acentos, trim.
 */
function normalize(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Verifica se um veiculo esta na lista de exclusao.
 *
 * @param marca - marca retornada pela API (ex: "CHEVROLET", "Fiat")
 * @param modelo - modelo retornado pela API (ex: "ONIX", "Captiva 2.4")
 * @returns true se o veiculo esta EXCLUIDO (nao fazemos protecao)
 */
export function isVehicleExcluded(marca: string, modelo: string): boolean {
  const normBrand = normalize(marca)
  const normModel = normalize(modelo)

  for (const rule of EXCLUSIONS) {
    const ruleBrand = normalize(rule.brand)

    // Checa se a marca bate (incluindo marcas compostas como "CAOA CHERY")
    if (!normBrand.includes(ruleBrand) && !ruleBrand.includes(normBrand)) continue

    // Marca inteira excluida
    if (!rule.models || rule.models.length === 0) return true

    // Checa modelos especificos
    for (const model of rule.models) {
      const normRuleModel = normalize(model)
      if (normModel.includes(normRuleModel)) return true
    }

    // Caso especial: Chevrolet Tracker ate 2013 — tratado no caller
    // Caso especial: Ford EcoSport ate 2012 — tratado no caller
    // Caso especial: Citroen C4 exceto Cactus
  }

  return false
}

/**
 * Exceções dentro das exclusões (veículos que parecem excluídos mas NÃO são):
 * - CAOA CHERY TIGGO: precisa comparecer na empresa, mas aceitamos
 * - CITROEN C4 CACTUS: aceito (outros C4 não)
 * - CHEVROLET TRACKER 2014+: aceito (até 2013 não)
 * - FORD ECOSPORT 2013+: aceito (até 2012 não)
 */
export function isVehicleException(marca: string, modelo: string, ano?: string): boolean {
  const normBrand = normalize(marca)
  const normModel = normalize(modelo)
  const year = ano ? parseInt(ano) : 0

  // CAOA CHERY / CHERY TIGGO — aceito (precisa ir na empresa)
  if ((normBrand.includes('CHERY') || normBrand.includes('CAOA')) && normModel.includes('TIGGO')) {
    return true
  }

  // CITROEN C4 CACTUS — aceito
  if (normBrand.includes('CITROEN') && normModel.includes('C4') && normModel.includes('CACTUS')) {
    return true
  }

  // CHEVROLET TRACKER 2014+ — aceito
  if (normBrand.includes('CHEVROLET') && normModel.includes('TRACKER') && year >= 2014) {
    return true
  }

  // FORD ECOSPORT 2013+ — aceito
  if (normBrand.includes('FORD') && normModel.includes('ECOSPORT') && year >= 2013) {
    return true
  }

  return false
}

/**
 * Verifica se o veiculo deve ser bloqueado na cotacao digital.
 * Retorna true se NAO podemos fazer cotacao automatica.
 */
export function shouldBlockQuote(marca: string, modelo: string, ano?: string): boolean {
  // Primeiro checa excecoes (veiculos que parecem excluidos mas sao aceitos)
  if (isVehicleException(marca, modelo, ano)) return false
  // Depois checa a lista de exclusao
  return isVehicleExcluded(marca, modelo)
}

/**
 * Ano minimo aceito pra cotacao automatica. Regra oficial 21Go:
 *   - 2006 e mais novo: AceitO (faz protecao)
 *   - 2005 e mais antigo: NAO faz (cliente cai na tela "Nao fazemos
 *     esse veiculo no momento" e contato fica salvo pra acionarmos depois)
 *
 * Configuravel — basta atualizar a constante quando a regra mudar.
 */
export const MIN_VEHICLE_YEAR = 2006

/**
 * Extrai o ano-modelo de uma string (a API as vezes devolve "2018", outras
 * "2018-1", outras "2018 Gasolina"). Retorna 0 se nao conseguir parsear.
 */
function parseYear(ano?: string | number): number {
  if (!ano) return 0
  const match = String(ano).match(/\b(\d{4})\b/)
  if (!match) return 0
  const n = parseInt(match[1], 10)
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return 0
  return n
}

/**
 * Retorna true se o veiculo eh muito antigo pra aceitarmos.
 * Usa MIN_VEHICLE_YEAR como corte oficial.
 */
export function isYearTooOld(ano?: string | number): boolean {
  const year = parseYear(ano)
  if (year === 0) return false // sem ano, deixa passar — outras camadas decidem
  return year < MIN_VEHICLE_YEAR
}

/** Motivos por que uma cotacao automatica nao pode ser concluida */
export type ExclusionReason = 'model' | 'year' | null

/**
 * Decide se o veiculo deve cair na tela "Nao fazemos agora" e por que motivo.
 * Retorna null se a cotacao pode prosseguir normalmente.
 */
export function getExclusionReason(
  marca: string,
  modelo: string,
  ano?: string | number,
): ExclusionReason {
  if (isYearTooOld(ano)) return 'year'
  if (shouldBlockQuote(marca, modelo, ano ? String(ano) : undefined)) return 'model'
  return null
}
