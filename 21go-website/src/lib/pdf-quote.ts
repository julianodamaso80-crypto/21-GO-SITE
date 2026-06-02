import puppeteer from 'puppeteer-core'
import {
  PLAN_INFO,
  planIdFromName,
  getAllRelevantPlans,
  findPrice,
  PRICING_TABLES,
  type QuotePlanFull,
  type PlanId,
} from '@/data/pricing'
import { LOGO_21GO_BASE64 } from './assets/logo-base64'

export interface QuotePdfInput {
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
  /** Origem do veículo: "nao" | "leilao" | "remarcado". Quando leilão/remarcado, indenização cobre 80% da FIPE. */
  leilao?: string | null
  /** Seguro/proteção atual do veículo (texto livre — ex: "Porto Seguro", "Allianz"). */
  seguroAtual?: string | null
}

/** Carro de app: +R$ 20/mes em todos os planos exibidos. */
const CARRO_APP_EXTRA = 20

/* ─────────────────────────────────────────────────────────────────────────
 * MATRIZ DE COBERTURAS — formato oficial do PowerCRM 21Go
 * Cada cell é null (× não incluído) ou string (✓ + detalhe; '' = só ✓).
 * ───────────────────────────────────────────────────────────────────────── */

interface CoverageRow {
  label: string
  /** ordem dos planos = ['basico','do-seu-jeito','vip','premium'] OU plano único */
  carros?: [string | null, string | null, string | null, string | null]
  suv?: string | null
  moto?: string | null
  especial?: string | null
}

