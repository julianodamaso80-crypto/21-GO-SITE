/* ─────────────────────────────────────────────────────────────────────────────
 * Veiculos que a 21Go NAO faz.
 *
 * FONTE: PowerCRM > Configuracoes > Cotacao FIPE > Tabelas de preco.
 * Cada tabela de preco amarra marcas e versoes FIPE; versao que nao esta em
 * nenhuma das 9 tabelas de protecao nao gera cotacao — e isso, na pratica, e o
 * que a 21Go nao faz. Esta lista foi extraida da conta da 21Go em 31/07/2026,
 * nao e chute nem lista escrita a mao.
 *
 * Tabelas de protecao consideradas: VEICULOS COMUNS (26383), COMUNS APLICATIVO
 * (25508), SUV (4153), SUV APLICATIVO (37706), ESPECIAIS (35127), ESPECIAIS
 * APLICATIVO (35758), ESPECIAIS DUPLICADA (38629), MOTOCICLETAS (4154),
 * ESPECIAIS PESADOS (9037). As tabelas "Monitoramento" e "Roubo e Furto"
 * ficaram de fora de proposito: sao produto de rastreador e tem quase todas as
 * marcas marcadas, entao nao servem como regra de aceitacao.
 *
 * Quando o veiculo cai aqui, a tela so agradece o cliente e encerra — sem botao
 * de WhatsApp e sem gerar lead pra equipe (ordem do dono, 31/07/2026): veiculo
 * que nao fazemos nao pode consumir tempo de atendimento.
 *
 * Pra atualizar: reextrair do PowerCRM (fetchPriceTableBrandsWithYears por
 * tabela + fetchGroupedCarModelsForCarBrand por marca) e regerar este bloco.
 *
 * Formato:
 *   - brand sem models = marca inteira sem cotacao
 *   - brand com models = so esses modelos ficam de fora
 * ───────────────────────────────────────────────────────────────────────────── */

interface ExclusionRule {
  brand: string
  /** Se undefined/vazio = marca inteira excluida */
  models?: string[]
}

