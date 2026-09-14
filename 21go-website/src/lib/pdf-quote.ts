import puppeteer from 'puppeteer-core'
import {
  PLAN_INFO,
  planIdFromName,
  getAllRelevantPlans,
  findPrice,
  isLeilaoOrigin,
  PRICING_TABLES,
  calcActivation,
  activationCashPrice,
  activationInstallment12x,
  type QuotePlanFull,
  type PlanId,
} from '@/data/pricing'
import {
  planosDaTelaParaPdf,
  planoEscolhidoNaLista,
  type PlanoDaTela,
} from './planos-do-pdf.regras'
import { LOGO_21GO_BASE64 } from './assets/logo-base64'
import { temParcelamento } from './consultores-parcelamento'
import { ativacaoDoConsultor } from './consultores-ativacao'

export interface QuotePdfInput {
  /**
   * Slug do consultor dono da venda. Sem ele o botao de WhatsApp do PDF aponta
   * pro rodizio da casa — e o PDF vai NA MAO do cliente do consultor, entao
   * seria entregar o lead dele pra 21Go depois da cotacao ja feita.
   */
  consultorSlug?: string | null
  /** Consultor que prefere tratar a ativacao na conversa (ver ocultarAtivacao). */
  ocultarAtivacao?: boolean
  nome: string
  whatsapp: string
  email?: string | null
  placa?: string | null
  marca: string
  modelo: string
  ano: string | number
  cor?: string | null
  fipe: number
  planoNome: string
  mensalidade: number
  taxaAtivacao?: number
  isMoto?: boolean
  /** Categoria da API Brasil (ex: "AUTOMOVEL", "MOTOCICLETA"). Opcional. */
  categoria?: string | null
  /** Combustível (ex: "GASOLINA", "ELETRICO"). Opcional. */
  combustivel?: string | null
  /** Cilindrada da moto em cc. Opcional. */
  cilindrada?: number | null
  /** Carro de aplicativo (Uber, 99, etc.) — adiciona +R$ 20/mês em todos os planos. */
  carroApp?: boolean | null
  /**
   * Origem do veículo: "nao" | "leilao" | "remarcado". Quando leilão/remarcado a
   * mensalidade cai UMA FAIXA na tabela e a indenização cobre 80% da FIPE.
   */
  leilao?: string | null
  /** Moto com cobertura opcional de Danos a Terceiros — adiciona +R$ 22/mês (só motos). */
  motoTerceiros?: boolean | null
  /** Seguro/proteção atual do veículo (texto livre — ex: "Porto Seguro", "Allianz"). */
  seguroAtual?: string | null
  /**
   * Os planos que o cliente VIU na tela — os do PowerCRM, com o preço dele e o leilão já
   * descontado pelo servidor. É esta lista que o PDF imprime.
   *
   * Ausente só em lead gravado antes de 04/09/2026, quando esta informação não era guardada;
   * aí o PDF cai na tabela local, que é o comportamento que produzia a divergência.
   */
  planos?: PlanoDaTela[] | null
}

/** Carro de app: +R$ 20/mes em todos os planos exibidos. */
const CARRO_APP_EXTRA = 20

/** Moto: Danos a Terceiros opcional, +R$ 22/mes (so planos de moto). */
const MOTO_TERCEIROS_EXTRA = 22

/* ─────────────────────────────────────────────────────────────────────────
 * MATRIZ DE COBERTURAS — formato oficial do PowerCRM 21Go
 * Cada cell é null (✕ vermelho, não incluso) ou string (✓ + detalhe; '' = só ✓).
 * As linhas saem separadas em dois blocos (`grupo`): o que a 21Go PAGA e o que você ACIONA.
 * ───────────────────────────────────────────────────────────────────────── */

interface CoverageRow {
  label: string
  /**
   * Explicacao curta embaixo do rotulo. O print do PowerCRM so tem o nome da cobertura, e
   * "Carro amigo" / "Socorro mecanico" nao dizem nada pra quem nunca contratou protecao.
   * Cada frase aqui sai do gabarito ditado pelo dono (10-12/09/2026) — o que nao esta la
   * fica SEM hint, nunca com texto inventado.
   */
  hint?: string
  /** Separa a tabela em dois blocos: o que a 21Go paga x o que voce aciona na hora do aperto. */
  grupo: 'cobertura' | 'assistencia'
  /** ordem dos planos = ['basico','do-seu-jeito','vip','premium'] OU plano unico */
  carros?: [string | null, string | null, string | null, string | null]
  suv?: string | null
  moto?: string | null
  especial?: string | null
}

