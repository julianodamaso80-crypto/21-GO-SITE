/* ─────────────────────────────────────────────────────────────────────────────
 * Tabela de precos REAL da 21Go — 8 planos por faixa de valor FIPE
 * ───────────────────────────────────────────────────────────────────────────── */

export type PlanId =
  | 'basico'
  | 'do-seu-jeito'
  | 'vip'
  | 'premium'
  | 'suv'
  | 'moto-400'
  | 'moto-1000'
  | 'especial'

export type VehicleCategory = 'carro' | 'moto' | 'suv' | 'especial'

export interface PricingBand {
  min: number
  max: number
  price: number
}

/* PlanInfo is defined below alongside PLAN_INFO */

/* ─── Faixas de preco por plano ─── */

const BASICO: PricingBand[] = [
  { min: 0, max: 15000, price: 106.50 },
  { min: 15001, max: 20000, price: 106.50 },
  { min: 20001, max: 25000, price: 116.31 },
  { min: 25001, max: 30000, price: 129.61 },
  { min: 30001, max: 35000, price: 144.08 },
  { min: 35001, max: 40000, price: 150.81 },
  { min: 40001, max: 45000, price: 172.70 },
  { min: 45001, max: 50000, price: 189.80 },
  { min: 50001, max: 55000, price: 202.49 },
  { min: 55001, max: 60000, price: 236.08 },
  { min: 60001, max: 65000, price: 252.80 },
  { min: 65001, max: 70000, price: 263.29 },
  { min: 70001, max: 75000, price: 289.81 },
  { min: 75001, max: 80000, price: 322.80 },
  { min: 80001, max: 85000, price: 336.52 },
  { min: 85001, max: 90000, price: 345.79 },
  { min: 90001, max: 95000, price: 365.02 },
  { min: 95001, max: 100000, price: 391.31 },
  { min: 100001, max: 110000, price: 406.02 },
  { min: 110001, max: 120000, price: 418.48 },
  { min: 120001, max: 130000, price: 432.50 },
]

const DO_SEU_JEITO: PricingBand[] = [
  { min: 0, max: 15000, price: 107.40 },
  { min: 15001, max: 20000, price: 118.50 },
  { min: 20001, max: 25000, price: 128.30 },
  { min: 25001, max: 30000, price: 141.60 },
  { min: 30001, max: 35000, price: 156.10 },
  { min: 35001, max: 40000, price: 162.80 },
  { min: 40001, max: 45000, price: 184.70 },
  { min: 45001, max: 50000, price: 201.80 },
  { min: 50001, max: 55000, price: 214.50 },
  { min: 55001, max: 60000, price: 248.10 },
  { min: 60001, max: 65000, price: 264.80 },
  { min: 65001, max: 70000, price: 275.30 },
  { min: 70001, max: 75000, price: 301.80 },
  { min: 75001, max: 80000, price: 334.80 },
  { min: 80001, max: 85000, price: 348.50 },
  { min: 85001, max: 90000, price: 357.80 },
  { min: 90001, max: 95000, price: 377.80 },
  { min: 95001, max: 100000, price: 403.30 },
  { min: 100001, max: 110000, price: 418.00 },
  { min: 110001, max: 120000, price: 430.50 },
  { min: 120001, max: 130000, price: 444.50 },
]

const VIP: PricingBand[] = [
  { min: 0, max: 15000, price: 126.50 },
  { min: 15001, max: 20000, price: 131.41 },
  { min: 20001, max: 25000, price: 149.49 },
  { min: 25001, max: 30000, price: 159.49 },
  { min: 30001, max: 35000, price: 185.47 },
  { min: 35001, max: 40000, price: 194.42 },
  { min: 40001, max: 45000, price: 227.41 },
  { min: 45001, max: 50000, price: 241.45 },
  { min: 50001, max: 55000, price: 269.53 },
  { min: 55001, max: 60000, price: 294.98 },
  { min: 60001, max: 65000, price: 314.99 },
  { min: 65001, max: 70000, price: 329.55 },
  { min: 70001, max: 75000, price: 359.04 },
  { min: 75001, max: 80000, price: 398.53 },
  { min: 80001, max: 85000, price: 403.26 },
  { min: 85001, max: 90000, price: 418.88 },
  { min: 90001, max: 95000, price: 432.75 },
  { min: 95001, max: 100000, price: 454.51 },
  { min: 100001, max: 110000, price: 466.27 },
  { min: 110001, max: 120000, price: 488.56 },
  { min: 120001, max: 130000, price: 518.04 },
]