const COVERAGE_TABLE: CoverageRow[] = [
  { label: 'Roubo',                                          carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Furto',                                          carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Incêndio',                                       carros: ['', 'Proveniente de colisão', 'Proveniente de colisão', 'Proveniente de colisão'],          suv: '', moto: null, especial: 'Proveniente de colisão' },
  { label: 'Fenômenos da natureza',                          carros: [null, '', '', ''],                                                                        suv: '', moto: '', especial: '' },
  { label: 'Colisão',                                        carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Danos a terceiros',                              carros: ['R$ 5.000,00', 'R$ 10.000,00', 'R$ 50.000,00', 'R$ 100.000,00'],                          suv: 'R$ 50.000,00', moto: null, especial: 'R$ 50.000,00' },
  { label: 'Carro reserva',                                  carros: [null, null, '07 dias (roubo e furto)', '15 dias'],                                        suv: '07 dias (roubo e furto)', moto: null, especial: '07 dias (roubo e furto)' },
  { label: 'Parabrisa',                                      carros: [null, '', '', ''],                                                                        suv: '', moto: null, especial: '' },
  { label: 'Carro amigo',                                    carros: [null, '25 km de raio', '25 km de raio', ''],                                              suv: '25 km de raio', moto: null, especial: '25 km de raio' },
  { label: '01 Reboque Adicional',                           carros: [null, null, null, '200 km (totais)'],                                                     suv: null, moto: null, especial: null },
  { label: 'Cobertura Todos os Vidros',                      carros: [null, null, null, ''],                                                                    suv: null, moto: null, especial: null },
  { label: 'Monitoramento 24h',                              carros: ['', '', 'Valor acima de R$ 50.000', ''],                                                  suv: '', moto: 'Acima de R$ 8.000', especial: '' },
  { label: 'Reboque',                                        carros: ['200 km (totais)', '400 km (totais)', '1.000 km (totais)', '1.200 km (totais)'],          suv: '1.000 km (totais)', moto: '1.000 km (totais)', especial: '1.000 km (totais)' },
  { label: 'Chaveiro',                                       carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Substituição de pneu furado',                    carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Auxílio na falta de combustível',                carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Hospedagem em hotel',                            carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Táxi',                                           carros: ['25 km', '50 km', '100 km', '150 km'],                                                    suv: '100 km', moto: null, especial: '100 km' },
  { label: 'Retorno a domicílio',                            carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
  { label: 'Socorro mecânico / elétrico',                    carros: ['', '', '', ''],                                                                          suv: '', moto: '', especial: '' },
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
 */
export function detectPlanByValue(fipe: number, mensalidade: number): PlanId | null {
  const ids: PlanId[] = ['especial', 'premium', 'vip', 'suv', 'do-seu-jeito', 'basico', 'moto-1000', 'moto-400']
  // Tolerância de 1 centavo p/ evitar problema de float
  const matches: PlanId[] = []
  for (const id of ids) {
    const price = findPrice(PRICING_TABLES[id], fipe)
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
  // 1) Defesa primária: identificar plano pelo valor exato
  const detected = detectPlanByValue(input.fipe, input.mensalidade)

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

  // Se for carro de aplicativo, soma +R$ 20/mês em TODOS os planos exibidos.
  if (input.carroApp) {
    return plans.map((p) => ({ ...p, monthly: p.monthly + CARRO_APP_EXTRA }))
  }
  return plans
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
  // REGRA OFICIAL 21Go: ativacao = mensalidade cheia + R$ 50. Sem gross-up.
  // Mesmo valor a vista e parcelado em 12x sem juros.
  const taxa = ctx.taxa
  const taxaAvista = taxa
  const taxa12xParcela = taxa / 12

  const firstName = input.nome.split(' ')[0]

  // Bloco de informacoes do cliente: Uber/99, leilao/remarcado, seguro atual.
  // So texto (sem valor) — ajuda a consultora a confirmar dados quando ler o PDF.
  const infoChips: string[] = []
  if (input.carroApp) infoChips.push('Carro de aplicativo (Uber, 99, etc.)')
  if (input.leilao === 'leilao') infoChips.push('Veiculo de leilao')
  if (input.leilao === 'remarcado') infoChips.push('Veiculo remarcado')
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

  // Filtra coberturas: só mostra linhas que pelo menos UMA coluna inclui
  const visibleRows = COVERAGE_TABLE.filter((row) =>
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

  const rowsHTML = visibleRows
    .map((row) => {
      const cellsHTML = cols
        .map((col) => {
          const v = getCell(row, col)
          if (v === null) {
            return `<td class="cell no"><span class="cell-icon no">×</span></td>`
          }
          if (v === '') {
            return `<td class="cell yes"><span class="cell-icon ok">✓</span></td>`
          }
          return `<td class="cell yes"><span class="cell-icon ok">✓</span><span class="cell-detail">${v}</span></td>`
        })
        .join('')
      return `<tr><th class="row-label">${row.label}</th>${cellsHTML}</tr>`
    })
    .join('')

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
      <a class="wpp-btn" href="https://wa.me/5521980214882">
        <span class="wpp-icon">💬</span>
        <span class="wpp-text"><b>WhatsApp do Consultor</b><br/>(21) 98021-4882</span>
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
    </section>

    <section class="entrada">
      <div class="entrada-left">
        <span class="entrada-label">Taxa de ativação</span>
        <span class="entrada-sub">Pagamento único · contratação do plano</span>
      </div>
      <div class="entrada-vals">
        <div class="entrada-vals-item">
          <span class="entrada-vals-tag">À vista</span>
          <span class="entrada-vals-num">R$ ${formatBRL(taxaAvista)}</span>
        </div>
        <div class="entrada-vals-item">
          <span class="entrada-vals-tag">12x sem juros</span>
          <span class="entrada-vals-num">R$ ${formatBRL(taxa12xParcela)}</span>
        </div>
      </div>
    </section>

    ${infoBlock}

    <section class="comparison">
      <table class="cmp-table">
        <thead>
          <tr>
            <th class="cmp-corner">
              <span class="cmp-corner-eyebrow">Comparativo</span>
              <span class="cmp-corner-title">Coberturas e benefícios</span>
            </th>
            ${colsHTML}
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    </section>

    <footer class="pdf-footer">
      <div class="footer-consultor">
        <div class="footer-avatar">LT</div>
        <div class="footer-consultor-info">
          <span class="footer-eyebrow">Consultor</span>
          <span class="footer-name">Letycia Thayene Nascimento Lima</span>
        </div>
      </div>
      <a class="wpp-btn small" href="https://wa.me/5521980214882">
        <span class="wpp-icon">💬</span>
        <span class="wpp-text">(21) 98021-4882</span>
      </a>
    </footer>

    <div class="footer-meta">
      Simulação criada em ${ctx.hoje} · válida até ${ctx.validade} · Atendimento em todo o Brasil
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
  const planoEscolhidoId =
    detectPlanByValue(input.fipe, input.mensalidade) || planIdFromName(input.planoNome)

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

  // REGRA OFICIAL 21Go: ativacao = mensalidade do plano VIP de referencia + R$ 50.
  // SEM gross-up, SEM gracinha. Mesmo valor a vista e parcelado em 12x sem juros.
  // EXCECAO BYD: ativacao FIXA em R$ 1.550 pra qualquer modelo da marca BYD.
  const isBYD = (input.marca || '').trim().toUpperCase() === 'BYD'
  const taxa = isBYD ? 1550 : (referencePlan?.monthly || input.mensalidade) + 50

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
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    padding: 7px 12px;
    margin-bottom: 8px;
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }
  .entrada-left { display: flex; flex-direction: column; gap: 1px; }
  .entrada-label {
    font-size: 8px; font-weight: 700; color: #94A3B8;
    text-transform: uppercase; letter-spacing: 1.2px;
  }
  .entrada-sub {
    font-size: 9.5px; color: #475569; font-weight: 500;
  }
  .entrada-vals { display: flex; align-items: baseline; gap: 14px; }
  .entrada-vals-item { display: flex; flex-direction: column; align-items: flex-end; }
  .entrada-vals-tag {
    font-size: 8px; color: #94A3B8; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .entrada-vals-num {
    font-size: 13px; font-weight: 800; color: #F2911D;
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
    padding: 5px 12px;
    font-size: 9.5px; font-weight: 500;
    color: #1F2937;
  }
  .cell {
    padding: 5px 6px;
    text-align: center;
    border-left: 1px solid #F1F5F9;
    vertical-align: middle;
  }
  .cell.no { opacity: 0.45; }
  .cell-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px;
    border-radius: 50%;
    font-size: 9px; font-weight: 800;
    flex-shrink: 0; line-height: 1;
  }
  .cell-icon.ok { background: #25C168; color: #fff; }
  .cell-icon.no { background: #E5E7EB; color: #94A3B8; }
  .cell-detail {
    display: block;
    font-size: 8.5px; font-weight: 500;
    color: #64748B;
    margin-top: 2px; line-height: 1.2;
  }

  /* FOOTER compacto */
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