const COVERAGE_TABLE: CoverageRow[] = [
  { label: 'Roubo', grupo: 'cobertura',
    hint: 'Indenização de 100% da tabela FIPE',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Furto', grupo: 'cobertura',
    hint: 'Indenização de 100% da tabela FIPE',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Incêndio', grupo: 'cobertura',
    carros: ['Proveniente de colisão', 'Proveniente de colisão', 'Proveniente de colisão', 'Proveniente de colisão'],
    suv: 'Proveniente de colisão', moto: null, especial: 'Proveniente de colisão' },

  { label: 'Fenômenos da natureza', grupo: 'cobertura',
    hint: 'Alagamento, enchente e outros eventos da natureza',
    carros: [null, '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Colisão', grupo: 'cobertura',
    hint: 'Conserto do veículo com peças originais',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Danos a terceiros', grupo: 'cobertura',
    hint: 'Prejuízo causado a outro veículo ou pessoa',
    carros: ['R$ 5.000,00', 'R$ 10.000,00', 'R$ 50.000,00', 'R$ 100.000,00'],
    suv: 'R$ 50.000,00', moto: null, especial: 'R$ 50.000,00' },

  { label: 'Para-brisa', grupo: 'cobertura',
    hint: 'A 21Go cobre 70% do valor do para-brisa',
    carros: ['70% do valor', '70% do valor', '70% do valor', '70% do valor'],
    suv: '70% do valor', moto: null, especial: '70% do valor' },

  { label: 'Cobertura Todos os Vidros', grupo: 'cobertura',
    hint: 'Demais vidros, espelhos e lentes dos faróis',
    carros: [null, null, null, ''], suv: null, moto: null, especial: null },

  { label: 'Monitoramento 24h', grupo: 'cobertura',
    hint: 'Rastreador já incluso na mensalidade',
    carros: ['Valor acima de R$ 50.000', 'Valor acima de R$ 50.000', 'Valor acima de R$ 50.000', 'Valor acima de R$ 50.000'],
    suv: 'Valor acima de R$ 50.000', moto: 'Acima de R$ 15.000', especial: 'Valor acima de R$ 50.000' },

  { label: 'Carro reserva', grupo: 'assistencia',
    carros: [null, null, '07 dias (roubo e furto)', '15 dias'],
    suv: '07 dias (roubo e furto)', moto: null, especial: '07 dias (roubo e furto)' },

  { label: 'Carro amigo', grupo: 'assistencia',
    hint: 'Motorista até você quando não tiver condições de dirigir',
    carros: [null, '25 km de raio', '25 km de raio', ''],
    suv: '25 km de raio', moto: null, especial: '25 km de raio' },

  { label: 'Reboque', grupo: 'assistencia',
    hint: 'Quilometragem total, somando ida e volta',
    carros: ['200 km (totais)', '400 km (totais)', '1.000 km (500 + 500)', '1.400 km (700 + 700)'],
    suv: '1.000 km (500 + 500)', moto: '1.000 km (500 + 500)', especial: '1.000 km (500 + 500)' },

  { label: 'Chaveiro', grupo: 'assistencia',
    hint: 'A 21Go paga o serviço; a peça fica por sua conta',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Substituição de pneu furado', grupo: 'assistencia',
    hint: 'Leva ao borracheiro mais próximo, em até 20 km',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Auxílio na falta de combustível', grupo: 'assistencia',
    hint: 'Leva o veículo até o posto mais próximo, em até 20 km',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Hospedagem em hotel', grupo: 'assistencia',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Táxi', grupo: 'assistencia',
    carros: ['25 km', '50 km', '100 km', '150 km'],
    suv: '100 km', moto: null, especial: '100 km' },

  { label: 'Retorno a domicílio', grupo: 'assistencia',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Socorro mecânico / elétrico', grupo: 'assistencia',
    hint: 'Socorro na hora da pane — o conserto não entra',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },

  { label: 'Clube de Benefícios', grupo: 'assistencia',
    carros: ['', '', '', ''], suv: '', moto: '', especial: '' },
]

/* ─────────────────────────────────────────────────────────────────────────
 * Logo — embutida em base64 no bundle (sem I/O em runtime)
 * ───────────────────────────────────────────────────────────────────────── */

const LOGO_DATA_URL = `data:image/png;base64,${LOGO_21GO_BASE64}`
function getLogoDataUrl(): string {
  return LOGO_DATA_URL
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function addDaysBR(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('pt-BR')
}

/**
 * Identifica o PlanId do veículo cruzando (mensalidade × FIPE) com PRICING_TABLES.
 * Esta é a defesa mais forte: o valor que o cliente viu no site SÓ pode ter
 * vindo de uma faixa de uma tabela. Se bater, esse é o plano correto —
 * independente do que está em planoNome / categoria / combustivel.
 *
 * Retorna null se nenhum match exato for encontrado.
 *
 * `isLeilao` precisa ser o mesmo do lead: em leilão/remarcado a mensalidade que
 * o cliente viu veio da faixa ANTERIOR, então o cruzamento tem que usar a mesma
 * regra — senão nenhum plano bate e o PDF cai no fallback pelo nome.
 */
export function detectPlanByValue(
  fipe: number,
  mensalidade: number,
  isLeilao = false,
): PlanId | null {
  const ids: PlanId[] = ['especial', 'premium', 'vip', 'suv', 'do-seu-jeito', 'basico', 'moto-1000', 'moto-400']
  // Tolerância de 1 centavo p/ evitar problema de float
  const matches: PlanId[] = []
  for (const id of ids) {
    const price = findPrice(PRICING_TABLES[id], fipe, isLeilao)
    if (price !== null && Math.abs(price - mensalidade) < 0.01) {
      matches.push(id)
    }
  }
  if (matches.length === 0) return null
  // Se houver ambiguidade (raro), prioriza o mais específico
  const priority: PlanId[] = ['especial', 'suv', 'moto-1000', 'moto-400', 'premium', 'vip', 'do-seu-jeito', 'basico']
  for (const p of priority) {
    if (matches.includes(p)) return p
  }
  return matches[0]
}

/**
 * Resolve quais planos mostrar no PDF baseado no veículo.
 *
 * Estratégia em camadas (do mais confiável para o menos):
 *  1. **Match por valor (mensalidade × FIPE × PRICING_TABLES)** — fonte de verdade
 *     mais robusta: o valor que o cliente viu no site só pôde vir de uma faixa
 *     de uma tabela. Se bater, sabemos exatamente o plano e categoria.
 *  2. Categoria/combustível/cilindrada vindas do input (Brasil API).
 *  3. Inferência pelo nome do plano selecionado (planoNome).
 *
 * Exportada pra ser testável sem rodar Puppeteer.
 */
export function resolvePlans(input: QuotePdfInput): QuotePlanFull[] {
  // Leilão/remarcado: a mensalidade cai UMA FAIXA na tabela (regra oficial 21Go,
  // decisão user 2026-07-29). Resolvido dentro de findPrice — não é mais um
  // percentual aplicado por fora. Reflete em planos, referência e ativação.
  const isLeilao = isLeilaoOrigin(input.leilao)

  // Caminho normal: imprime os planos que o cliente viu, que são os do PowerCRM. Nada é
  // recalculado aqui — o desconto de leilão já veio aplicado do servidor, no preço dele.
  const doPower = planosDaTelaParaPdf(input.planos)
  if (doPower) return aplicarExtras(doPower, input)

  // 1) Defesa primária: identificar plano pelo valor exato
  const detected = detectPlanByValue(input.fipe, input.mensalidade, isLeilao)

  // 2) Inferência por nome (fallback)
  const fromName = planIdFromName(input.planoNome) as PlanId
  const planId: PlanId = detected || fromName

  let categoria = input.categoria || ''
  let cilindrada = input.cilindrada || 0
  let combustivel = input.combustivel || ''

  if (!categoria) {
    if (planId === 'moto-400' || planId === 'moto-1000') categoria = 'MOTOCICLETA'
    else if (planId === 'suv') categoria = 'CAMINHONETE'
    else categoria = 'AUTOMOVEL'
  }
  if (!cilindrada && planId === 'moto-400') cilindrada = 300
  if (!cilindrada && planId === 'moto-1000') cilindrada = 800

  // Se o plano detectado é "especial" e a FIPE não passa de 150k,
  // o motivo só pode ser veículo elétrico — força a flag pra que
  // getAllRelevantPlans devolva exatamente a tabela ESPECIAL (mesmos
  // valores do site). Esta é a defesa contra o bug do BYD Dolphin Mini.
  if (planId === 'especial' && input.fipe <= 150000) {
    combustivel = 'ELETRICO'
  }

  const plansRaw = getAllRelevantPlans(
    input.fipe,
    categoria,
    combustivel || undefined,
    cilindrada,
    input.modelo,
    isLeilao,
  )

  // Se nada bateu (pricing band não cobre), devolve pelo menos o plano selecionado
  const plans = plansRaw.length === 0
    ? [{
        id: planId,
        name: input.planoNome,
        monthly: input.mensalidade,
        applicable: true,
        categoryLabel: '',
      }]
    : plansRaw

  return aplicarExtras(plans, input)
}

/**
 * Adicionais que o cliente marcou na tela e que NÃO vêm do Power: ele não sabe de danos a
 * terceiros de moto nem de carro de aplicativo. Mesma ordem e mesmos valores do site
 * (`cotacao/page.tsx`) — se divergir aqui, o PDF volta a não bater com a tela.
 */
function aplicarExtras(plans: QuotePlanFull[], input: QuotePdfInput): QuotePlanFull[] {
  let out = plans

  // Moto com Danos a Terceiros opcional: soma +R$ 22/mês SÓ nos planos de moto.
  if (input.motoTerceiros) {
    out = out.map((p) =>
      p.id === 'moto-400' || p.id === 'moto-1000'
        ? { ...p, monthly: Math.round((p.monthly + MOTO_TERCEIROS_EXTRA) * 100) / 100 }
        : p,
    )
  }

  // Se for carro de aplicativo, soma +R$ 20/mês em TODOS os planos exibidos.
  if (input.carroApp) {
    return out.map((p) => ({ ...p, monthly: p.monthly + CARRO_APP_EXTRA }))
  }
  return out
}

/**
 * Renderiza UMA página completa (estilo imagem de referência):
 * título + veículo + card de benefícios + card de preço com breakdown
 * (1º pagamento, 2º pagamento com 5%, mensalidade regular, adesivo).
 * Cada plano aplicável vira uma página dessas — não há mais card comparativo simplificado.
 */
function renderComparisonPage(
  input: QuotePdfInput,
  plans: QuotePlanFull[],
  ctx: {
    logoUrl: string
    hoje: string
    validade: string
    dueDate: string
    veiculoTitulo: string
    taxa: number
    referencePlan?: QuotePlanFull
    refIsCarro: boolean
    selectedPlanId: PlanId
    kind: 'carros' | 'suv' | 'moto' | 'especial'
  },
): string {
  // REGRA OFICIAL 21Go (ver calcActivation em pricing.ts): mensalidade CHEIA do
  // plano de referencia + R$ 50 (carro e moto), piso R$ 249, BYD R$ 1.550 fixo.
  // A vista = valor cheio. O 12x saiu de todos os sites em 25/08/2026 e so
  // sobrevive nos consultores de `temParcelamento` (hoje: a Renata) — este PDF e
  // o material que o cliente DELA abre, entao acompanha o que ela mostra na tela.
  const taxa = ctx.taxa
  const taxaAvista = activationCashPrice(taxa)
  const mostraParcelamento = temParcelamento(input.consultorSlug)
  const taxa12xParcela = activationInstallment12x(taxa)

  const firstName = input.nome.split(' ')[0]

  // Bloco de informacoes do cliente: Uber/99, leilao/remarcado, seguro atual.
  // So texto (sem valor) — ajuda a consultora a confirmar dados quando ler o PDF.
  const infoChips: string[] = []
  if (input.carroApp) infoChips.push('Carro de aplicativo (Uber, 99, etc.)')
  if (input.leilao === 'leilao') infoChips.push('Veiculo de leilao')
  if (input.leilao === 'remarcado') infoChips.push('Veiculo remarcado')
  if (input.motoTerceiros && ctx.kind === 'moto') infoChips.push('Danos a Terceiros (+R$ 22/mes)')
  if (input.seguroAtual && input.seguroAtual.trim()) {
    infoChips.push(`Ja possui protecao: ${input.seguroAtual.trim()}`)
  }
  const infoBlock = infoChips.length > 0
    ? `<section class="cust-info">
      <span class="cust-info-label">Informacoes do cliente</span>
      <div class="cust-info-chips">
        ${infoChips.map((c) => `<span class="cust-info-chip">${c}</span>`).join('')}
      </div>
    </section>`
    : ''

  // Plano REF (VIP de carros, ou o primeiro disponível pra outros tipos)
  const ref = ctx.referencePlan
  const refIsCarro = ctx.refIsCarro
  // Regra oficial 21Go pro desconto adesivo:
  //   VIP/Premium/SUV/Especial: até 30k FIPE = 10% | acima = 15%
  //   Do Seu Jeito/Básico:      até 60k FIPE = 10% | acima = 15%
  // Combinacao "Adesivo + em dia": ADITIVO (5% + adesivo%). Ex: 5+15 = 20%.
  // Antes era multiplicativo (0.95 * 0.85 = 19%) — corrigido a pedido.
  const refIsVipOrPremium =
    !!ref && ['vip', 'premium', 'suv', 'especial'].includes(ref.id)
  const refStickerThreshold = refIsVipOrPremium ? 30000 : 60000
  const refStickerPct = input.fipe > refStickerThreshold ? 15 : 10
  const refStickerMultiplier = 1 - refStickerPct / 100
  const refStickerPlusEarlyPct = refStickerPct + 5
  const refStickerPlusEarlyMultiplier = 1 - refStickerPlusEarlyPct / 100
  const refBlock = ref
    ? refIsCarro
      ? `<div class="ref-bar">
      <div class="ref-bar-header">
        <div class="ref-bar-title">
          <span class="ref-bar-eyebrow">Plano de referência</span>
          <span class="ref-bar-name">${ref.name}</span>
        </div>
      </div>
      <div class="ref-bar-grid">
        <div class="ref-disc">
          <span class="ref-disc-label">Mensalidade cheia</span>
          <span class="ref-disc-tag">sem desconto</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly)}</div>
        </div>
        <div class="ref-disc">
          <span class="ref-disc-label">Pagando em dia</span>
          <span class="ref-disc-tag">−5%</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly * 0.95)}</div>
        </div>
        <div class="ref-disc">
          <span class="ref-disc-label">Com adesivo 21Go</span>
          <span class="ref-disc-tag">−${refStickerPct}%</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly * refStickerMultiplier)}</div>
        </div>
        <div class="ref-disc highlight">
          <span class="ref-disc-label">Adesivo + em dia</span>
          <span class="ref-disc-tag">−${refStickerPlusEarlyPct}% total</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly * refStickerPlusEarlyMultiplier)}</div>
        </div>
      </div>
    </div>`
      : `<div class="ref-bar">
      <div class="ref-bar-header">
        <div class="ref-bar-title">
          <span class="ref-bar-eyebrow">Plano de referência</span>
          <span class="ref-bar-name">${ref.name}</span>
        </div>
      </div>
      <div class="ref-bar-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="ref-disc">
          <span class="ref-disc-label">Mensalidade cheia</span>
          <span class="ref-disc-tag">sem desconto</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly)}</div>
        </div>
        <div class="ref-disc highlight">
          <span class="ref-disc-label">Pagando em dia</span>
          <span class="ref-disc-tag">−5%</span>
          <div class="ref-disc-val">R$ ${formatBRL(ref.monthly * 0.95)}</div>
        </div>
      </div>
    </div>`
    : ''

  // ───── COLUNAS DA TABELA ─────
  // Mapeia cada plano que vai virar uma coluna
  const carPlanIds: PlanId[] = ['basico', 'do-seu-jeito', 'vip', 'premium']
  const planById = new Map(plans.map((p) => [p.id, p]))
  const cols: { plan: QuotePlanFull; matrixIdx: number; kind: 'carros' | 'suv' | 'moto' | 'especial' }[] = []
  if (ctx.kind === 'carros') {
    carPlanIds.forEach((id, idx) => {
      const p = planById.get(id)
      if (p) cols.push({ plan: p, matrixIdx: idx, kind: 'carros' })
    })
  } else if (ctx.kind === 'suv') {
    const p = planById.get('suv')
    if (p) cols.push({ plan: p, matrixIdx: 0, kind: 'suv' })
  } else if (ctx.kind === 'moto') {
    plans
      .filter((p) => p.id === 'moto-400' || p.id === 'moto-1000')
      .forEach((p) => cols.push({ plan: p, matrixIdx: 0, kind: 'moto' }))
  } else if (ctx.kind === 'especial') {
    const p = planById.get('especial')
    if (p) cols.push({ plan: p, matrixIdx: 0, kind: 'especial' })
  }

  function getCell(row: CoverageRow, col: typeof cols[0]): string | null {
    if (col.kind === 'carros' && row.carros) return row.carros[col.matrixIdx]
    if (col.kind === 'suv') return row.suv ?? null
    if (col.kind === 'moto') return row.moto ?? null
    if (col.kind === 'especial') return row.especial ?? null
    return null
  }

  // Moto com Danos a Terceiros opcional (+R$ 22): habilita a linha pra coluna moto.
  const motoTerceirosOn = ctx.kind === 'moto' && !!input.motoTerceiros
  const coverageRows = motoTerceirosOn
    ? COVERAGE_TABLE.map((row) =>
        row.label === 'Danos a terceiros' ? { ...row, moto: '' } : row,
      )
    : COVERAGE_TABLE

  // Filtra coberturas: só mostra linhas que pelo menos UMA coluna inclui
  const visibleRows = coverageRows.filter((row) =>
    cols.some((col) => getCell(row, col) !== null),
  )

  const colsHTML = cols
    .map((col) => {
      const isSelected = col.plan.id === ctx.selectedPlanId
      const flagHTML = isSelected
        ? '<span class="plan-flag selected">Selecionado</span>'
        : col.plan.popular
          ? '<span class="plan-flag pop">Mais escolhido</span>'
          : '<span class="plan-flag">Disponível</span>'
      return `<th class="plan-col ${isSelected ? 'selected' : ''}">
      ${flagHTML}
      <div class="plan-name">${col.plan.name}</div>
      <div class="plan-price">R$ ${formatBRL(col.plan.monthly)}<em> /mês</em></div>
    </th>`
    })
    .join('')

  function rowsHTML(rows: CoverageRow[]): string {
    return rows
      .map((row) => {
        const cellsHTML = cols
          .map((col) => {
            const v = getCell(row, col)
            // O × cinza-claro de antes sumia na folha impressa e o cliente lia a linha
            // inteira como incluída. Vermelho cheio + a palavra embaixo (21Go, 14/09/2026).
            if (v === null) {
              return `<td class="cell no"><span class="cell-icon no">✕</span><span class="cell-detail no">não incluso</span></td>`
            }
            if (v === '') {
              return `<td class="cell yes"><span class="cell-icon ok">✓</span></td>`
            }
            return `<td class="cell yes"><span class="cell-icon ok">✓</span><span class="cell-detail">${v}</span></td>`
          })
          .join('')
        const labelHTML = row.hint
          ? `<span class="row-label-name">${row.label}</span><span class="row-label-hint">${row.hint}</span>`
          : `<span class="row-label-name">${row.label}</span>`
        return `<tr><th class="row-label">${labelHTML}</th>${cellsHTML}</tr>`
      })
      .join('')
  }

  /** Uma tabela fechada (cabeçalho dos planos + linhas), pra repetir o cabeçalho na 2ª página. */
  function tabelaHTML(eyebrow: string, titulo: string, rows: CoverageRow[]): string {
    if (rows.length === 0) return ''
    return `<section class="comparison">
      <table class="cmp-table${duasPaginas ? '' : ' densa'}">
        <thead>
          <tr>
            <th class="cmp-corner">
              <span class="cmp-corner-eyebrow">${eyebrow}</span>
              <span class="cmp-corner-title">${titulo}</span>
            </th>
            ${colsHTML}
          </tr>
        </thead>
        <tbody>
          ${rowsHTML(rows)}
        </tbody>
      </table>
    </section>`
  }

  const legendaHTML = `<div class="legenda">
    <span class="legenda-item"><span class="cell-icon ok">✓</span> incluído no plano</span>
    <span class="legenda-item"><span class="cell-icon no">✕</span> não incluso nesse plano</span>
    <span class="legenda-nota">Valores e coberturas conforme o regulamento da 21Go.</span>
  </div>`

  const linhasCobertura = visibleRows.filter((r) => r.grupo === 'cobertura')
  const linhasAssistencia = visibleRows.filter((r) => r.grupo === 'assistencia')

  /**
   * Duas paginas so quando a tabela e longa (os 4 planos de carro, SUV, especiais: 19-20 linhas).
   * Moto tem 13 — partida em duas, a primeira pagina ficava com 5 linhas de meio palmo de altura
   * cada, porque a tabela estica pra preencher a folha.
   */
  const duasPaginas = visibleRows.length > 14

  // O PDF vai na mao do cliente e sobrevive a conversa: o botao dele precisa
  // levar de volta pra quem fez a venda, nao pro rodizio da casa.
  const linkWhatsApp = input.consultorSlug
    ? `https://21go.site/api/wa?c=${input.consultorSlug}`
    : 'https://21go.site/api/wa'

  return `
  <div class="page">

    <header class="hero">
      <div class="brand">
        ${
          ctx.logoUrl
            ? `<img src="${ctx.logoUrl}" class="brand-logo" alt="21Go"/>`
            : `<span class="brand-text">21Go</span>`
        }
      </div>
      <a class="wpp-btn" href="${linkWhatsApp}">
        <span class="wpp-icon">💬</span>
        <span class="wpp-text"><b>Falar no WhatsApp</b><br/>Seu consultor 21Go</span>
      </a>
    </header>

    ${refBlock}

    <section class="greet">
      <h1>Olá, ${firstName}!</h1>
      <p class="greet-sub">
        Esta é a simulação personalizada para o seu
        <b>${input.placa ? `${input.placa} – ` : ''}${ctx.veiculoTitulo}</b>.<br/>
        Seu veículo está avaliado em <b class="laranja">R$ ${formatBRL(input.fipe)}</b>
        <span class="greet-fipe-note">(de acordo com a tabela FIPE atual)</span>
      </p>
      <div style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:6px 14px;border-radius:999px;background:#EEF3FF;border:1px solid #293C82;color:#293C82;font-weight:700;font-size:12px;letter-spacing:.02em;">
        <span>🇧🇷</span> Atendemos em todo o Brasil
      </div>
    </section>

    ${input.ocultarAtivacao ? '' : `
    <section class="entrada">
      <div class="entrada-left">
        <span class="entrada-label">Taxa de ativação</span>
        <span class="entrada-sub">Pagamento único · no cartão, com juros</span>
      </div>
      <div class="entrada-vals">
        <div class="entrada-vals-item">
          <span class="entrada-vals-tag">À vista no Pix</span>
          <span class="entrada-vals-num">R$ ${formatBRL(taxaAvista)}</span>
        </div>${mostraParcelamento ? `
        <div class="entrada-vals-item">
          <span class="entrada-vals-tag">12x no cartão</span>
          <span class="entrada-vals-num">R$ ${formatBRL(taxa12xParcela)}</span>
        </div>` : ''}
      </div>
    </section>`}

    ${infoBlock}

    ${
      duasPaginas
        ? tabelaHTML('Parte 1 de 2', 'O que está coberto', linhasCobertura)
        : tabelaHTML('Comparativo', 'Coberturas e assistência 24h', visibleRows)
    }

    ${legendaHTML}

    ${duasPaginas ? `
    <div class="footer-meta">
      Simulação criada em ${ctx.hoje} · válida até ${ctx.validade} · página 1 de 2
    </div>

  </div>

  <div class="page">

    <header class="hero">
      <div class="brand">
        ${
          ctx.logoUrl
            ? `<img src="${ctx.logoUrl}" class="brand-logo" alt="21Go"/>`
            : `<span class="brand-text">21Go</span>`
        }
      </div>
      <a class="wpp-btn" href="${linkWhatsApp}">
        <span class="wpp-icon">💬</span>
        <span class="wpp-text"><b>Falar no WhatsApp</b><br/>Seu consultor 21Go</span>
      </a>
    </header>

    <section class="greet compacta">
      <h1>Assistência 24 horas</h1>
      <p class="greet-sub">
        O que você pode acionar a qualquer hora, todos os dias, em qualquer lugar do Brasil —
        para o seu <b>${input.placa ? `${input.placa} – ` : ''}${ctx.veiculoTitulo}</b>.
      </p>
    </section>

    ${tabelaHTML('Parte 2 de 2', 'O que você pode acionar', linhasAssistencia)}

    ${legendaHTML}
    ` : ''}

    <footer class="pdf-footer${input.consultorSlug ? ' so-botao' : ''}">
      ${
        /**
         * Ordem do dono (21/08/2026): *"nenhum site pode ter escrito proteção
         * veicular, sempre proteção patrimonial veicular. (...) você pode
         * excluir de todos que compraram e não colocar nada no lugar."*
         *
         * Num site vendido este bloco some inteiro — sem substituto, nem o nome
         * do consultor. O PDF vai na mao do CLIENTE dele: quem atende ali e ele,
         * e carimbar "Atendimento: 21Go" no rodape e a casa se pondo no meio de
         * uma venda que nao e dela (REGRA 0.1). O botao de WhatsApp ao lado ja
         * resolve pelo slug e continua sendo dele.
         */
        input.consultorSlug
          ? ''
          : `<div class="footer-consultor">
        <div class="footer-consultor-info">
          <span class="footer-eyebrow">Atendimento</span>
          <span class="footer-name">21Go Proteção Patrimonial Veicular</span>
        </div>
      </div>`
      }
      <a class="wpp-btn small" href="${linkWhatsApp}">
        <span class="wpp-icon">💬</span>
        <span class="wpp-text">Falar no WhatsApp</span>
      </a>
    </footer>

    <div class="footer-meta">
      Simulação criada em ${ctx.hoje} · válida até ${ctx.validade}${duasPaginas ? ' · página 2 de 2' : ''} · Atendimento em todo o Brasil
    </div>

  </div>
  `
}

export function renderQuoteHTML(input: QuotePdfInput): string {
  return renderHTML(input)
}

function renderHTML(input: QuotePdfInput): string {
  const now = new Date()
  const dayOfMonth = now.getDate()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  // Regra 21Go: ativou dia 1-15 → vence dia 10 do mês seguinte;
  //             ativou dia 16-31 → vence dia 20 do mês seguinte.
  const dueDateObj = dayOfMonth <= 15
    ? new Date(currentYear, currentMonth + 1, 10)
    : new Date(currentYear, currentMonth + 1, 20)
  const dueDate = dueDateObj.toLocaleDateString('pt-BR')
  const validade = addDaysBR(now, 7)
  const hoje = now.toLocaleDateString('pt-BR')
  const veiculoTitulo = `${input.marca} ${input.modelo} ${input.ano}`.trim()
  const logoUrl = getLogoDataUrl()

  const planosAplicaveis = resolvePlans(input)
  // Identifica o plano selecionado pelo valor primeiro (defesa robusta),
  // caindo no nome só se não houver match por valor. Usa valor PURO (sem
  // o extra de carroApp) pois o detectPlanByValue cruza com PRICING_TABLES.
  // Ordem das fontes: a lista do Power primeiro (é dela que a mensalidade saiu), depois o
  // cruzamento com a tabela local, e só então o nome. Casar pelo VALOR e não pelo nome porque
  // rótulo muda — "VIP Moto ate 1.000cc" já quebrou o casamento por nome em 03/09/2026.
  // Compara com a lista SEM os extras: `input.mensalidade` também vem sem eles.
  const planoEscolhidoId =
    planoEscolhidoNaLista(planosDaTelaParaPdf(input.planos), input.mensalidade) ||
    detectPlanByValue(input.fipe, input.mensalidade) ||
    planIdFromName(input.planoNome)

  // Ordena: plano escolhido primeiro, depois os outros
  const ordered = [...planosAplicaveis].sort((a, b) => {
    if (a.id === planoEscolhidoId) return -1
    if (b.id === planoEscolhidoId) return 1
    return 0
  })

  // PLANO DE REFERÊNCIA — usado no header de TODAS as páginas como base
  // E TAMBEM no calculo da ativacao.
  // Ordem: VIP (carros) > SUV > moto-1000 > moto-400 > especial > Premium > Do Seu Jeito > Basico
  // (carroApp +R$ 20 ja esta em planosAplicaveis quando aplicavel.)
  const referenceOrder: PlanId[] = [
    'vip', 'suv', 'moto-1000', 'moto-400', 'especial',
    'premium', 'do-seu-jeito', 'basico',
  ]
  const referencePlan =
    referenceOrder
      .map((id) => planosAplicaveis.find((p) => p.id === id))
      .find((p) => !!p) || planosAplicaveis[0]
  const refIsCarro =
    referencePlan && !['moto-400', 'moto-1000'].includes(referencePlan.id)

  // REGRA OFICIAL 21Go (ver calcActivation em pricing.ts): mensalidade CHEIA da
  // base + R$ 50, BYD R$ 1.550 fixo. Base = MAIOR entre o VIP de referencia e o
  // plano escolhido (Basico/Do Seu Jeito pagam o VIP; Premium paga o Premium).
  const isBYD = (input.marca || '').trim().toUpperCase() === 'BYD'
  const selectedMonthly =
    planosAplicaveis.find((p) => p.id === planoEscolhidoId)?.monthly || input.mensalidade
  // Consultor com ativacao fixa combinada na venda usa o numero dele; os demais
  // (e a casa) seguem a tabela. BYD nao entra no acordo — ver consultores-ativacao.
  const taxa = ativacaoDoConsultor(
    input.consultorSlug,
    calcActivation(referencePlan?.monthly || input.mensalidade, isBYD, selectedMonthly),
    isBYD,
  )

  // Determinar tipo (carros / suv / moto / especial) baseado nos planos
  let kind: 'carros' | 'suv' | 'moto' | 'especial' = 'carros'
  const planIdsSet = new Set(planosAplicaveis.map((p) => p.id))
  if (planIdsSet.has('especial')) kind = 'especial'
  else if (planIdsSet.has('suv')) kind = 'suv'
  else if (planIdsSet.has('moto-400') || planIdsSet.has('moto-1000')) kind = 'moto'
  else kind = 'carros'

  const ctx = {
    logoUrl,
    hoje,
    validade,
    dueDate,
    veiculoTitulo,
    taxa,
    referencePlan,
    refIsCarro: !!refIsCarro,
    selectedPlanId: planoEscolhidoId as PlanId,
    kind,
  }
  void ordered // mantido pra compat — não usado mais (1 página única)
  const pagesHTML = renderComparisonPage(input, planosAplicaveis, ctx)

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Simulação 21Go · ${input.nome}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  html, body {
    margin: 0; padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #0F172A;
    background: #fff;
    line-height: 1.4;
    font-feature-settings: 'cv11', 'ss01', 'kern';
    letter-spacing: -0.01em;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 8mm 10mm;
    background: #fff;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Duas paginas: coberturas na 1, assistencia na 2. */
  .page + .page { break-before: page; page-break-before: always; }
  .laranja { color: #F2911D; font-weight: 700; }
  .verde { color: #25C168; }

  /* HEADER compacto */
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #F1F5F9;
  }
  .brand-logo { height: 38px; width: auto; display: block; object-fit: contain; }
  .brand-text { font-weight: 800; font-size: 18px; color: #1B4DA1; letter-spacing: -0.5px; }

  .wpp-btn {
    background: #25C168; color: #fff; text-decoration: none;
    padding: 6px 12px 6px 8px; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px; line-height: 1.15;
    box-shadow: 0 1px 4px rgba(37,193,104,0.18);
  }
  .wpp-btn .wpp-icon {
    width: 20px; height: 20px;
    background: rgba(255,255,255,0.2); border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; flex-shrink: 0;
  }
  .wpp-btn .wpp-text b { font-weight: 700; font-size: 10px; display: block; }

  /* GREETING compacto */
  .greet { margin-bottom: 8px; }
  .greet.compacta { margin-bottom: 10px; }
  .greet h1 {
    font-size: 16px; font-weight: 700;
    color: #0F172A; margin: 0 0 2px;
    letter-spacing: -0.02em; line-height: 1.2;
  }
  .greet-sub {
    font-size: 10px; color: #475569;
    margin: 0; line-height: 1.4;
  }
  .greet-sub b { color: #0F172A; font-weight: 600; }
  .greet-fipe-note {
    color: #94A3B8; font-size: 9px; font-style: italic;
    margin-left: 3px;
  }

  /* REF BAR — 4 cenarios em grid 4 colunas */
  .ref-bar {
    background: linear-gradient(135deg, #FFF7ED 0%, #FFFAF0 100%);
    border: 1px solid rgba(242, 145, 29,0.3);
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 8px;
  }
  .ref-bar-header {
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(242, 145, 29,0.15);
  }
  .ref-bar-title {
    display: flex; align-items: baseline; gap: 8px;
  }
  .ref-bar-eyebrow {
    font-size: 8px; font-weight: 700;
    color: #B45309; text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .ref-bar-name {
    font-size: 13px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
  }
  .ref-bar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 6px;
  }
  .ref-disc {
    background: #fff;
    border-radius: 8px;
    padding: 7px 9px;
    border: 1px solid #F1F5F9;
    text-align: left;
    display: flex; flex-direction: column; gap: 1px;
  }
  .ref-disc.highlight {
    background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
    border-color: #25C168;
  }
  .ref-disc-label {
    font-size: 9.5px; font-weight: 600; color: #475569;
    line-height: 1.2;
  }
  .ref-disc-tag {
    font-size: 8.5px; font-weight: 700;
    color: #94A3B8; letter-spacing: 0.2px;
  }
  .ref-disc.highlight .ref-disc-tag { color: #059669; }
  .ref-disc-val {
    font-size: 14px; font-weight: 800;
    color: #0F172A; letter-spacing: -0.03em;
    margin-top: 2px;
  }
  .ref-disc.highlight .ref-disc-val { color: #059669; }

  /* ENTRADA compacta */
  .entrada {
    background: #FFF7ED;
    border: 2px solid #F2911D;
    border-radius: 9px;
    padding: 9px 13px;
    margin-bottom: 8px;
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
    box-shadow: 0 2px 6px rgba(242,145,29,0.18);
  }
  .entrada-left { display: flex; flex-direction: column; gap: 1px; }
  .entrada-label {
    font-size: 9px; font-weight: 800; color: #F2911D;
    text-transform: uppercase; letter-spacing: 1.2px;
  }
  .entrada-sub {
    font-size: 9.5px; color: #9A3412; font-weight: 600;
  }
  .entrada-vals { display: flex; align-items: baseline; gap: 14px; }
  .entrada-vals-item { display: flex; flex-direction: column; align-items: flex-end; }
  .entrada-vals-tag {
    font-size: 8px; color: #C2410C; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .entrada-vals-num {
    font-size: 14px; font-weight: 800; color: #F2911D;
    letter-spacing: -0.03em;
  }

  /* CUST INFO — chips com Uber / Leilao / Remarcado / Seguro */
  .cust-info {
    background: #FFFBEB;
    border: 1px solid #FCD34D;
    border-radius: 8px;
    padding: 6px 10px;
    margin-bottom: 8px;
    display: flex; align-items: center; gap: 10px;
  }
  .cust-info-label {
    font-size: 8px; font-weight: 700;
    color: #92400E; text-transform: uppercase;
    letter-spacing: 1.2px;
    flex-shrink: 0;
  }
  .cust-info-chips {
    display: flex; flex-wrap: wrap; gap: 5px;
  }
  .cust-info-chip {
    display: inline-block;
    background: #fff;
    border: 1px solid #FCD34D;
    color: #92400E;
    font-size: 9px; font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }

  /* TABELA — comprimida */
  .comparison {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    overflow: hidden;
    flex: 1;
    margin-bottom: 8px;
  }
  .cmp-table {
    width: 100%;
    /* 100% da altura: com a tabela partida em duas paginas sobrava um bloco branco no pe
       de cada uma — esticando, a folga vira respiro entre as linhas. */
    height: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
  }
  .cmp-table thead th {
    padding: 8px 6px; text-align: center;
    border-bottom: 1px solid #E5E7EB;
    vertical-align: top; background: #FAFAFA;
  }
  .cmp-corner {
    background: #fff !important;
    text-align: left; width: 26%;
    padding: 8px 12px !important;
  }
  .cmp-corner-eyebrow {
    font-size: 8px; font-weight: 700;
    color: #94A3B8; text-transform: uppercase;
    letter-spacing: 1.2px; display: block; margin-bottom: 2px;
  }
  .cmp-corner-title {
    font-size: 11px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
  }
  .plan-col {
    border-left: 1px solid #F1F5F9;
    position: relative;
  }
  .plan-col.selected {
    background: #FFFBEB !important;
  }
  .plan-col.selected::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px; background: #F2911D;
  }
  .plan-flag {
    display: inline-block;
    background: #0F172A; color: #fff;
    font-size: 7px; font-weight: 700;
    padding: 2px 6px; border-radius: 999px;
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .plan-flag.selected { background: #F2911D; }
  .plan-flag.pop { background: #25C168; }
  .plan-name {
    font-size: 11px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
    margin-bottom: 3px;
  }
  .plan-price {
    font-size: 16px; font-weight: 800;
    color: #0F172A; letter-spacing: -0.03em;
    line-height: 1;
  }
  .plan-price em {
    font-size: 9px; font-style: normal;
    color: #94A3B8; font-weight: 500;
  }

  .cmp-table tbody tr {
    border-bottom: 1px solid #F1F5F9;
  }
  .cmp-table tbody tr:last-child { border-bottom: none; }
  .cmp-table tbody tr:nth-child(even) { background: #FAFAFA; }
  .row-label {
    text-align: left;
    padding: 10px 12px;
    font-weight: 500;
    color: #1F2937;
  }
  .row-label-name {
    display: block;
    font-size: 10.5px; font-weight: 600;
    color: #0F172A; line-height: 1.25;
  }
  .row-label-hint {
    display: block;
    font-size: 8.5px; font-weight: 500;
    color: #64748B; line-height: 1.3;
    margin-top: 2px;
  }
  .cell {
    padding: 10px 6px;
    text-align: center;
    border-left: 1px solid #F1F5F9;
    vertical-align: middle;
  }
  .cell-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17px; height: 17px;
    border-radius: 50%;
    font-size: 10.5px; font-weight: 800;
    flex-shrink: 0; line-height: 1;
  }
  .cell-icon.ok { background: #25C168; color: #fff; }
  /* Vermelho cheio, mesmo peso do verde: na folha impressa o cinza de antes sumia. */
  .cell-icon.no { background: #E5484D; color: #fff; }
  .cell-detail {
    display: block;
    font-size: 9px; font-weight: 500;
    color: #64748B;
    margin-top: 3px; line-height: 1.25;
  }
  .cell-detail.no { color: #C2262A; font-weight: 600; }
  /* Pagina unica (moto): as 13 linhas com explicacao nao cabem no respiro da versao de
     duas paginas — estouravam o rodape, que e cortado pelo overflow da .page. */
  .cmp-table.densa .row-label { padding: 3px 12px; }
  .cmp-table.densa .cell { padding: 3px 6px; }
  .cmp-table.densa .row-label-hint { line-height: 1.2; }

  .legenda {
    display: flex; align-items: center; gap: 14px;
    padding: 6px 12px; margin-bottom: 6px;
    font-size: 8.5px; color: #475569;
  }
  .legenda-item {
    display: inline-flex; align-items: center; gap: 5px;
    font-weight: 600;
  }
  .legenda-nota {
    margin-left: auto;
    color: #94A3B8; font-style: italic;
  }

  /* FOOTER compacto */
  /* Sem o bloco de atendimento (site de consultor) o botao sozinho ficaria
     encostado na esquerda por causa do space-between. */
  .pdf-footer.so-botao {
    justify-content: flex-end;
  }

  .pdf-footer {
    background: #0F172A;
    color: #fff;
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .footer-consultor {
    display: flex; align-items: center; gap: 8px;
  }
  .footer-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #F2911D 0%, #FB923C 100%);
    color: #fff; font-weight: 700; font-size: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .footer-consultor-info {
    display: flex; flex-direction: column; gap: 0;
  }
  .footer-eyebrow {
    font-size: 7.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.2px;
    color: #94A3B8;
  }
  .footer-name {
    font-size: 11px; font-weight: 600;
    color: #fff; letter-spacing: -0.02em;
  }
  .footer-meta {
    text-align: center;
    font-size: 8px; color: #94A3B8;
    letter-spacing: 0.01em;
  }
</style>
</head>
<body>
  ${pagesHTML}
</body>
</html>`
}

/* ─────────────────────────────────────────────────────────────────────────
 * Puppeteer — browser reutilizado (singleton) para evitar custo de boot
 * ─────────────────────────────────────────────────────────────────────── */

let browserPromise: Promise<import('puppeteer-core').Browser> | null = null

/**
 * Resolve o caminho do Chromium tentando múltiplos locais conhecidos.
 * Ordem de preferência:
 *   1. PUPPETEER_EXECUTABLE_PATH (env)
 *   2. /root/.cache/puppeteer/chrome/.../chrome  ← Chrome do puppeteer-core
 *   3. /usr/bin/chromium / chromium-browser / google-chrome (sistema)
 *
 * /bin/chromium-browser do Ubuntu 24.04 é um STUB de snap — NÃO usar.
 */
async function resolveChromiumPath(): Promise<string | undefined> {
  const fs = await import('node:fs/promises')
  const tryPaths: (string | undefined)[] = []

  // 1. Env explícita (mais alta prioridade)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    tryPaths.push(process.env.PUPPETEER_EXECUTABLE_PATH)
  }

  // 2. Chrome baixado pelo puppeteer-core (auto-detect)
  try {
    const cacheRoot = '/root/.cache/puppeteer/chrome'
    const versions = await fs.readdir(cacheRoot).catch(() => [] as string[])
    for (const v of versions) {
      tryPaths.push(`${cacheRoot}/${v}/chrome-linux64/chrome`)
    }
  } catch {
    /* noop */
  }

  // 3. Cache puppeteer no Windows (~/.cache/puppeteer/chrome/...)
  if (process.platform === 'win32') {
    try {
      const home = process.env.USERPROFILE || process.env.HOME
      if (home) {
        const cacheRoot = `${home}\\.cache\\puppeteer\\chrome`
        const versions = await fs.readdir(cacheRoot).catch(() => [] as string[])
        for (const v of versions) {
          tryPaths.push(`${cacheRoot}\\${v}\\chrome-win64\\chrome.exe`)
          tryPaths.push(`${cacheRoot}\\${v}\\chrome-win\\chrome.exe`)
        }
      }
    } catch {
      /* noop */
    }
    // Chrome instalado no Windows
    tryPaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    )
  }

  // 4. Sistema (Linux)
  tryPaths.push('/usr/bin/chromium', '/usr/bin/google-chrome')

  for (const p of tryPaths) {
    if (!p) continue
    try {
      await fs.access(p)
      return p
    } catch {
      /* tenta próximo */
    }
  }
  return undefined
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolveChromiumPath()
      if (!executablePath) {
        throw new Error(
          'Chromium não encontrado. Defina PUPPETEER_EXECUTABLE_PATH ou rode `npx puppeteer browsers install chrome`.',
        )
      }
      console.log('[PDF] Lançando Chromium (headless) em:', executablePath)
      const t0 = Date.now()
      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      })
      console.log(`[PDF] Chromium pronto em ${Date.now() - t0}ms`)
      return browser
    })().catch((err) => {
      console.error('[PDF] Falha ao lançar Chromium:', err.message, err.stack)
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

export async function generateQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  console.log('[PDF] generateQuotePdf iniciado para', input.nome, '-', input.marca, input.modelo)

  // Guard de seguranca: PDF NUNCA deve sair com FIPE <= 0 ou mensalidade <= 0.
  // O backend /api/vehicle/lead ja filtra, mas reforcamos aqui pra qualquer caller.
  if (!input.fipe || input.fipe <= 0) {
    throw new Error(
      `valorFipe invalido (${input.fipe}) — recusa gerar PDF com FIPE zerado/ausente`,
    )
  }
  if (!input.mensalidade || input.mensalidade <= 0) {
    throw new Error(
      `mensalidade invalida (${input.mensalidade}) — recusa gerar PDF com plano zerado`,
    )
  }

  const html = renderHTML(input)
  console.log('[PDF] HTML renderizado:', html.length, 'chars')
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    const t0 = Date.now()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    console.log(`[PDF] setContent ok em ${Date.now() - t0}ms`)
    const t1 = Date.now()
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    console.log(`[PDF] pdf gerado em ${Date.now() - t1}ms — ${pdf.length} bytes`)
    return Buffer.from(pdf)
  } catch (err: any) {
    console.error('[PDF] Erro durante geração:', err.message, err.stack)
    throw err
  } finally {
    await page.close().catch(() => {})
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise
    await b.close().catch(() => {})
    browserPromise = null
  }
}