const PREMIUM: PricingBand[] = [
  { min: 0, max: 15000, price: 165.35 },
  { min: 15001, max: 20000, price: 181.57 },
  { min: 20001, max: 25000, price: 195.68 },
  { min: 25001, max: 30000, price: 219.60 },
  { min: 30001, max: 35000, price: 242.74 },
  { min: 35001, max: 40000, price: 255.25 },
  { min: 40001, max: 45000, price: 292.53 },
  { min: 45001, max: 50000, price: 322.43 },
  { min: 50001, max: 55000, price: 341.75 },
  { min: 55001, max: 60000, price: 387.22 },
  { min: 60001, max: 65000, price: 419.40 },
  { min: 65001, max: 70000, price: 435.30 },
  { min: 70001, max: 75000, price: 470.32 },
  { min: 75001, max: 80000, price: 500.59 },
  { min: 80001, max: 90000, price: 523.22 },
  { min: 90001, max: 100000, price: 601.05 },
]

const SUV: PricingBand[] = [
  { min: 0, max: 15000, price: 145.00 },
  { min: 15001, max: 20000, price: 150.00 },
  { min: 20001, max: 25000, price: 168.00 },
  { min: 25001, max: 30000, price: 178.00 },
  { min: 30001, max: 35000, price: 204.00 },
  { min: 35001, max: 40000, price: 213.00 },
  { min: 40001, max: 45000, price: 246.00 },
  { min: 45001, max: 50000, price: 260.00 },
  { min: 50001, max: 55000, price: 278.50 },
  { min: 55001, max: 60000, price: 313.50 },
  { min: 60001, max: 65000, price: 333.50 },
  { min: 65001, max: 70000, price: 348.00 },
  { min: 70001, max: 75000, price: 377.50 },
  { min: 75001, max: 80000, price: 470.00 },
  { min: 80001, max: 85000, price: 421.80 },
  { min: 85001, max: 90000, price: 437.30 },
  { min: 90001, max: 95000, price: 451.30 },
  { min: 95001, max: 100000, price: 472.90 },
  { min: 100001, max: 110000, price: 484.80 },
  { min: 110001, max: 120000, price: 507.00 },
  { min: 120001, max: 130000, price: 537.00 },
  { min: 130001, max: 140000, price: 560.00 },
  { min: 140001, max: 150000, price: 624.00 },
]

const MOTO_400: PricingBand[] = [
  { min: 0, max: 5000, price: 77.50 },
  { min: 5001, max: 8000, price: 99.72 },
  { min: 8001, max: 11000, price: 112.88 },
  { min: 11001, max: 14000, price: 132.68 },
  { min: 14001, max: 17000, price: 145.28 },
  { min: 17001, max: 20000, price: 186.84 },
  { min: 20001, max: 25000, price: 212.24 },
  { min: 25001, max: 30000, price: 257.40 },
  { min: 30001, max: 35000, price: 308.72 },
  { min: 35001, max: 40000, price: 363.24 },
  { min: 40001, max: 45000, price: 420.98 },
  { min: 45001, max: 50000, price: 462.74 },
]

const MOTO_1000: PricingBand[] = [
  { min: 0, max: 5000, price: 102.50 },
  { min: 5001, max: 8000, price: 124.82 },
  { min: 8001, max: 11000, price: 137.78 },
  { min: 11001, max: 14000, price: 155.78 },
  { min: 14001, max: 17000, price: 170.18 },
  { min: 17001, max: 20000, price: 211.94 },
  { min: 20001, max: 25000, price: 237.20 },
  { min: 25001, max: 30000, price: 282.90 },
  { min: 30001, max: 35000, price: 333.70 },
  { min: 35001, max: 40000, price: 388.50 },
  { min: 40001, max: 45000, price: 445.90 },
  { min: 45001, max: 50000, price: 487.80 },
]