const EXCLUSIONS: ExclusionRule[] = [
  { brand: 'ACURA' },
  { brand: 'ALFA ROMEO' },
  { brand: 'AM GEN' },
  { brand: 'ASIA MOTORS' },
  { brand: 'ASTON MARTIN' },
  { brand: 'AUDI' },
  { brand: 'BABY' },
  { brand: 'BMW', models: ['116', '118', '120', '125', '130', '135', '140', '218', '220', '225', '235', '240', '316', '318', '323', '325', '330', '335', '340', '420', '428', '430', '435', '520', '525', '528', '530', '540', '545', '550', '640', '645', '650', '730', '735', '740', '745', '750', '760', '840', '850', 'i3', 'i4', 'i8', 'iX', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'Roadster', 'X2', 'X4', 'X5', 'X6', 'X7', 'Z3', 'Z4', 'Z8'] },
  { brand: 'BRM' },
  { brand: 'BUGRE' },
  { brand: 'BYCRISTO' },
  { brand: 'CAB MOTORS' },
  { brand: 'CADILLAC' },
  { brand: 'CAOA CHERY', models: ['Celer', 'CIELO', 'QQ', 'S-18'] },
  { brand: 'CAOA CHERY/CHERY', models: ['Celer', 'CIELO', 'QQ', 'S-18'] },
  { brand: 'CBT JIPE' },
  { brand: 'CHANA' },
  { brand: 'CHANGAN' },
  { brand: 'CHERY', models: ['Celer', 'CIELO', 'QQ', 'S-18'] },
  { brand: 'CHEVROLET', models: ['Camaro', 'Corvette', 'Kadett', 'Malibu', 'Sonic', 'SpaceVan', 'Trafic', 'Zafira'] },
  { brand: 'CHRYSLER' },
  { brand: 'CITROEN', models: ['Berlingo', 'C5', 'C6', 'C8', 'DS3', 'DS4', 'DS5', 'Jumpy', 'Xantia'] },
  { brand: 'CROSS LANDER' },
  { brand: 'DAEWOO' },
  { brand: 'DAIHATSU' },
  { brand: 'DODGE' },
  { brand: 'ENGESA' },
  { brand: 'ENVEMO' },
  { brand: 'FERRARI' },
  { brand: 'FIAT', models: ['500', 'Brava', 'Marea', 'Premio', 'Stilo', 'Tempra', 'Tipo', 'Titano'] },
  { brand: 'FIBRAVAN' },
  { brand: 'FORD', models: ['EDGE'] },
  { brand: 'FOTON' },
  { brand: 'FYBER' },
  { brand: 'GM - CHEVROLET', models: ['Camaro', 'Corvette', 'Kadett', 'Malibu', 'Sonic', 'SpaceVan', 'Trafic', 'Zafira'] },
  { brand: 'GREAT WALL' },
  { brand: 'GURGEL' },
  { brand: 'GWM', models: ['Ora 03'] },
  { brand: 'HAFEI' },
  { brand: 'HITECH ELECTRIC' },
  { brand: 'HYUNDAI', models: ['Azera'] },
  { brand: 'ISUZU' },
  { brand: 'JAC', models: ['J5', 'J6', 'T40', 'T50', 'T6', 'T60', 'T8', 'T80', 'V260'] },
  { brand: 'JAECOO' },
  { brand: 'JAGUAR' },
  { brand: 'JINBEI' },
  { brand: 'JPX' },
  { brand: 'KASINSKI' },
  { brand: 'KIA', models: ['Carens', 'Magentis', 'Niro', 'Opirus', 'Optima', 'Picanto', 'Quoris', 'RIO', 'Stonic'] },
  { brand: 'KIA MOTORS', models: ['Carens', 'Magentis', 'Niro', 'Opirus', 'Optima', 'Picanto', 'Quoris', 'RIO', 'Stonic'] },
  { brand: 'LADA' },
  { brand: 'LAMBORGHINI' },
  { brand: 'LAND ROVER', models: ['Defender', 'Freelander', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Vogue'] },
  { brand: 'LEXUS' },
  { brand: 'LIFAN', models: ['530', '620', 'FOISON', 'X60', 'X80'] },
  { brand: 'LOBINI' },
  { brand: 'LOTUS' },
  { brand: 'MAHINDRA' },
  { brand: 'MASERATI' },
  { brand: 'MATRA' },
  { brand: 'MAZDA' },
  { brand: 'MCLAREN' },
  { brand: 'MERCEDES BENZ', models: ['A 200', 'A 250', 'A 35', 'C-220', 'C-230', 'C-240', 'C-280', 'C-300', 'C-320', 'C-350', 'C-36', 'C-43', 'C-450', 'C-55', 'C-63', 'CL-500', 'CL-600', 'CL-63', 'CL-65', 'CLA-180', 'CLA-250', 'CLA-35', 'CLA-45', 'Classe A', 'Classe B', 'Classe R', 'CLC', 'CLK', 'CLS', 'GL', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'GT', 'ML', 'SE', 'SL', 'SLC', 'SLK', 'SLS', 'VITO'] },
  { brand: 'MERCEDES-BENZ', models: ['A 200', 'A 250', 'A 35', 'C-220', 'C-230', 'C-240', 'C-280', 'C-300', 'C-320', 'C-350', 'C-36', 'C-43', 'C-450', 'C-55', 'C-63', 'CL-500', 'CL-600', 'CL-63', 'CL-65', 'CLA-180', 'CLA-250', 'CLA-35', 'CLA-45', 'Classe A', 'Classe B', 'Classe R', 'CLC', 'CLK', 'CLS', 'GL', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'GT', 'ML', 'SE', 'SL', 'SLC', 'SLK', 'SLS', 'VITO'] },
  { brand: 'MERCURY' },
  { brand: 'MG' },
  { brand: 'MINI', models: ['One'] },
  { brand: 'MIURA' },
  { brand: 'PLYMOUTH' },
  { brand: 'PONTIAC' },
  { brand: 'PORSCHE' },
  { brand: 'RAM', models: ['1500', '2500', '3500'] },
  { brand: 'RELY' },
  { brand: 'RENAULT', models: ['Megane', 'Scénic', 'Symbol', 'Trafic', 'Twingo'] },
  { brand: 'ROLLS-ROYCE' },
  { brand: 'ROVER' },
  { brand: 'SAAB' },
  { brand: 'SATURN' },
  { brand: 'SCANIA' },
  { brand: 'SEAT' },
  { brand: 'SMART' },
  { brand: 'SSANGYONG' },
  { brand: 'SUBARU' },
  { brand: 'SUPER SOCO' },
  { brand: 'SUZUKI', models: ['Baleno', 'Ignis', 'Jimny', 'S-CROSS', 'Swift'] },
  { brand: 'TAC' },
  { brand: 'TIGER' },
  { brand: 'TOYOTA', models: ['Land Cruiser'] },
  { brand: 'TRAXX' },
  { brand: 'TROLLER' },
  { brand: 'VENTO' },
  { brand: 'VOLKSWAGEN', models: ['Amarok', 'Bora'] },
  { brand: 'VOLTZ' },
  { brand: 'VOLVO', models: ['C30', 'C40', 'C70', 'EX30', 'S40', 'S60', 'S70', 'S80', 'S90', 'V40', 'V50', 'V60', 'V70', 'XC 40', 'XC 90'] },
  { brand: 'VW', models: ['Amarok', 'Bora'] },
  { brand: 'VW - VOLKSWAGEN', models: ['Amarok', 'Bora'] },
  { brand: 'WAKE' },
  { brand: 'WALK' },
  { brand: 'WUYANG' },
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
 * A FIPE quase sempre escreve o modelo no comeco do nome da versao
 * ("Camaro 6.2", "Range Rover Evoque 2.0 SE", "116i 1.6 TB"), entao comparamos
 * por prefixo em vez de substring solta — substring bloqueava veiculo errado
 * (a regra "500" do Fiat 500 pegava "Palio ELX/ 500 1.0", que a 21Go faz).
 *
 * A guarda do digito deixa passar sufixo de motorizacao ("116" casa "116i")
 * e barra vizinho numerico ("T6" nao casa "T60", que tem regra propria).
 * Comparamos tambem sem espacos porque a FIPE oscila entre "XC 40" e "XC40".
 */
function matchesModel(modelo: string, regra: string): boolean {
  const alvo = normalize(modelo)
  const r = normalize(regra)
  if (!r) return false

  // Regra com digito ("116", "XC 40") aceita letra logo depois, porque a FIPE
  // escreve "116i" e "530e". Regra so de letras ("GL", "ML") exige fronteira de
  // verdade — senao "GL" pegava "GLA 200", que a 21Go faz.
  const temDigito = /[0-9]/.test(r)
  const prefixOk = (texto: string, prefixo: string): boolean => {
    if (!texto.startsWith(prefixo)) return false
    const next = texto.charAt(prefixo.length)
    if (next === '') return true
    if (/[0-9]/.test(next)) return false
    return temDigito || !/[A-Z]/.test(next)
  }

  if (prefixOk(alvo, r)) return true
  return prefixOk(alvo.replace(/\s+/g, ''), r.replace(/\s+/g, ''))
}

/**
 * A marca precisa bater exatamente. Comparar por "contem" derrubava veiculo
 * certo: "Land Rover" casava a regra "Rover" e a moto "BRAVA" casava
 * "FIBRAVAN". A unica folga e o prefixo de grupo que a FIPE usa
 * ("GM - Chevrolet", "VW - VolksWagen"), descascado antes de comparar.
 */
function matchesBrand(marca: string, regra: string): boolean {
  const a = normalize(marca)
  const r = normalize(regra)
  if (a === r) return true
  return a.replace(/^[A-Z]{2,4}\s*-\s*/, '') === r
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
    // Checa se a marca bate (incluindo marcas compostas como "GM - CHEVROLET")
    if (!matchesBrand(normBrand, rule.brand)) continue

    // Marca inteira excluida
    if (!rule.models || rule.models.length === 0) return true

    // Checa modelos especificos
    for (const model of rule.models) {
      if (matchesModel(normModel, model)) return true
    }
  }

  return false
}

/**
 * Verifica se o veiculo deve ser bloqueado na cotacao digital.
 * Retorna true se NAO podemos fazer cotacao automatica.
 */
export function shouldBlockQuote(marca: string, modelo: string): boolean {
  return isVehicleExcluded(marca, modelo)
}

/**
 * Ano minimo aceito pra cotacao automatica. Regra oficial 21Go:
 *   - 2006 e mais novo: AceitO (faz protecao)
 *   - 2005 e mais antigo: NAO faz (cliente cai na tela "Nao fazemos
 *     esse veiculo no momento")
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
  if (shouldBlockQuote(marca, modelo)) return 'model'
  return null
}
