'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { trackCotacaoInicio, trackCotacaoCompleta, trackPedidoOrcamento, trackPageView, getTrackingData } from '@/lib/tracking'
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Check,
  X,
  Lock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Mail,
  Sparkles,
  Loader2,
  AlertCircle,
  Tag,
  Car,
  Search,
} from 'lucide-react'
import {
  type PlanId,
  type QuotePlan,
  type PlanInfo,
  PLAN_INFO,
  formatPrice,
  getApplicablePlans,
  calcActivation,
  activationCashPrice,
  activationInstallment12x,
} from '@/data/pricing'
import { getExclusionReason, type ExclusionReason } from '@/data/vehicle-exclusions'

/* ─── Types ─── */
interface FormData {
  nome: string
  whatsapp: string
  email: string
  placa: string
  leilao: 'nao' | 'leilao' | 'remarcado'
  carroApp: 'nao' | 'sim'
  danosTerceiros: 'nao' | 'sim'
  temSeguro: 'nao' | 'sim'
  nomeSeguro: string
}

interface VehicleData {
  marca: string
  modelo: string
  ano: string
  cor: string
  fipeValue: number
  fipeCode: string
  categoria?: string
  combustivel?: string
}

interface FipeItem {
  code: string
  name: string
}

/* ─── API Config ─── */
// Vazio = mesmo origin (rotas /api/* do próprio site Next).
// Pra apontar pra outro host, defina NEXT_PUBLIC_API_URL.
// API_BASE: SEMPRE mesmo domínio (string vazia = relativo). Se a env injetar
// um valor que tenha "railway.app", ignoramos — proteção contra deploy antigo
// reaparecer. Próprio site sempre serve /api/* corretamente.
const _RAW_API = process.env.NEXT_PUBLIC_API_URL || ''
const API_BASE = _RAW_API && !_RAW_API.includes('railway.app') ? _RAW_API : ''

/* ─── Masks ─── */
function maskPhone(v: string) {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) {
    d = d.slice(2)
  }
  d = d.slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Extrai apenas dígitos do telefone — formato 55XXXXXXXXXXX para WhatsApp */
function cleanPhone(v: string): string {
  const digits = v.replace(/\D/g, '')
  // Se já começa com 55, retorna direto
  if (digits.startsWith('55') && digits.length === 13) return digits
  // Senão, adiciona 55
  return `55${digits}`
}

/** Valida WhatsApp: DDD (11-99) + 9 dígitos começando com 9 */
function isValidWhatsApp(v: string): string | null {
  const digits = v.replace(/\D/g, '')
  if (digits.length < 11) return 'WhatsApp incompleto. Informe DDD + 9 dígitos'
  const ddd = parseInt(digits.slice(0, 2))
  if (ddd < 11 || ddd > 99) return 'DDD inválido'
  if (digits[2] !== '9') return 'Celular deve começar com 9 depois do DDD'
  if (digits.length !== 11) return 'WhatsApp incompleto. Informe DDD + 9 dígitos'
  return null // válido
}