const ESPECIAL: PricingBand[] = [
  { min: 0, max: 30000, price: 238.50 },
  { min: 30001, max: 40000, price: 309.28 },
  { min: 40001, max: 50000, price: 337.31 },
  { min: 50001, max: 60000, price: 368.05 },
  { min: 60001, max: 70000, price: 394.57 },
  { min: 70001, max: 80000, price: 418.21 },
  { min: 80001, max: 90000, price: 489.90 },
  { min: 90001, max: 100000, price: 549.90 },
  { min: 100001, max: 110000, price: 577.51 },
  { min: 110001, max: 120000, price: 606.75 },
  { min: 120001, max: 130000, price: 642.98 },
  { min: 130001, max: 140000, price: 669.52 },
  { min: 140001, max: 150000, price: 701.40 },
  { min: 150001, max: 160000, price: 877.95 },
  { min: 160001, max: 170000, price: 945.00 },
  { min: 170001, max: 180000, price: 1015.00 },
  { min: 180001, max: 190000, price: 1070.00 },
  { min: 190001, max: 200000, price: 1110.00 },
  { min: 200001, max: 210000, price: 1150.00 },
  { min: 210001, max: 220000, price: 1185.00 },
  { min: 220001, max: 230000, price: 1210.00 },
  { min: 230001, max: 240000, price: 1245.00 },
  { min: 240001, max: 250000, price: 1280.00 },
]

/* ─── Mapa de tabelas ─── */
export const PRICING_TABLES: Record<PlanId, PricingBand[]> = {
  'basico': BASICO,
  'do-seu-jeito': DO_SEU_JEITO,
  'vip': VIP,
  'premium': PREMIUM,
  'suv': SUV,
  'moto-400': MOTO_400,
  'moto-1000': MOTO_1000,
  'especial': ESPECIAL,
}

/* ─── Info dos planos (benefícios REAIS — hierarquia acumulativa) ─── */

export interface PlanFeatureItem {
  text: string
  included: boolean
  /** true = item novo neste plano (diferencial vs plano anterior) */
  highlight?: boolean
  /** Substitui um item do plano anterior (ex: Guincho 200km -> 600km) */
  upgrade?: boolean
}

export interface PlanInfo {
  id: PlanId
  name: string
  description: string
  popular?: boolean
  features: PlanFeatureItem[]
}

export const PLAN_INFO: Record<PlanId, PlanInfo> = {
  'basico': {
    id: 'basico',
    name: 'Básico',
    description: 'Proteção essencial com assistência completa',
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$5.000', included: true },
      { text: 'Monitoramento 24h', included: true },
      { text: 'Reboque 200km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Táxi 25km', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'Clube de Benefícios', included: true },
      { text: 'Fenômenos da Natureza', included: false },
      { text: 'Parabrisa', included: false },
      { text: 'Carro Amigo', included: false },
      { text: 'Carro Reserva', included: false },
      { text: 'AP morte/invalidez', included: false },
    ],
  },
  'do-seu-jeito': {
    id: 'do-seu-jeito',
    name: 'Do Seu Jeito',
    description: 'Básico + fenômenos, parabrisa e mais',
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$10.000', included: true },
      { text: 'Parabrisa', included: true },
      { text: 'Carro Amigo 25km de raio', included: true },
      { text: 'Monitoramento 24h', included: true },
      { text: 'Reboque 400km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Táxi 50km', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'Clube de Benefícios', included: true },
      { text: 'Carro Reserva', included: false },
      { text: 'Todos os Vidros', included: false },
      { text: 'AP morte/invalidez', included: false },
    ],
  },
  'vip': {
    id: 'vip',
    name: 'VIP',
    description: 'O mais escolhido — proteção completa',
    popular: true,
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$50.000', included: true },
      { text: 'Carro Reserva 7 dias (roubo e furto)', included: true },
      { text: 'Parabrisa', included: true },
      { text: 'Carro Amigo 25km de raio', included: true },
      { text: 'Monitoramento 24h (acima R$50.000)', included: true },
      { text: 'Reboque 1.000km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Táxi 100km', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'Clube de Benefícios', included: true },
      { text: 'Reboque Adicional', included: false },
      { text: 'Todos os Vidros', included: false },
      { text: 'AP morte/invalidez', included: false },
    ],
  },
  'premium': {
    id: 'premium',
    name: 'Premium',
    description: 'Máxima proteção — tudo incluído',
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$100.000', included: true },
      { text: 'Carro Reserva 15 dias', included: true },
      { text: 'Parabrisa', included: true },
      { text: 'Carro Amigo', included: true },
      { text: 'Reboque Adicional 200km', included: true },
      { text: 'Todos os Vidros', included: true },
      { text: 'Monitoramento 24h', included: true },
      { text: 'Reboque 1.200km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Táxi 150km', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'AP morte acidental ou invalidez R$10.000', included: true },
      { text: 'Clube de Benefícios', included: true },
    ],
  },
  'suv': {
    id: 'suv',
    name: 'VIP SUV',
    description: 'Para pick-ups, caminhonetes e SUVs',
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$50.000', included: true },
      { text: 'Carro Reserva 7 dias (roubo e furto)', included: true },
      { text: 'Parabrisa', included: true },
      { text: 'Carro Amigo 25km', included: true },
      { text: 'Monitoramento 24h', included: true },
      { text: 'Reboque 1.000km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'AP morte/invalidez R$10.000', included: true },
      { text: 'Clube de Benefícios', included: true },
    ],
  },
  'moto-400': {
    id: 'moto-400',
    name: 'VIP Moto até 400cc',
    description: 'Proteção completa para motos até 400cc',
    features: [
      { text: 'Roubo', included: true },
      { text: 'Furto', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Monitoramento 24h (acima de R$15.000)', included: true },
      { text: 'Reboque 1.000km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'AP morte acidental ou invalidez (R$10.000)', included: true },
      { text: 'Clube de Benefícios', included: true },
    ],
  },
  'moto-1000': {
    id: 'moto-1000',
    name: 'VIP Moto 450-1000cc',
    description: 'Proteção completa para motos de 450 a 1000cc',
    features: [
      { text: 'Roubo', included: true },
      { text: 'Furto', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Monitoramento 24h (acima de R$15.000)', included: true },
      { text: 'Reboque 1.000km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'AP morte acidental ou invalidez (R$10.000)', included: true },
      { text: 'Clube de Benefícios', included: true },
    ],
  },
  'especial': {
    id: 'especial',
    name: 'Veículos Especiais',
    description: 'Elétricos e veículos acima de R$150 mil',
    features: [
      { text: 'Roubo e Furto', included: true },
      { text: 'Incêndio (proveniente de colisão)', included: true },
      { text: 'Fenômenos da Natureza', included: true },
      { text: 'Colisão', included: true },
      { text: 'Danos a Terceiros R$50.000', included: true },
      { text: 'Carro Reserva 7 dias (roubo e furto)', included: true },
      { text: 'Parabrisa', included: true },
      { text: 'Carro Amigo 25km', included: true },
      { text: 'Monitoramento 24h', included: true },
      { text: 'Reboque 1.000km', included: true },
      { text: 'Chaveiro', included: true },
      { text: 'Substituição de pneu furado', included: true },
      { text: 'Auxílio na falta de combustível', included: true },
      { text: 'Hospedagem em hotel', included: true },
      { text: 'Retorno a domicílio', included: true },
      { text: 'Socorro mecânico / elétrico', included: true },
      { text: 'Clube de Benefícios', included: true },
    ],
  },
}

/* ─── Helpers ─── */

/** Busca preco na tabela por faixa FIPE */
export function findPrice(table: PricingBand[], fipeValue: number): number | null {
  // GUARD ABSOLUTO: nunca retorna preço pra FIPE <= 0. Sem isso, fipeValue=0
  // cairia na primeira banda (min: 0) e devolveria preço errado (R$ 126,50
  // do VIP, R$ 106,50 do BÁSICO etc). Veículo não existe de graça.
  if (!Number.isFinite(fipeValue) || fipeValue <= 0) return null
  const band = table.find(b => fipeValue >= b.min && fipeValue <= b.max)
  return band ? band.price : null
}

/** Categorias da API Brasil que indicam SUV/pick-up/caminhonete */
const SUV_KEYWORDS = [
  'caminhonete', 'camioneta', 'suv', 'pick-up', 'pickup',
  'utilitario', 'utilitária',
]

/** Modelos conhecidos que sao SUV/pick-up (fallback quando categoria nao vem da API) */
const SUV_MODELS = [
  'compass', 'renegade', 'commander', 'tracker', 'equinox', 'trailblazer',
  'creta', 'tucson', 'ix35', 'santa fe', 'sportage', 'sorento', 'seltos',
  'kicks', 'frontier', 'duster', 'captur', 'oroch', 'kardian',
  'tiggo', 'tiguan', 'taos', 'tcross', 't-cross', 'nivus',
  'ecosport', 'territory', 'bronco', 'maverick', 'ranger',
  'hilux', 'sw4', 'corolla cross', 'rav4',
  'toro', 'strada', 'saveiro', 'montana', 's10', 'amarok',
  'pajero', 'outlander', 'eclipse cross', 'l200',
  'hr-v', 'hrv', 'wr-v', 'wrv', 'cr-v', 'crv', 'zr-v',
  'xc40', 'xc60', 'xc90', 'q3', 'q5', 'q7', 'q8',
  'x1', 'x3', 'x5', 'x6', 'x7', 'glc', 'gle', 'gls',
  'cayenne', 'macan', 'urus',
]

/** Detecta se o combustivel indica veiculo eletrico */
const ELETRICO_KEYWORDS = ['eletrico', 'elétrico', 'electric', 'híbrido', 'hibrido']

export interface QuotePlan {
  id: PlanId
  name: string
  monthly: number
  popular?: boolean
}

/**
 * Retorna os planos aplicaveis e seus precos para um veiculo.
 *
 * @param fipeValue - valor FIPE do veiculo em reais
 * @param categoria - categoria retornada pela API (ex: "AUTOMOVEL", "CAMINHONETE", "MOTOCICLETA")
 * @param combustivel - tipo de combustivel (ex: "GASOLINA", "ELETRICO")
 * @param cilindrada - cilindrada em cc (para motos)
 * @param modelo - nome do modelo (fallback para detectar SUV quando categoria nao vem)
 */
export function getApplicablePlans(
  fipeValue: number,
  categoria?: string,
  combustivel?: string,
  cilindrada?: number,
  modelo?: string,
): QuotePlan[] {
  const cat = (categoria || '').toLowerCase()
  const fuel = (combustivel || '').toLowerCase()
  const mod = (modelo || '').toLowerCase()
  const isMoto = cat.includes('moto') || cat.includes('ciclomotor') || cat.includes('triciclo')
  const isSuvByCat = SUV_KEYWORDS.some(k => cat.includes(k))
  const isSuvByModel = SUV_MODELS.some(k => mod.includes(k))
  const isSuv = isSuvByCat || isSuvByModel
  const isEletrico = ELETRICO_KEYWORDS.some(k => fuel.includes(k))

  // Veiculo especial: eletrico ou FIPE > 150.000
  if (isEletrico || fipeValue > 150000) {
    const price = findPrice(ESPECIAL, fipeValue)
    if (price) {
      return [{ id: 'especial', name: 'Veículos Especiais', monthly: price }]
    }
    return []
  }

  // Moto
  if (isMoto) {
    // Tenta usar a cilindrada da API, ou extrai do nome do modelo (ex: "XRE 190" -> 190)
    let cc = cilindrada || 0
    if (cc === 0 && mod) {
      const matches = mod.match(/\b(\d{2,4})\b/g)
      if (matches) {
        for (const match of matches) {
          const num = parseInt(match, 10)
          if (num > 1900 && num < 2100) continue // ignora anos
          if (num >= 50 && num <= 2500) {
            cc = num
            break
          }
        }
      }
      // Casos especiais Yamaha MT
      if (cc === 0) {
        if (mod.includes('mt-03') || mod.includes('mt 03')) cc = 321
        else if (mod.includes('mt-07') || mod.includes('mt 07')) cc = 689
        else if (mod.includes('mt-09') || mod.includes('mt 09')) cc = 890
      }
    }

    if (cc > 0 && cc <= 449) {
      const price = findPrice(MOTO_400, fipeValue)
      if (price) return [{ id: 'moto-400', name: 'VIP Moto até 400cc', monthly: price }]
    } else if (cc >= 450 && cc <= 1000) {
      const price = findPrice(MOTO_1000, fipeValue)
      if (price) return [{ id: 'moto-1000', name: 'VIP Moto 450-1000cc', monthly: price }]
    }

    // Se cilindrada desconhecida, mostra ambos
    const plans: QuotePlan[] = []
    const p400 = findPrice(MOTO_400, fipeValue)
    if (p400) plans.push({ id: 'moto-400', name: 'VIP Moto até 400cc', monthly: p400 })
    const p1000 = findPrice(MOTO_1000, fipeValue)
    if (p1000) plans.push({ id: 'moto-1000', name: 'VIP Moto 450-1000cc', monthly: p1000 })
    return plans
  }

  // SUV / Pick-up / Caminhonete
  if (isSuv) {
    const price = findPrice(SUV, fipeValue)
    if (price) return [{ id: 'suv', name: 'SUV', monthly: price }]
    return []
  }

  // Carro normal: 4 planos
  const plans: QuotePlan[] = []
  const pBasico = findPrice(BASICO, fipeValue)
  if (pBasico) plans.push({ id: 'basico', name: 'Básico', monthly: pBasico })
  const pJeito = findPrice(DO_SEU_JEITO, fipeValue)
  if (pJeito) plans.push({ id: 'do-seu-jeito', name: 'Do Seu Jeito', monthly: pJeito })
  const pVip = findPrice(VIP, fipeValue)
  if (pVip) plans.push({ id: 'vip', name: 'VIP', monthly: pVip, popular: true })
  const pPremium = findPrice(PREMIUM, fipeValue)
  if (pPremium) plans.push({ id: 'premium', name: 'Premium', monthly: pPremium })
  return plans
}

/** Formata preco para exibicao: "106,50" */
export function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Ativação (taxa de adesão) e parcelamento — REGRA OFICIAL 21Go
 * ───────────────────────────────────────────────────────────────────────────── */

/** Ativação fixa pra qualquer modelo da marca BYD. */
export const BYD_ACTIVATION = 1550

/** Acréscimo da ativação sobre a mensalidade CHEIA do plano de referência. */
export const ACTIVATION_SURCHARGE = 50

/** Piso da ativação: nunca cobra menos que isto (ex: regular 120 + 50 = 170 → 249). */
export const ACTIVATION_FLOOR = 249

/**
 * Acréscimo dos JUROS do parcelamento em 12x no cartão (22,11%). O 21Go NUNCA
 * parcela sem juros — o custo do cartão vai pro cliente. Aplicado só no 12x.
 */
export const MP_INSTALLMENT_12X_SURCHARGE = 0.2211

/**
 * Valor da ativação à vista (pagamento único). É o valor CHEIO: VIP cheio + R$ 50.
 * À vista não é parcelamento, então não leva juros. (REGRA OFICIAL 21Go.)
 */
export function activationCashPrice(net: number): number {
  if (!Number.isFinite(net) || net <= 0) return 0
  return net
}

/**
 * Taxa de ativação (REGRA OFICIAL 21Go — decisão user 2026-06-16):
 *   - BYD → R$ 1.550 fixo (qualquer modelo)
 *   - demais → mensalidade CHEIA do plano de referência + R$ 50, com PISO de R$ 249
 *     (ex: 500 → 550; regular 120 → 170, mas piso eleva pra 249)
 *
 * SEM gross-up. A base é o VIP de referência do veículo (ou o plano de moto, pra
 * motos), não o plano que o cliente clicou. Carro e moto seguem a mesma regra.
 */
export function calcActivation(vipReferenceMonthly: number, isBYD: boolean): number {
  if (isBYD) return BYD_ACTIVATION
  if (!Number.isFinite(vipReferenceMonthly) || vipReferenceMonthly <= 0) return 0
  return Math.max(vipReferenceMonthly + ACTIVATION_SURCHARGE, ACTIVATION_FLOOR)
}

/**
 * Ativação parcelada em 12x no cartão COM juros (o 21Go nunca parcela sem juros).
 * Valor cheio + acréscimo de 22,11% do parcelamento, dividido em 12.
 * Ex: ativação 550 → 12x de R$ 55,97 (total R$ 671,61).
 */
export function activationInstallment12x(net: number): number {
  if (!Number.isFinite(net) || net <= 0) return 0
  return (net * (1 + MP_INSTALLMENT_12X_SURCHARGE)) / 12
}

/* ─── getAllRelevantPlans / QuotePlanFull / planIdFromName ───
 * Espelho do CRM pra usar no PDF.
 */

export interface QuotePlanFull extends QuotePlan {
  applicable: boolean
  categoryLabel: string
}

export function getAllRelevantPlans(
  fipeValue: number,
  categoria?: string,
  combustivel?: string,
  cilindrada?: number,
  modelo?: string,
): QuotePlanFull[] {
  const cat = (categoria || '').toLowerCase()
  const fuel = (combustivel || '').toLowerCase()
  const mod = (modelo || '').toLowerCase()
  const isMoto = cat.includes('moto') || cat.includes('ciclomotor') || cat.includes('triciclo')
  const isSuvByCat = SUV_KEYWORDS.some((k) => cat.includes(k))
  const isSuvByModel = SUV_MODELS.some((k) => mod.includes(k))
  const isSuv = isSuvByCat || isSuvByModel
  const isEletrico = ELETRICO_KEYWORDS.some((k) => fuel.includes(k))
  const isEspecial = isEletrico || fipeValue > 150000

  const cc = cilindrada || 0

  const applicableIds = new Set<PlanId>()
  if (isEspecial) {
    applicableIds.add('especial')
  } else if (isMoto) {
    if (cc > 0 && cc <= 400) applicableIds.add('moto-400')
    else if (cc >= 450 && cc <= 1000) applicableIds.add('moto-1000')
    else {
      applicableIds.add('moto-400')
      applicableIds.add('moto-1000')
    }
  } else if (isSuv) {
    applicableIds.add('suv')
  } else {
    applicableIds.add('basico')
    applicableIds.add('do-seu-jeito')
    applicableIds.add('vip')
    applicableIds.add('premium')
  }

  const allPlans: { id: PlanId; name: string; categoryLabel: string; popular?: boolean }[] = isMoto
    ? cc > 0 && cc <= 400
      ? [{ id: 'moto-400', name: 'VIP Moto até 400cc', categoryLabel: 'Moto' }]
      : cc >= 450 && cc <= 1000
        ? [{ id: 'moto-1000', name: 'VIP Moto 450-1000cc', categoryLabel: 'Moto' }]
        : [
            { id: 'moto-400', name: 'VIP Moto até 400cc', categoryLabel: 'Moto' },
            { id: 'moto-1000', name: 'VIP Moto 450-1000cc', categoryLabel: 'Moto', popular: true },
          ]
    : isEspecial
      ? [{ id: 'especial', name: 'Veículos Especiais', categoryLabel: 'Especial' }]
      : isSuv
        ? [{ id: 'suv', name: 'SUV / Caminhonete', categoryLabel: 'SUV', popular: true }]
        : [
            { id: 'basico', name: 'Básico', categoryLabel: 'Carro' },
            { id: 'do-seu-jeito', name: 'Do Seu Jeito', categoryLabel: 'Carro' },
            { id: 'vip', name: 'VIP', categoryLabel: 'Carro', popular: true },
            { id: 'premium', name: 'Premium', categoryLabel: 'Carro' },
          ]

  const result: QuotePlanFull[] = []
  for (const p of allPlans) {
    const price = findPrice(PRICING_TABLES[p.id], fipeValue)
    if (price) {
      result.push({
        id: p.id,
        name: p.name,
        monthly: price,
        popular: p.popular,
        applicable: applicableIds.has(p.id),
        categoryLabel: p.categoryLabel,
      })
    }
  }
  return result
}

export function planIdFromName(name: string): PlanId {
  const n = (name || '').toLowerCase()
  if (n.includes('especial')) return 'especial'
  if (n.includes('suv')) return 'suv'
  if (n.includes('moto') && n.includes('400')) return 'moto-400'
  if (n.includes('moto')) return 'moto-1000'
  if (n.includes('premium')) return 'premium'
  if (n.includes('vip')) return 'vip'
  if (n.includes('jeito')) return 'do-seu-jeito'
  return 'basico'
}