function maskPlaca(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

/* ─── Steps ─── */
const STEPS = [
  { num: '01', label: 'Seus Dados' },
  { num: '02', label: 'Resultado' },
]

/* ─── Component ─── */
export default function CotacaoPage() {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0)
  const [showCoberturas, setShowCoberturas] = useState(true)

  // API state
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [vehicle, setVehicle] = useState<VehicleData | null>(null)
  const [plans, setPlans] = useState<QuotePlan[]>([])

  // Excluded vehicle state — `model` = modelo na lista de exclusao;
  // `year` = ano-modelo abaixo do corte minimo. Em ambos os casos mostramos
  // tela de agradecimento e salvamos o contato pra acionar quando aceitarmos.
  const [excluded, setExcluded] = useState(false)
  const [exclusionReason, setExclusionReason] = useState<Exclude<ExclusionReason, null>>('model')

  // Adesivo toggle
  const [stickerAccepted, setStickerAccepted] = useState(true)

  // Atendimento humano: quando PowerCRM + API Brasil + Parallelum falham
  // ou quando o veículo não retorna FIPE confiável. Cliente é direcionado
  // pro WhatsApp da consultora (5521969620781) com dados pré-preenchidos.
  const [requiresHumanSupport, setRequiresHumanSupport] = useState(false)
  const [humanSupportReason, setHumanSupportReason] = useState<'fipe_indisponivel' | 'consulta_falhou' | 'manual'>('consulta_falhou')
  // Rate-limit: bloqueia após 3 veículos distintos por 7 dias (anti-consultor concorrente).
  // No 4º, abre pop-up com WhatsApp em vez de mostrar a simulação.
  const [limitBlocked, setLimitBlocked] = useState(false)

  // Fluxo principal: integração PowerCRM (tipo → marca → ano → modelo).
  // Placa permanece como campo OPCIONAL — não bloqueia cotação.
  // `searchMode` mantém o nome legado pra não quebrar refs, mas hoje só vale 'modelo'.
  const [searchMode] = useState<'modelo'>('modelo')
  const [fipeKind, setFipeKind] = useState<'carros' | 'motos'>('carros')
  const [fipeMarcas, setFipeMarcas] = useState<FipeItem[]>([])
  const [fipeModelos, setFipeModelos] = useState<FipeItem[]>([])
  const [fipeAnos, setFipeAnos] = useState<FipeItem[]>([])
  const [fipeMarcaCode, setFipeMarcaCode] = useState('')
  const [fipeModeloCode, setFipeModeloCode] = useState('')
  const [fipeAnoCode, setFipeAnoCode] = useState('')
  const [fipeLoadingMarcas, setFipeLoadingMarcas] = useState(false)
  const [fipeLoadingModelos, setFipeLoadingModelos] = useState(false)
  const [fipeLoadingAnos, setFipeLoadingAnos] = useState(false)
  // Texto exibido das opções selecionadas (precisa pra enviar ao /preco e ao /lead)
  const [fipeMarcaText, setFipeMarcaText] = useState('')
  const [fipeModeloText, setFipeModeloText] = useState('')
  const [fipeModeloCodFipe, setFipeModeloCodFipe] = useState('')

  const [form, setForm] = useState<FormData>({
    nome: '',
    whatsapp: '',
    email: '',
    placa: '',
    leilao: 'nao',
    carroApp: 'nao',
    danosTerceiros: 'nao',
    temSeguro: 'nao',
    nomeSeguro: '',
  })

  const set = useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    if (field === 'placa') setApiError('')
  }, [])

  // Lead tracking (backend CRM cuida de follow-up + PDF + Bull queue)
  const [leadId, setLeadId] = useState<string | null>(null)
  const whatsappClicked = useRef(false)

  // Helper: notify WhatsApp click to API (legado + backend/CRM com envio imediato de PDF)
  const notifyWhatsAppClick = useCallback(() => {
    whatsappClicked.current = true
    // Tracking legado (in-memory no Next — mantido por compat)
    fetch('/api/whatsapp-clicked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, whatsapp: form.whatsapp }),
    }).catch(() => {})
    // Backend CRM: cancela follow-up agendado e dispara envio imediato do PDF
    if (leadId) {
      fetch(`${API_BASE}/api/vehicle/lead/${leadId}/whatsapp-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    }
  }, [leadId, form.whatsapp])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.nome.trim()) e.nome = 'Informe seu nome'
    const whatsErr = isValidWhatsApp(form.whatsapp)
    if (whatsErr) e.whatsapp = whatsErr
    // Tipo → Marca → Ano → Modelo são obrigatórios; placa é opcional.
    if (!fipeMarcaCode) e.fipeMarca = 'Escolha a marca'
    if (!fipeAnoCode) e.fipeAno = 'Escolha o ano'
    if (!fipeModeloCode) e.fipeModelo = 'Escolha o modelo'
    // Placa, se preenchida, precisa ter 7 chars; se vazia, ok.
    if (form.placa && form.placa.length > 0 && form.placa.length < 7) {
      e.placa = 'Placa incompleta (deixe em branco se não souber)'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ─── Fetch genérico das APIs FIPE/PowerCRM ─── */
  async function fetchFipe<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal })
      clearTimeout(timeout)
      return await res.json()
    } catch {
      clearTimeout(timeout)
      throw new Error('network')
    }
  }

  // Mapeia o estado fipeKind interno ('carros'|'motos') pro param do PowerCRM ('carro'|'moto')
  const pcTipo = fipeKind === 'motos' ? 'moto' : 'carro'

  // URL distinta por etapa pra Meta criar audiencias por funil:
  //   step 1 (form)        -> /cotacao
  //   step 2 (resultado)   -> /cotacao?etapa=resultado
  // history.replaceState evita reload; dispara PageView novo pro pixel.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (step === 2) {
      if (url.searchParams.get('etapa') !== 'resultado') {
        url.searchParams.set('etapa', 'resultado')
        window.history.replaceState({}, '', url.toString())
        trackPageView()
      }
    } else if (url.searchParams.has('etapa')) {
      url.searchParams.delete('etapa')
      window.history.replaceState({}, '', url.toString())
    }
  }, [step])

  // Carrega marcas do PowerCRM (depende só do tipo carro/moto)
  useEffect(() => {
    let cancelled = false
    setFipeLoadingMarcas(true)
    setApiError('')
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/powercrm/marcas?tipo=${pcTipo}`,
    )
      .then(res => {
        if (cancelled) return
        if (res.success && res.data) setFipeMarcas(res.data)
        else setApiError(res.error || 'Não foi possível carregar as marcas')
      })
      .catch(() => {
        if (!cancelled) setApiError('Falha de rede ao buscar marcas')
      })
      .finally(() => {
        if (!cancelled) setFipeLoadingMarcas(false)
      })
    return () => { cancelled = true }
  }, [pcTipo])

  // Carrega lista de anos (genérica) assim que entra na página
  useEffect(() => {
    let cancelled = false
    setFipeLoadingAnos(true)
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/powercrm/anos`,
    )
      .then(res => {
        if (cancelled) return
        if (res.success && res.data) setFipeAnos(res.data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFipeLoadingAnos(false) })
    return () => { cancelled = true }
  }, [])

  // Carrega modelos quando marca + ano são selecionados (PowerCRM exige cb+cy juntos)
  useEffect(() => {
    if (!fipeMarcaCode || !fipeAnoCode) { setFipeModelos([]); return }
    let cancelled = false
    setFipeLoadingModelos(true)
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/powercrm/modelos?marca=${encodeURIComponent(fipeMarcaCode)}&ano=${encodeURIComponent(fipeAnoCode)}`,
    )
      .then(res => {
        if (cancelled) return
        if (res.success && res.data) setFipeModelos(res.data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFipeLoadingModelos(false) })
    return () => { cancelled = true }
  }, [fipeMarcaCode, fipeAnoCode])

  // (switchToPlaca / switchToModelo removidos — fluxo único agora)

  /**
   * Quando a cascata PowerCRM → API Brasil → Parallelum falha (ou cliente
   * não consegue passar a placa), salvamos lead parcial pra Letycia ver no
   * Supabase e mostramos a tela de atendimento humano com botão WhatsApp.
   * NUNCA inventamos valor FIPE — cliente fala direto com a consultora.
   */
  function triggerHumanSupport(reason: 'fipe_indisponivel' | 'consulta_falhou' | 'manual') {
    setHumanSupportReason(reason)
    setRequiresHumanSupport(true)
    setLoading(false)

    // Salva lead parcial pra ficar registrado no Supabase
    const tracking = getTrackingData()
    fetch(`${API_BASE}/api/vehicle/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome,
        whatsapp: form.whatsapp,
        email: form.email || undefined,
        placa: form.placa,
        leilao: form.leilao,
        carroApp: form.carroApp === 'sim',
        motoTerceiros: form.danosTerceiros === 'sim',
        seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
        requires_human_support: true,
        human_support_reason: reason,
        ...tracking.utms,
        gclid: tracking.clickIds.gclid,
        fbclid: tracking.clickIds.fbclid,
        fbp: tracking.clickIds._fbp,
        fbc: tracking.clickIds._fbc,
      }),
    }).then(r => r.json()).then(data => {
      if (data.leadId) setLeadId(data.leadId)
    }).catch(() => {})
  }

  /** Cotação via PowerCRM (marca/ano/modelo) — fluxo único atual */
  async function handlePowerCrmQuote() {
    trackCotacaoInicio()
    setLoading(true)
    setApiError('')
    try {
      // POST /preco com IDs PowerCRM + codFipe pra pegar valor FIPE da Parallelum
      const precoRes = await fetch(`${API_BASE}/api/vehicle/powercrm/preco`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: pcTipo,
          brandId: fipeMarcaCode,
          brandText: fipeMarcaText,
          modelId: fipeModeloCode,
          modelText: fipeModeloText,
          year: fipeAnoCode,
          codFipe: fipeModeloCodFipe || null,
        }),
      })
      const data = await precoRes.json()

      if (!data.success) {
        if (data.requires_human_support) {
          triggerHumanSupport('fipe_indisponivel')
          return
        }
        setApiError(data.error || 'Não foi possível consultar a FIPE. Tente novamente.')
        return
      }

      const v = data.vehicle
      setVehicle(v)

      // Rate-limit: 3 veículos distintos por 7 dias (por device + IP). No 4º, abre
      // pop-up com WhatsApp em vez da simulação. Fail-open: erro de infra não bloqueia.
      try {
        const limitRes = await fetch(`${API_BASE}/api/vehicle/quote-limit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ marca: v.marca, modelo: v.modelo, ano: v.ano }),
        })
        const limitData = await limitRes.json().catch(() => ({ allowed: true }))
        if (limitData && limitData.allowed === false) {
          setLimitBlocked(true)
          setLoading(false)
          return
        }
      } catch {
        /* fail-open — segue a cotação normalmente */
      }

      const reason = getExclusionReason(v.marca, v.modelo, v.ano)
      if (reason) {
        setExclusionReason(reason)
        setExcluded(true)
        setStep(2)

        // Salva lead marcado como EXCLUIDO no Supabase + PowerCRM pra Letycia
        // ver e nao perder o contato. Backend trata `plano: 'EXCLUIDO'`.
        const tracking = getTrackingData()
        fetch(`${API_BASE}/api/vehicle/lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: form.nome,
            whatsapp: form.whatsapp,
            email: form.email || undefined,
            placa: form.placa || '',
            leilao: form.leilao,
            marca: v.marca,
            modelo: v.modelo,
            ano: v.ano,
            valorFipe: v.fipeValue,
            fipeCode: v.fipeCode,
            categoria: v.categoria,
            combustivel: v.combustivel,
            plano: 'EXCLUIDO',
            carroApp: form.carroApp === 'sim',
            motoTerceiros: form.danosTerceiros === 'sim',
            seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
            powercrmBrandId: data.powercrm?.brandId,
            powercrmModelId: data.powercrm?.modelId,
            powercrmYearId: data.powercrm?.yearId,
            ...tracking.utms,
            gclid: tracking.clickIds.gclid,
            fbclid: tracking.clickIds.fbclid,
            fbp: tracking.clickIds._fbp,
            fbc: tracking.clickIds._fbc,
          }),
        }).then(r => r.json()).then(d => {
          if (d.leadId) setLeadId(d.leadId)
        }).catch(() => {})
        return
      }

      // Calcula planos localmente pela tabela real (defesa em camada — bate com /preco)
      const localPlans = getApplicablePlans(
        v.fipeValue,
        v.categoria,
        v.combustivel,
        undefined,
        v.modelo,
      )

      if (localPlans.length === 0) {
        setApiError('Não encontramos planos para esse veículo. Fale com um consultor.')
        return
      }

      const isLeilao = form.leilao !== 'nao'
      const finalPlans = isLeilao
        ? localPlans.map(p => ({ ...p, monthly: Math.round(p.monthly * 0.8 * 100) / 100 }))
        : localPlans

      setPlans(finalPlans)
      const popularIdx = finalPlans.findIndex(p => p.popular)
      setSelectedPlanIdx(popularIdx >= 0 ? popularIdx : 0)
      setStep(2)

      const defaultPlan = finalPlans[popularIdx >= 0 ? popularIdx : 0]
      trackCotacaoCompleta({
        marca: v.marca,
        modelo: v.modelo,
        ano: v.ano,
        plano: defaultPlan.name,
        valorMensal: defaultPlan.monthly,
        valorFipe: v.fipeValue,
        email: form.email || undefined,
        phone: form.whatsapp || undefined,
      })

      // Salva lead (não bloqueia) — passa IDs PowerCRM já mapeados pra não adivinhar no backend
      const tracking = getTrackingData()
      fetch(`${API_BASE}/api/vehicle/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          whatsapp: form.whatsapp,
          email: form.email || undefined,
          placa: form.placa || '',
          leilao: form.leilao,
          marca: v.marca,
          modelo: v.modelo,
          ano: v.ano,
          valorFipe: v.fipeValue,
          fipeCode: v.fipeCode,
          categoria: v.categoria,
          combustivel: v.combustivel,
          plano: defaultPlan.name,
          valorMensal: defaultPlan.monthly,
          carroApp: form.carroApp === 'sim',
          motoTerceiros: form.danosTerceiros === 'sim',
          seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
          // IDs PowerCRM já mapeados — backend usa direto, sem adivinhar
          powercrmBrandId: data.powercrm?.brandId,
          powercrmModelId: data.powercrm?.modelId,
          powercrmYearId: data.powercrm?.yearId,
          ...tracking.utms,
          gclid: tracking.clickIds.gclid,
          fbclid: tracking.clickIds.fbclid,
          fbp: tracking.clickIds._fbp,
          fbc: tracking.clickIds._fbc,
        }),
      }).then(r => r.json()).then(d => {
        if (d.leadId) setLeadId(d.leadId)
      }).catch(() => {})
    } catch {
      setApiError('Falha ao consultar a tabela FIPE. Tente novamente ou fale com nosso consultor.')
    } finally {
      setLoading(false)
    }
  }

  async function next() {
    if (!validate()) return
    // Fluxo único: PowerCRM (marca/ano/modelo). Placa é opcional, vai junto se preenchida.
    await handlePowerCrmQuote()
  }

  const selectedPlan = plans[selectedPlanIdx] || null
  const planInfo = selectedPlan ? PLAN_INFO[selectedPlan.id as PlanId] : null
  // Carro de aplicativo: +R$ 20/mês na mensalidade (regra 21Go)
  const carroAppExtra = form.carroApp === 'sim' ? 20 : 0
  // Moto com Danos a Terceiros opcional: +R$ 22/mês (só planos de moto)
  const selIsMoto = selectedPlan?.id === 'moto-400' || selectedPlan?.id === 'moto-1000'
  const motoTerceirosExtra = form.danosTerceiros === 'sim' && selIsMoto ? 22 : 0
  const price = (selectedPlan?.monthly || 0) + carroAppExtra + motoTerceirosExtra
  const priceFormatted = formatPrice(price)
  // Benefícios exibidos: motos com Danos a Terceiros opcional ganham a linha extra.
  const planFeatures = planInfo
    ? motoTerceirosExtra > 0
      ? [...planInfo.features, { text: 'Danos a Terceiros', included: true }]
      : planInfo.features
    : []
  const vehicleLabel = vehicle
    ? `${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}`
    : ''
  const fipeFormatted = vehicle ? vehicle.fipeValue.toLocaleString('pt-BR') : '0'

  // REGRA OFICIAL 21Go (ver calcActivation em pricing.ts):
  //   - mensalidade CHEIA do plano de referencia + R$ 50 (carro e moto), piso R$ 249
  //   - BYD → R$ 1.550 fixo
  //   - A vista = valor cheio; 12x = valor + juros 22,11% / 12 (nunca sem juros)
  // SEMPRE VIP de referencia (nao depende do plano que o cliente selecionou).
  // Ordem de fallback quando nao ha VIP "puro" (moto/suv/especial usam o "VIP" deles).
  const vipOrder: PlanId[] = ['vip', 'suv', 'moto-1000', 'moto-400', 'especial', 'premium', 'do-seu-jeito', 'basico']
  const vipPlan = vipOrder.map((id) => plans.find((p) => p.id === id)).find((p) => !!p) || null
  const vipIsMoto = vipPlan?.id === 'moto-400' || vipPlan?.id === 'moto-1000'
  const vipMonthly = (vipPlan?.monthly || 0) + carroAppExtra
    + (form.danosTerceiros === 'sim' && vipIsMoto ? 22 : 0)
  const isBYD = (vehicle?.marca || '').trim().toUpperCase() === 'BYD'
  const taxaAtivacao = calcActivation(vipMonthly, isBYD)
  // A vista = valor cheio (VIP + R$50); 12x = valor + juros 22,11% / 12 (nunca sem juros).
  const ativacaoAvista = activationCashPrice(taxaAtivacao)
  const ativacaoParcela12x = activationInstallment12x(taxaAtivacao)
  const today = new Date()
  const dayOfMonth = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  let dueDate: Date
  if (dayOfMonth <= 15) {
    // Fechou até dia 15 → vence dia 10 do próximo mês
    dueDate = new Date(currentYear, currentMonth + 1, 10)
  } else {
    // Fechou do dia 16 pra frente → vence dia 20 do mês seguinte
    dueDate = new Date(currentYear, currentMonth + 1, 20)
  }
  const dueDateFormatted = `${String(dueDate.getDate()).padStart(2, '0')}/${String(dueDate.getMonth() + 1).padStart(2, '0')}/${dueDate.getFullYear()}`
  const discountPrice = Math.round(price * 0.95 * 100) / 100
  const discountFormatted = formatPrice(discountPrice)

  // Desconto adesivo no vidro traseiro (não se aplica a motos)
  // Regra oficial 21Go:
  //   VIP/Premium/SUV/Especial: até 30k FIPE = 10% | acima de 30k = 15%
  //   Do Seu Jeito/Básico:      até 60k FIPE = 10% | acima de 60k = 15%
  const fipeValue = vehicle?.fipeValue || 0
  const planId = selectedPlan?.id || ''
  const isMoto = planId === 'moto-400' || planId === 'moto-1000'
  const isVipOrPremium = planId === 'vip' || planId === 'premium' || planId === 'suv' || planId === 'especial'
  const stickerThreshold = isVipOrPremium ? 30000 : 60000
  const stickerPct = fipeValue > stickerThreshold ? 15 : 10
  const stickerPrice = Math.round(price * (1 - stickerPct / 100) * 100) / 100
  const stickerPriceFormatted = formatPrice(stickerPrice)
  // Adesivo + pontualidade combinados (não se substituem)
  const stickerPlusEarlyPrice = Math.round(stickerPrice * 0.95 * 100) / 100
  const stickerPlusEarlyFormatted = formatPrice(stickerPlusEarlyPrice)

  return (
    <div className="min-h-screen bg-[#F7F8FC] relative">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #293C82 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <div className="relative z-10">
        {/* Pop-up de limite atingido (3 veículos / 7 dias) — CTA WhatsApp */}
        {limitBlocked && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1120]/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-7 sm:p-8">
              <button
                onClick={() => setLimitBlocked(false)}
                aria-label="Fechar"
                className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-[#F2911D]/10 flex items-center justify-center mb-5">
                <Lock className="w-7 h-7 text-[#F2911D]" />
              </div>

              <h3 className="text-xl font-bold text-[#1A2754]">
                Limite de simulações atingido
              </h3>
              <p className="text-[#64748B] text-sm mt-2 leading-relaxed">
                Você já simulou 3 veículos. Para continuar e receber uma cotação
                personalizada com nossa consultora, fale com a gente no WhatsApp — o
                atendimento é rápido e sem compromisso.
              </p>

              <a
                href={`https://wa.me/5521969620781?text=${encodeURIComponent(
                  `Olá! Fiz algumas simulações no site e gostaria de continuar meu atendimento.${form.nome ? `\nNome: ${form.nome}` : ''}${form.whatsapp ? `\nWhatsApp: ${form.whatsapp}` : ''}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                data-track-origin="cotacao_limite_simulacoes"
                data-track-button-text="Falar com a consultora"
                className="flex items-center justify-center gap-2.5 w-full mt-6 py-4 bg-gradient-to-r from-[#10B981] to-[#059669] text-white font-bold text-base rounded-full shadow-lg shadow-[#10B981]/20 hover:shadow-xl hover:shadow-[#10B981]/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <MessageCircle className="w-5 h-5" />
                Falar com a consultora
              </a>

              <p className="text-center text-xs text-[#94A3B8] mt-4">
                Atendimento humano direto, sem robô.
              </p>
            </div>
          </div>
        )}

        {/* Stepper */}
        {step <= 1 && (
          <div className="pt-28 pb-8">
            <div className="max-w-sm mx-auto px-6">
              <div className="flex items-center justify-center gap-4">
                {STEPS.map((s, i) => {
                  const active = step > i
                  const current = step === i + 1
                  return (
                    <div key={s.num} className="flex items-center gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          current
                            ? 'bg-[#F2911D] text-white shadow-md shadow-[#F2911D]/20'
                            : active
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#E2E8F0] text-[#94A3B8]'
                        }`}>
                          {active && !current ? <Check className="w-4 h-4" /> : s.num}
                        </div>
                        <span className={`text-sm font-medium ${current ? 'text-[#1A2754]' : 'text-[#94A3B8]'}`}>
                          {s.label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="w-12 h-[2px] rounded-full bg-[#E2E8F0]">
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            active && !current ? 'w-full bg-[#10B981]' : 'w-0'
                          }`} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-20">

          {/* ── STEP 1: Formulário ── */}
          {step === 1 && (
            <div className="max-w-xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="font-[var(--font-display)] text-2xl md:text-3xl font-bold text-[#1A2754] mb-2">
                  Simulação Grátis
                </h1>
                <p className="text-[#64748B]">Preencha seus dados e descubra o valor em segundos.</p>
              </div>

              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-5 sm:p-8 md:p-10">
                <div className="space-y-5">
                  <PillInput
                    label="Nome completo"
                    name="nome"
                    value={form.nome}
                    error={errors.nome}
                    onChange={v => set('nome', v)}
                    placeholder="Seu nome completo"
                    disabled={loading}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <PillInput
                      label="WhatsApp"
                      name="whatsapp"
                      value={form.whatsapp}
                      error={errors.whatsapp}
                      onChange={v => set('whatsapp', maskPhone(v))}
                      placeholder="(21) 99999-9999"
                      icon={<MessageCircle className="w-4 h-4 text-[#25D366]" />}
                      disabled={loading}
                    />
                    <PillInput
                      label="E-mail (opcional)"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={v => set('email', v)}
                      placeholder="seu@email.com"
                      icon={<Mail className="w-4 h-4 text-[#94A3B8]" />}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-4 rounded-2xl border-2 border-[#D1DFFA] bg-[#F7F8FC]/60 p-4 sm:p-5">
                    <label className="block text-sm font-semibold text-[#1A2754]">Dados do veículo</label>

                    {/* Tipo do veículo — dropdown com setinha */}
                    <FipeSelect
                      label="Tipo do veículo"
                      value={fipeKind}
                      options={[
                        { code: 'carros', name: 'Carro / SUV' },
                        { code: 'motos', name: 'Moto' },
                      ]}
                      disabled={loading}
                      placeholder="Selecione o tipo"
                      onChange={code => {
                        setFipeKind(code as 'carros' | 'motos')
                        // Reset cadeia ao trocar tipo
                        setFipeMarcaCode('')
                        setFipeMarcaText('')
                        setFipeModeloCode('')
                        setFipeModeloText('')
                        setFipeModeloCodFipe('')
                        setFipeAnoCode('')
                      }}
                    />

                    {/* Marca do veículo */}
                    <FipeSelect
                      label="Marca do veículo"
                      value={fipeMarcaCode}
                      options={fipeMarcas}
                      loading={fipeLoadingMarcas}
                      disabled={loading || fipeLoadingMarcas}
                      error={errors.fipeMarca}
                      placeholder={fipeLoadingMarcas ? 'Carregando marcas...' : 'Selecione a marca'}
                      onChange={code => {
                        setFipeMarcaCode(code)
                        const hit = fipeMarcas.find(m => m.code === code)
                        setFipeMarcaText(hit?.name || '')
                        // Reset Ano e Modelo (Modelo depende de Marca+Ano)
                        setFipeAnoCode('')
                        setFipeModeloCode('')
                        setFipeModeloText('')
                        setFipeModeloCodFipe('')
                        setErrors(prev => ({ ...prev, fipeMarca: '' }))
                      }}
                    />

                    {/* Ano do modelo — vem ANTES de modelo (PowerCRM filtra modelos por ano) */}
                    <FipeSelect
                      label="Ano do modelo"
                      value={fipeAnoCode}
                      options={fipeAnos}
                      loading={fipeLoadingAnos}
                      disabled={loading || !fipeMarcaCode || fipeLoadingAnos}
                      error={errors.fipeAno}
                      placeholder={
                        !fipeMarcaCode
                          ? 'Escolha a marca primeiro'
                          : fipeLoadingAnos
                            ? 'Carregando anos...'
                            : 'Selecione o ano do modelo'
                      }
                      onChange={code => {
                        setFipeAnoCode(code)
                        setFipeModeloCode('')
                        setFipeModeloText('')
                        setFipeModeloCodFipe('')
                        setErrors(prev => ({ ...prev, fipeAno: '' }))
                      }}
                    />

                    {/* Modelo — depende de Marca + Ano */}
                    <FipeSelect
                      label="Modelo"
                      value={fipeModeloCode}
                      options={fipeModelos}
                      loading={fipeLoadingModelos}
                      disabled={loading || !fipeMarcaCode || !fipeAnoCode || fipeLoadingModelos}
                      error={errors.fipeModelo}
                      placeholder={
                        !fipeMarcaCode || !fipeAnoCode
                          ? 'Escolha marca e ano primeiro'
                          : fipeLoadingModelos
                            ? 'Carregando modelos...'
                            : 'Selecione o modelo'
                      }
                      onChange={code => {
                        setFipeModeloCode(code)
                        const hit = fipeModelos.find(m => m.code === code) as FipeItem & { codFipe?: string | null } | undefined
                        setFipeModeloText(hit?.name || '')
                        setFipeModeloCodFipe(hit?.codFipe || '')
                        setErrors(prev => ({ ...prev, fipeModelo: '' }))
                      }}
                    />

                    {/* Placa OPCIONAL — não bloqueia cotação */}
                    <div>
                      <PillInput
                        label="Placa do veículo (opcional)"
                        name="placa"
                        value={form.placa}
                        error={errors.placa}
                        onChange={v => set('placa', maskPlaca(v))}
                        placeholder="ABC1D23 — deixe em branco se não souber"
                        mono
                        disabled={loading}
                      />
                    </div>

                    <p className="text-[11px] text-[#94A3B8] leading-snug pt-1">
                      Valor estimado pela tabela FIPE. O consultor confirma o valor final com a placa real.
                    </p>
                  </div>

                  {/* Leilão / Remarcado */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A2754] mb-2">Veículo de leilão ou remarcado?</label>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: 'nao', label: 'Não' },
                        { value: 'leilao', label: 'Leilão' },
                        { value: 'remarcado', label: 'Remarcado' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={loading}
                          onClick={() => set('leilao', opt.value)}
                          className={`py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                            form.leilao === opt.value
                              ? 'border-[#293C82] bg-[#293C82]/10 text-[#293C82] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#293C82]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.leilao !== 'nao' && (
                      <p className="mt-2 text-xs text-[#F2911D] font-medium">
                        Indenização: 80% da tabela FIPE
                      </p>
                    )}
                  </div>

                  {/* Carro de aplicativo */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A2754] mb-2">É carro de aplicativo (Uber, 99, etc.)?</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'nao', label: 'Não' },
                        { value: 'sim', label: 'Sim' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={loading}
                          onClick={() => set('carroApp', opt.value)}
                          className={`py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                            form.carroApp === opt.value
                              ? 'border-[#293C82] bg-[#293C82]/10 text-[#293C82] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#293C82]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Danos a Terceiros (motos) */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A2754] mb-2">Se for moto: incluir Danos a Terceiros?</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'nao', label: 'Não' },
                        { value: 'sim', label: 'Sim (+R$22/mês)' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={loading}
                          onClick={() => set('danosTerceiros', opt.value)}
                          className={`py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                            form.danosTerceiros === opt.value
                              ? 'border-[#293C82] bg-[#293C82]/10 text-[#293C82] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#293C82]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[#64748B]">Cobertura opcional, válida apenas para motos.</p>
                  </div>

                  {/* Seguro atual */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A2754] mb-2">Esse carro possui seguro ou proteção?</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'nao', label: 'Não' },
                        { value: 'sim', label: 'Sim' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            set('temSeguro', opt.value)
                            if (opt.value === 'nao') set('nomeSeguro', '')
                          }}
                          className={`py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                            form.temSeguro === opt.value
                              ? 'border-[#293C82] bg-[#293C82]/10 text-[#293C82] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#293C82]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.temSeguro === 'sim' && (
                      <div className="mt-3">
                        <PillInput
                          label="Qual o seguro ou proteção?"
                          name="nomeSeguro"
                          value={form.nomeSeguro}
                          onChange={v => set('nomeSeguro', v)}
                          placeholder="Ex: Porto Seguro, Allianz, Proteção Itamaraty..."
                          disabled={loading}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* API Error */}
                {apiError && (
                  <div className="mt-5 flex items-start gap-3 p-4 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{apiError}</p>
                      <p className="text-[#DC2626]/70 mt-1">
                        Verifique a placa ou{' '}
                        <a
                          href="https://wa.me/5521969620781?text=Olá! Preciso de ajuda com uma simulação."
                          target="_blank"
                          rel="noopener noreferrer"
                          data-track-origin="cotacao_erro_placa"
                          data-track-button-text="fale no WhatsApp"
                          className="underline font-medium"
                        >
                          fale no WhatsApp
                        </a>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Atendimento humano — aparece quando PowerCRM + API Brasil + Parallelum falham */}
                {requiresHumanSupport && (
                  <div className="mt-6 p-6 rounded-2xl bg-[#FFFBF5] border-2 border-[#F2911D]/30">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#F2911D]/10 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-[#F2911D]" />
                      </div>
                      <div>
                        <p className="font-bold text-[#1A2754] text-base">Vamos finalizar pelo WhatsApp</p>
                        <p className="text-[#64748B] text-sm mt-1">
                          {humanSupportReason === 'fipe_indisponivel'
                            ? 'Identificamos seu veículo, mas a tabela FIPE não retornou o valor agora. Nosso consultor vai conferir e te passar a cotação personalizada na hora.'
                            : 'Não conseguimos consultar a sua placa automaticamente. Fale com nosso consultor agora pra fazer sua simulação personalizada.'}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`https://wa.me/5521969620781?text=${encodeURIComponent(
                        `Olá! Tentei fazer uma simulação no site e não consegui. Pode me ajudar?\n\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}${form.placa ? `\nPlaca: ${form.placa}` : ''}${form.email ? `\nE-mail: ${form.email}` : ''}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-track-origin="cotacao_fallback_humano"
                      data-track-button-text="Falar com consultor agora"
                      className="flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#10B981] to-[#059669] text-white font-bold text-base rounded-full shadow-lg shadow-[#10B981]/20 hover:shadow-xl hover:shadow-[#10B981]/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                    >
                      <MessageCircle className="w-5 h-5" />
                      Falar com consultor agora
                    </a>

                    <p className="text-center text-xs text-[#94A3B8] mt-3">
                      Atendimento humano direto, sem robô.
                    </p>
                  </div>
                )}

                {!requiresHumanSupport && (
                <div className="flex justify-center mt-10">
                  <button onClick={next} disabled={loading}
                    className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold text-base rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:shadow-[#F2911D]/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100">
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Consultando veículo...
                      </>
                    ) : (
                      <>
                        Ver Simulação
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
                )}

                <div className="flex items-center justify-center gap-2 mt-6 text-xs text-[#94A3B8]">
                  <Lock className="w-3.5 h-3.5" />
                  Seus dados estão seguros. Sem spam.
                </div>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-xs text-[#94A3B8]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#293C82]" />
                  <span>Cadastrada na SUSEP</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#F2911D]" />
                  <span>20+ anos de mercado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#10B981]" />
                  <span>Sem análise de perfil</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Veículo Excluído (modelo fora da lista OU ano antigo) ── */}
          {step === 2 && excluded && vehicle && (
            <div className="max-w-lg mx-auto pt-28">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-6 sm:p-10 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFF7ED] mb-6">
                  <AlertCircle className="w-8 h-8 text-[#F2911D]" />
                </div>

                <h2 className="font-[var(--font-display)] text-xl md:text-2xl font-bold text-[#1A2754] mb-3">
                  Obrigado pelo seu interesse, {form.nome.split(' ')[0]}!
                </h2>

                <p className="text-[#64748B] text-sm mb-2">
                  Identificamos seu veículo:
                </p>
                <p className="font-semibold text-[#1A2754] text-base mb-5">
                  {vehicle.marca} {vehicle.modelo} {vehicle.ano}
                </p>

                <p className="text-[#64748B] text-sm mb-3 leading-relaxed">
                  Infelizmente, no momento, <span className="font-semibold text-[#1A2754]">não estamos aceitando esse veículo</span> para proteção.
                </p>
                <p className="text-[#64748B] text-sm mb-8 leading-relaxed">
                  Mas <span className="font-semibold text-[#10B981]">guardamos o seu contato com cuidado</span>. Assim que voltarmos a aceitar esse {exclusionReason === 'year' ? 'ano' : 'modelo'}, nós entraremos em contato com você para apresentar a melhor proposta.
                </p>

                <div className="bg-[#F0FDF4] border border-[#10B981]/20 rounded-2xl p-4 mb-6 text-left">
                  <p className="text-xs text-[#10B981] font-bold uppercase tracking-wider mb-1">Contato salvo</p>
                  <p className="text-sm text-[#1A2754] font-medium">{form.nome}</p>
                  <p className="text-xs text-[#64748B]">{form.whatsapp}{form.email ? ` · ${form.email}` : ''}</p>
                </div>

                <button
                  onClick={() => {
                    setStep(1)
                    setExcluded(false)
                    setVehicle(null)
                    setPlans([])
                    setForm({ nome: '', whatsapp: '', email: '', placa: '', leilao: 'nao', carroApp: 'nao', danosTerceiros: 'nao', temSeguro: 'nao', nomeSeguro: '' })
                  }}
                  className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A2754] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Simular outro veículo
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Resultado ── */}
          {step === 2 && !excluded && vehicle && plans.length > 0 && selectedPlan && (
            <div className="max-w-5xl mx-auto pt-28">
              {/* Header */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#10B981]/10 mb-4">
                  <ShieldCheck className="w-7 h-7 text-[#10B981]" />
                </div>
                <h2 className="font-[var(--font-display)] text-2xl md:text-3xl font-bold text-[#1A2754] mb-2">
                  {form.nome.split(' ')[0]}, sua simulação está pronta!
                </h2>
                <p className="text-[#64748B]">
                  {vehicleLabel}
                  {vehicle.cor ? ` · ${vehicle.cor}` : ''}
                  {' · '}FIPE: R$ {fipeFormatted}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">
                {/* Coberturas */}
                <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-4 sm:p-6 md:p-8">
                  {/* Plan tabs */}
                  <div className={`flex gap-1 bg-[#F0F4FA] rounded-2xl p-1.5 mb-6 sm:mb-8 ${plans.length > 4 ? 'flex-wrap' : ''}`}>
                    {plans.map((plan, idx) => (
                      <button key={plan.id} onClick={() => setSelectedPlanIdx(idx)}
                        className={`relative flex-1 min-w-[70px] sm:min-w-[100px] py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                          selectedPlanIdx === idx
                            ? 'bg-white text-[#1A2754] shadow-md'
                            : 'text-[#64748B] hover:text-[#1A2754]'
                        }`}>
                        {plan.name}
                        {plan.popular && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#F2911D] bg-[#F2911D]/10 px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                            Mais escolhido
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Coberturas toggle */}
                  <button onClick={() => setShowCoberturas(!showCoberturas)}
                    className="flex items-center justify-between w-full mb-5 text-[#1A2754] font-semibold text-sm">
                    Benefícios incluídos
                    {showCoberturas ? <ChevronUp className="w-4 h-4 text-[#94A3B8]" /> : <ChevronDown className="w-4 h-4 text-[#94A3B8]" />}
                  </button>

                  {showCoberturas && planInfo && (
                    <ul className="space-y-3.5">
                      {planFeatures.map(c => (
                        <li key={c.text} className="flex items-center gap-3">
                          {c.included
                            ? <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0"><Check className="w-3.5 h-3.5 text-[#10B981]" /></div>
                            : <div className="w-6 h-6 rounded-full bg-[#F0F4FA] flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-[#CBD5E1]" /></div>}
                          <span className={`text-sm ${c.included ? 'text-[#1A2754] font-medium' : 'text-[#CBD5E1] line-through'}`}>{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Preço / CTA */}
                <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-4 sm:p-6 md:p-8 h-fit lg:sticky lg:top-28">
                  <div className="text-center mb-6">
                    <p className="text-sm text-[#64748B] mb-1">Plano {selectedPlan.name}</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-lg text-[#64748B] font-medium">R$</span>
                      <span className="font-[var(--font-display)] text-5xl font-bold text-[#1A2754] leading-none">{priceFormatted}</span>
                      <span className="text-lg text-[#64748B] font-medium">/mês</span>
                    </div>
                  </div>

                  <div className="border-t border-[#E8ECF4] pt-4 mb-6 space-y-4 text-sm">
                    {/* ATIVAÇÃO — Pagamento único do plano (cartão à vista ou 12x) */}
                    <div className="bg-[#FFF7ED] border border-[#F2911D]/20 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-[#1A2754]">Ativação</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#F2911D] bg-[#F2911D]/10 px-2 py-0.5 rounded-full">Pagamento único</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-[#64748B] font-semibold">À vista no cartão</span>
                          <span className="font-extrabold text-[#F2911D] text-xl">R$ {formatPrice(ativacaoAvista)}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-[#64748B] font-semibold">ou 12x de</span>
                          <span className="font-extrabold text-[#10B981] text-xl">R$ {formatPrice(ativacaoParcela12x)}</span>
                        </div>
                      </div>
                      <p className="text-[13px] text-[#DC2626] font-extrabold mt-2.5 leading-tight">
                        Pagamento único de ativação do plano
                      </p>
                    </div>

                    {/* 1º PAGAMENTO — Mensalidade com desconto */}
                    <div className="bg-[#F0FDF4] border border-[#10B981]/20 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-[#1A2754]">1º pagamento</span>
                        <span className="text-xs text-[#64748B]">vencimento até {dueDateFormatted}</span>
                      </div>
                      <div className="flex items-baseline justify-end gap-2 mt-1">
                        <span className="text-sm text-[#94A3B8] line-through">R$ {priceFormatted}</span>
                        <span className="font-extrabold text-[#10B981] text-2xl">R$ {discountFormatted}</span>
                      </div>
                      <p className="text-xs text-[#10B981] font-semibold mt-1.5 text-right">5% de desconto pagando antes do vencimento</p>
                    </div>
                  </div>

                  {/* Desconto Adesivo (não aparece para motos) */}
                  {!isMoto && (
                  <div className="mb-6">
                    <div className="rounded-[20px] border-2 border-[#F2911D] bg-white p-4 sm:p-5">
                        {/* Header com toggle */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-9 h-9 rounded-xl bg-[#F2911D]/10 flex items-center justify-center flex-shrink-0">
                            <Car className="w-5 h-5 text-[#F2911D]" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-[#1A2754] text-sm leading-tight">Desconto Adesivo 21Go</p>
                            <p className="text-[10px] text-[#64748B]">Adesivo no vidro traseiro</p>
                          </div>
                          <span className="bg-[#F2911D] text-white text-xs font-extrabold px-2.5 py-1 rounded-full shadow-sm shadow-[#F2911D]/20">
                            -{stickerPct}%
                          </span>
                        </div>

                        {/* Toggle aceitar/recusar */}
                        <div className="flex items-center gap-3 mb-4">
                          <button
                            onClick={() => setStickerAccepted(true)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                              stickerAccepted
                                ? 'bg-[#F2911D] text-white shadow-md shadow-[#F2911D]/20'
                                : 'bg-[#F7F8FC] text-[#94A3B8] border border-[#E2E8F0] hover:border-[#F2911D]/40'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 inline mr-1" />
                            Quero o desconto
                          </button>
                          <button
                            onClick={() => setStickerAccepted(false)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                              !stickerAccepted
                                ? 'bg-[#64748B] text-white shadow-md'
                                : 'bg-[#F7F8FC] text-[#94A3B8] border border-[#E2E8F0] hover:border-[#64748B]/40'
                            }`}
                          >
                            <X className="w-3.5 h-3.5 inline mr-1" />
                            Sem adesivo
                          </button>
                        </div>

                        {/* Valores — aparece se aceitou */}
                        {stickerAccepted ? (
                          <div className="bg-[#FFF7ED] rounded-xl p-3.5 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-[#64748B] font-medium">Com adesivo</span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xs text-[#94A3B8] line-through">R$ {priceFormatted}</span>
                                <span className="font-extrabold text-[#F2911D] text-xl">R$ {stickerPriceFormatted}</span>
                              </div>
                            </div>
                            <div className="h-px bg-[#F2911D]/10" />
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-[#10B981]" />
                                <span className="text-xs text-[#64748B] font-medium">Adesivo + em dia</span>
                              </div>
                              <span className="font-extrabold text-[#10B981] text-xl">R$ {stickerPlusEarlyFormatted}</span>
                            </div>
                            <p className="text-[10px] text-[#94A3B8] text-center pt-1">
                              Descontos acumuláveis: adesivo ({stickerPct}%) + pontualidade (5%)
                            </p>
                          </div>
                        ) : (
                          <div className="bg-[#F7F8FC] rounded-xl p-3.5 text-center">
                            <p className="text-xs text-[#94A3B8]">
                              Você pode ativar o desconto a qualquer momento!
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                  )}

                  <a href={`https://wa.me/5521969620781?text=${encodeURIComponent(`Olá! Fiz uma simulação no site.\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}${form.email ? `\nE-mail: ${form.email}` : ''}\nPlaca: ${form.placa}${form.leilao !== 'nao' ? `\nOrigem: ${form.leilao === 'leilao' ? 'Leilão' : 'Remarcado'}` : ''}${form.carroApp === 'sim' ? `\nCarro de aplicativo: Sim (Uber/99)` : ''}${motoTerceirosExtra > 0 ? `\nDanos a Terceiros (moto): Sim (+R$ 22/mês)` : ''}${form.temSeguro === 'sim' ? `\nSeguro/proteção atual: ${form.nomeSeguro.trim() || 'Sim (não informado)'}` : ''}\nVeículo: ${vehicleLabel}\nFIPE: R$ ${fipeFormatted}\nPlano: ${selectedPlan.name}\nMensalidade: R$ ${priceFormatted}/mês\nAtivação: R$ ${formatPrice(ativacaoAvista)} à vista no cartão ou 12x de R$ ${formatPrice(ativacaoParcela12x)}\nQuero contratar!`)}`}
                    target="_blank" rel="noopener noreferrer"
                    data-track-origin="cotacao_resultado"
                    data-track-button-text="Contratar pelo WhatsApp"
                    onClick={() => {
                      // whatsapp_click vem do WhatsAppTracker global (event delegation).
                      // Aqui mantemos só lógicas extras do botão de contratação.
                      trackPedidoOrcamento({
                        plano: selectedPlan.name,
                        valor: price,
                        marca: vehicle?.marca,
                        modelo: vehicle?.modelo,
                        ano: vehicle?.ano,
                      })
                      notifyWhatsAppClick()
                    }}
                    className="flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold text-base rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:shadow-[#F2911D]/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 mb-4">
                    <MessageCircle className="w-5 h-5" />
                    Contratar pelo WhatsApp
                  </a>

                  <div className="flex items-center justify-center gap-2 text-xs text-[#94A3B8]">
                    <Lock className="w-3.5 h-3.5" />
                    SUSEP · LC 213/2025
                  </div>
                </div>
              </div>

              {/* Voltar */}
              <div className="mt-10 flex justify-center gap-6">
                <button onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A2754] transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Editar dados
                </button>
                <button onClick={() => { setStep(1); setForm({ nome: '', whatsapp: '', email: '', placa: '', leilao: 'nao', carroApp: 'nao', danosTerceiros: 'nao', temSeguro: 'nao', nomeSeguro: '' }); setVehicle(null); setPlans([]); setRequiresHumanSupport(false); setExcluded(false); setFipeMarcaCode(''); setFipeMarcaText(''); setFipeModeloCode(''); setFipeModeloText(''); setFipeModeloCodFipe(''); setFipeAnoCode(''); whatsappClicked.current = false }}
                  className="text-sm text-[#293C82] hover:text-[#3D72DE] transition-colors">
                  Nova simulação
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

/* ─── Pill Input (estilo Loovi) ─── */
function PillInput({ label, name, value, error, onChange, placeholder, type = 'text', mono, icon, disabled }: {
  label: string; name: string; value: string; error?: string;
  onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
  icon?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold text-[#1A2754] mb-2">{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute left-5 top-1/2 -translate-y-1/2">
            {icon}
          </div>
        )}
        <input
          id={name}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full ${icon ? 'pl-12' : 'px-5'} pr-5 py-4 rounded-2xl border-2 text-[#1A2754] text-[15px] font-medium placeholder:text-[#94A3B8] bg-[#F7F8FC] focus:outline-none focus:border-[#293C82] focus:bg-white focus:shadow-[0_0_0_3px_rgba(41, 60, 130,0.1)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-[#EF4444] bg-[#FEF2F2] shadow-[0_0_0_3px_rgba(239,68,68,0.08)]' : 'border-[#D1DFFA] hover:border-[#293C82]/40'
          } ${mono ? 'font-mono tracking-[0.15em] text-lg' : ''}`}
        />
      </div>
      {error && <p className="mt-1.5 ml-4 text-xs text-[#EF4444] font-medium">{error}</p>}
    </div>
  )
}

/* ─── Select FIPE (com busca nativa do browser) ─── */
function FipeSelect({
  label, value, options, onChange, placeholder, disabled, loading, error,
}: {
  label: string
  value: string
  options: FipeItem[]
  onChange: (code: string) => void
  placeholder: string
  disabled?: boolean
  loading?: boolean
  error?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] mb-2">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full appearance-none pl-4 pr-10 py-3.5 rounded-xl border-2 bg-white text-[#1A2754] text-[14px] font-medium focus:outline-none focus:border-[#293C82] focus:shadow-[0_0_0_3px_rgba(41, 60, 130,0.1)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
            error ? 'border-[#EF4444]' : 'border-[#D1DFFA] hover:border-[#293C82]/40'
          }`}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.code} value={opt.code}>{opt.name}</option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading
            ? <Loader2 className="w-4 h-4 text-[#94A3B8] animate-spin" />
            : <ChevronDown className="w-4 h-4 text-[#94A3B8]" />}
        </div>
      </div>
      {error && <p className="mt-1.5 ml-1 text-xs text-[#EF4444] font-medium">{error}</p>}
    </div>
  )
}
