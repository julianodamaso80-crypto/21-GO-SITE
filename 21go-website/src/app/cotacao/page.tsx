'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { trackCotacaoInicio, trackCotacaoCompleta, trackWhatsAppClick, getTrackingData } from '@/lib/tracking'
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
} from '@/data/pricing'
import { shouldBlockQuote } from '@/data/vehicle-exclusions'
import ElectricBorder from '@/components/ui/ElectricBorder'

/* ─── Types ─── */
interface FormData {
  nome: string
  whatsapp: string
  email: string
  placa: string
  leilao: 'nao' | 'leilao' | 'remarcado'
  carroApp: 'nao' | 'sim'
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

  // Excluded vehicle state
  const [excluded, setExcluded] = useState(false)

  // Adesivo toggle
  const [stickerAccepted, setStickerAccepted] = useState(true)

  // Atendimento humano: quando PowerCRM + API Brasil + Parallelum falham
  // ou quando o veículo não retorna FIPE confiável. Cliente é direcionado
  // pro WhatsApp da consultora (5521980214882) com dados pré-preenchidos.
  const [requiresHumanSupport, setRequiresHumanSupport] = useState(false)
  const [humanSupportReason, setHumanSupportReason] = useState<'fipe_indisponivel' | 'consulta_falhou' | 'manual'>('consulta_falhou')

  // Fluxo "não tenho a placa" — busca FIPE por marca/modelo/ano
  const [searchMode, setSearchMode] = useState<'placa' | 'modelo'>('placa')
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

  const [form, setForm] = useState<FormData>({
    nome: '',
    whatsapp: '',
    email: '',
    placa: '',
    leilao: 'nao',
    carroApp: 'nao',
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
    if (searchMode === 'placa') {
      if (form.placa.length < 7) e.placa = 'Placa incompleta'
    } else {
      if (!fipeMarcaCode) e.fipeMarca = 'Escolha a marca'
      if (!fipeModeloCode) e.fipeModelo = 'Escolha o modelo'
      if (!fipeAnoCode) e.fipeAno = 'Escolha o ano'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function fetchVehicle(placa: string, whatsapp: string): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const res = await fetch(
        `${API_BASE}/api/vehicle/plate/${placa}?whatsapp=${encodeURIComponent(whatsapp)}`,
        { signal: controller.signal },
      )
      clearTimeout(timeout)
      return await res.json()
    } catch {
      clearTimeout(timeout)
      throw new Error('network')
    }
  }

  /* ─── FIPE Lookup (sem placa) ─── */
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

  // Carrega marcas quando entra no modo "modelo" ou troca tipo (carro/moto)
  useEffect(() => {
    if (searchMode !== 'modelo') return
    let cancelled = false
    setFipeLoadingMarcas(true)
    setApiError('')
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/fipe/marcas?tipo=${fipeKind}`,
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
  }, [searchMode, fipeKind])

  // Carrega modelos quando marca é selecionada
  useEffect(() => {
    if (!fipeMarcaCode) { setFipeModelos([]); return }
    let cancelled = false
    setFipeLoadingModelos(true)
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/fipe/modelos?tipo=${fipeKind}&marca=${encodeURIComponent(fipeMarcaCode)}`,
    )
      .then(res => {
        if (cancelled) return
        if (res.success && res.data) setFipeModelos(res.data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFipeLoadingModelos(false) })
    return () => { cancelled = true }
  }, [fipeMarcaCode, fipeKind])

  // Carrega anos quando modelo é selecionado
  useEffect(() => {
    if (!fipeModeloCode || !fipeMarcaCode) { setFipeAnos([]); return }
    let cancelled = false
    setFipeLoadingAnos(true)
    fetchFipe<{ success: boolean; data?: FipeItem[]; error?: string }>(
      `/api/vehicle/fipe/anos?tipo=${fipeKind}&marca=${encodeURIComponent(fipeMarcaCode)}&modelo=${encodeURIComponent(fipeModeloCode)}`,
    )
      .then(res => {
        if (cancelled) return
        if (res.success && res.data) setFipeAnos(res.data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFipeLoadingAnos(false) })
    return () => { cancelled = true }
  }, [fipeModeloCode, fipeMarcaCode, fipeKind])

  function switchToPlaca() {
    setSearchMode('placa')
    setApiError('')
    setRequiresHumanSupport(false)
  }

  function switchToModelo() {
    setSearchMode('modelo')
    setApiError('')
    setRequiresHumanSupport(false)
    setErrors(prev => ({ ...prev, placa: '' }))
    // Reset encadeamento
    setFipeMarcaCode('')
    setFipeModeloCode('')
    setFipeAnoCode('')
    setFipeModelos([])
    setFipeAnos([])
  }

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

  /** Cotação via FIPE (sem placa) — marca/modelo/ano */
  async function handleFipeQuote() {
    trackCotacaoInicio()
    setLoading(true)
    setApiError('')
    try {
      const data = await fetchFipe<any>(
        `/api/vehicle/fipe/preco?tipo=${fipeKind}&marca=${encodeURIComponent(fipeMarcaCode)}&modelo=${encodeURIComponent(fipeModeloCode)}&ano=${encodeURIComponent(fipeAnoCode)}`,
      )
      if (!data.success || !data.vehicle) {
        setApiError(data.error || 'Não foi possível consultar a FIPE. Tente novamente.')
        return
      }

      const v = data.vehicle
      setVehicle(v)

      if (shouldBlockQuote(v.marca, v.modelo, v.ano)) {
        setExcluded(true)
        setStep(2)
        return
      }

      // Calcula planos localmente pela tabela real
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

      // Salva lead (não bloqueia)
      const tracking = getTrackingData()
      fetch(`${API_BASE}/api/vehicle/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          whatsapp: form.whatsapp,
          email: form.email || undefined,
          placa: '',
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
          seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
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
      setApiError('Falha ao consultar a tabela FIPE. Tente novamente ou use a busca por placa.')
    } finally {
      setLoading(false)
    }
  }

  async function next() {
    if (!validate()) return

    // Modo "sem placa" — vai direto pro FIPE
    if (searchMode === 'modelo') {
      await handleFipeQuote()
      return
    }

    trackCotacaoInicio()
    setLoading(true)
    setApiError('')

    try {
      const data = await fetchVehicle(form.placa, form.whatsapp)

      if (data.success) {
        const v = data.vehicle

        // GUARD ABSOLUTO: NUNCA prossegue com fipeValue <= 0.
        // Cliente vai pra atendimento humano (sem chutar valor manualmente).
        if (!v.fipeValue || v.fipeValue <= 0) {
          console.warn('[cotacao] FIPE indisponivel pra placa', form.placa, '— atendimento humano')
          triggerHumanSupport('fipe_indisponivel')
          return
        }

        setVehicle(v)

        // Verifica se o veiculo esta na lista de exclusao
        if (shouldBlockQuote(v.marca, v.modelo, v.ano)) {
          setExcluded(true)
          setStep(2)
          // Salvar lead como excluido
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
              marca: v.marca,
              modelo: v.modelo,
              ano: v.ano,
              valorFipe: v.fipeValue,
              plano: 'EXCLUIDO',
              valorMensal: 0,
              carroApp: form.carroApp === 'sim',
              seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
              ...tracking.utms,
              gclid: tracking.clickIds.gclid,
              fbclid: tracking.clickIds.fbclid,
              fbp: tracking.clickIds._fbp,
              fbc: tracking.clickIds._fbc,
            }),
          }).catch(() => {})
          return
        }

        // SEMPRE calcula precos localmente pela tabela real
        const localPlans = getApplicablePlans(
          v.fipeValue,
          v.categoria,
          v.combustivel,
          v.cilindrada,
          v.modelo,
        )

        if (localPlans.length === 0) {
          setApiError('Não encontramos planos para esse veículo. Fale com um consultor.')
          return
        }

        // Leilão ou remarcado: cobra 80% do valor da tabela
        const isLeilao = form.leilao !== 'nao'
        const finalPlans = isLeilao
          ? localPlans.map(p => ({ ...p, monthly: Math.round(p.monthly * 0.8 * 100) / 100 }))
          : localPlans

        setPlans(finalPlans)
        const popularIdx = localPlans.findIndex(p => p.popular)
        setSelectedPlanIdx(popularIdx >= 0 ? popularIdx : 0)
        setStep(2)

        const defaultPlan = localPlans[popularIdx >= 0 ? popularIdx : 0]
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

        // Salvar lead no banco (não bloqueia a UI)
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
            marca: v.marca,
            modelo: v.modelo,
            ano: v.ano,
            valorFipe: v.fipeValue,
            plano: defaultPlan.name,
            valorMensal: defaultPlan.monthly,
            carroApp: form.carroApp === 'sim',
            seguroAtual: form.temSeguro === 'sim' ? (form.nomeSeguro.trim() || 'Sim (não informado)') : undefined,
            ...tracking.utms,
            gclid: tracking.clickIds.gclid,
            fbclid: tracking.clickIds.fbclid,
            fbp: tracking.clickIds._fbp,
            fbc: tracking.clickIds._fbc,
          }),
        }).then(r => r.json()).then(data => {
          if (data.leadId) setLeadId(data.leadId)
        }).catch(() => {})
      } else {
        // PowerCRM/API Brasil/Parallelum falharam OU placa nao encontrada.
        // Cliente nao preenche nada manualmente — vai pra atendimento humano.
        const reason = data.requires_human_support ? 'fipe_indisponivel' : 'consulta_falhou'
        triggerHumanSupport(reason)
        setApiError('')
      }
    } catch {
      // Timeout ou erro de rede — atendimento humano
      triggerHumanSupport('consulta_falhou')
      setApiError('')
    } finally {
      setLoading(false)
    }
  }

  const selectedPlan = plans[selectedPlanIdx] || null
  const planInfo = selectedPlan ? PLAN_INFO[selectedPlan.id as PlanId] : null
  // Carro de aplicativo: +R$ 20/mês na mensalidade (regra 21Go)
  const carroAppExtra = form.carroApp === 'sim' ? 20 : 0
  const price = (selectedPlan?.monthly || 0) + carroAppExtra
  const priceFormatted = formatPrice(price)
  const vehicleLabel = vehicle
    ? `${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}`
    : ''
  const fipeFormatted = vehicle ? vehicle.fipeValue.toLocaleString('pt-BR') : '0'

  // Lógica de pagamento: Ativação (cartão) + 1º pagamento (mensalidade com desconto 5%)
  const taxaAtivacao = 399

  /* Mercado Pago — gross-up pra receber o valor liquido na hora.
   * Taxas estimadas conservadoras (recebimento imediato no cartao):
   *   - 1x a vista: 4,98%
   *   - 12x parcelado: 11% (margem segura sobre a faixa tipica 8,99%-13%)
   * Atualizar quando tivermos os numeros reais do painel da conta.
   */
  const MP_FEE_AVISTA = 0.0498
  const MP_FEE_12X = 0.11
  const ativacaoAvista = taxaAtivacao / (1 - MP_FEE_AVISTA)
  const ativacaoTotal12x = taxaAtivacao / (1 - MP_FEE_12X)
  const ativacaoParcela12x = ativacaoTotal12x / 12
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
        backgroundImage: `radial-gradient(circle at 1px 1px, #375191 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <div className="relative z-10">
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
                            ? 'bg-[#F7963D] text-white shadow-md shadow-[#F7963D]/20'
                            : active
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#E2E8F0] text-[#94A3B8]'
                        }`}>
                          {active && !current ? <Check className="w-4 h-4" /> : s.num}
                        </div>
                        <span className={`text-sm font-medium ${current ? 'text-[#121A33]' : 'text-[#94A3B8]'}`}>
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
                <h1 className="font-[var(--font-display)] text-2xl md:text-3xl font-bold text-[#121A33] mb-2">
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
                  {searchMode === 'placa' ? (
                    <div>
                      <PillInput
                        label="Placa do Veículo"
                        name="placa"
                        value={form.placa}
                        error={errors.placa}
                        onChange={v => set('placa', maskPlaca(v))}
                        placeholder="ABC1D23"
                        mono
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={switchToModelo}
                        disabled={loading}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#375191]/25 bg-[#375191]/5 px-4 py-2.5 text-sm font-semibold text-[#375191] hover:border-[#375191]/50 hover:bg-[#375191]/10 transition-all disabled:opacity-50"
                      >
                        <Search className="w-4 h-4" />
                        Não tenho a placa, <span className="underline underline-offset-2 decoration-[#375191]/40">buscar por modelo</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-2xl border-2 border-[#D1DFFA] bg-[#F7F8FC]/60 p-4 sm:p-5">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-semibold text-[#121A33]">Buscar pelo modelo</label>
                        <button
                          type="button"
                          onClick={switchToPlaca}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#375191] hover:text-[#3D72DE] transition-colors disabled:opacity-50"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Tenho a placa
                        </button>
                      </div>

                      {/* Carro / Moto */}
                      <div>
                        <label className="block text-xs font-semibold text-[#64748B] mb-2">Tipo</label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: 'carros', label: 'Carro / SUV' },
                            { value: 'motos', label: 'Moto' },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={loading}
                              onClick={() => {
                                setFipeKind(opt.value)
                                setFipeMarcaCode('')
                                setFipeModeloCode('')
                                setFipeAnoCode('')
                              }}
                              className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                                fipeKind === opt.value
                                  ? 'border-[#375191] bg-[#375191]/10 text-[#375191]'
                                  : 'border-[#D1DFFA] bg-white text-[#64748B] hover:border-[#375191]/40'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <FipeSelect
                        label="Marca"
                        value={fipeMarcaCode}
                        options={fipeMarcas}
                        loading={fipeLoadingMarcas}
                        disabled={loading || fipeLoadingMarcas}
                        error={errors.fipeMarca}
                        placeholder={fipeLoadingMarcas ? 'Carregando marcas...' : 'Selecione a marca'}
                        onChange={code => {
                          setFipeMarcaCode(code)
                          setFipeModeloCode('')
                          setFipeAnoCode('')
                          setErrors(prev => ({ ...prev, fipeMarca: '' }))
                        }}
                      />

                      <FipeSelect
                        label="Modelo"
                        value={fipeModeloCode}
                        options={fipeModelos}
                        loading={fipeLoadingModelos}
                        disabled={loading || !fipeMarcaCode || fipeLoadingModelos}
                        error={errors.fipeModelo}
                        placeholder={
                          !fipeMarcaCode
                            ? 'Escolha a marca primeiro'
                            : fipeLoadingModelos
                              ? 'Carregando modelos...'
                              : 'Selecione o modelo'
                        }
                        onChange={code => {
                          setFipeModeloCode(code)
                          setFipeAnoCode('')
                          setErrors(prev => ({ ...prev, fipeModelo: '' }))
                        }}
                      />

                      <FipeSelect
                        label="Ano"
                        value={fipeAnoCode}
                        options={fipeAnos}
                        loading={fipeLoadingAnos}
                        disabled={loading || !fipeModeloCode || fipeLoadingAnos}
                        error={errors.fipeAno}
                        placeholder={
                          !fipeModeloCode
                            ? 'Escolha o modelo primeiro'
                            : fipeLoadingAnos
                              ? 'Carregando anos...'
                              : 'Selecione o ano'
                        }
                        onChange={code => {
                          setFipeAnoCode(code)
                          setErrors(prev => ({ ...prev, fipeAno: '' }))
                        }}
                      />

                      <p className="text-[11px] text-[#94A3B8] leading-snug pt-1">
                        Valor estimado pela tabela FIPE. O consultor confirma o valor final com a placa real.
                      </p>
                    </div>
                  )}

                  {/* Leilão / Remarcado */}
                  <div>
                    <label className="block text-sm font-semibold text-[#121A33] mb-2">Veículo de leilão ou remarcado?</label>
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
                              ? 'border-[#375191] bg-[#375191]/10 text-[#375191] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#375191]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.leilao !== 'nao' && (
                      <p className="mt-2 text-xs text-[#F7963D] font-medium">
                        Indenização: 80% da tabela FIPE
                      </p>
                    )}
                  </div>

                  {/* Carro de aplicativo */}
                  <div>
                    <label className="block text-sm font-semibold text-[#121A33] mb-2">É carro de aplicativo (Uber, 99, etc.)?</label>
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
                              ? 'border-[#375191] bg-[#375191]/10 text-[#375191] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#375191]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seguro atual */}
                  <div>
                    <label className="block text-sm font-semibold text-[#121A33] mb-2">Esse carro possui seguro ou proteção?</label>
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
                              ? 'border-[#375191] bg-[#375191]/10 text-[#375191] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#375191]/40'
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
                        <a href="https://wa.me/5521980214882?text=Olá! Preciso de ajuda com uma simulação." target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          fale no WhatsApp
                        </a>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Atendimento humano — aparece quando PowerCRM + API Brasil + Parallelum falham */}
                {requiresHumanSupport && (
                  <div className="mt-6 p-6 rounded-2xl bg-[#FFFBF5] border-2 border-[#F7963D]/30">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#F7963D]/10 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-[#F7963D]" />
                      </div>
                      <div>
                        <p className="font-bold text-[#121A33] text-base">Vamos finalizar pelo WhatsApp</p>
                        <p className="text-[#64748B] text-sm mt-1">
                          {humanSupportReason === 'fipe_indisponivel'
                            ? 'Identificamos seu veículo, mas a tabela FIPE não retornou o valor agora. Nosso consultor vai conferir e te passar a cotação personalizada na hora.'
                            : 'Não conseguimos consultar a sua placa automaticamente. Fale com nosso consultor agora pra fazer sua simulação personalizada.'}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`https://wa.me/5521980214882?text=${encodeURIComponent(
                        `Olá! Tentei fazer uma simulação no site e não consegui. Pode me ajudar?\n\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}${form.placa ? `\nPlaca: ${form.placa}` : ''}${form.email ? `\nE-mail: ${form.email}` : ''}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
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
                    className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold text-base rounded-full shadow-lg shadow-[#F7963D]/20 hover:shadow-xl hover:shadow-[#F7963D]/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100">
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
                  <ShieldCheck className="w-4 h-4 text-[#375191]" />
                  <span>Cadastrada na SUSEP</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#F7963D]" />
                  <span>20+ anos de mercado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#10B981]" />
                  <span>Sem análise de perfil</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Veículo Excluído ── */}
          {step === 2 && excluded && vehicle && (
            <div className="max-w-lg mx-auto pt-28">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-6 sm:p-10 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFF7ED] mb-6">
                  <AlertCircle className="w-8 h-8 text-[#F7963D]" />
                </div>

                <h2 className="font-[var(--font-display)] text-xl md:text-2xl font-bold text-[#121A33] mb-3">
                  Cotação sob consulta
                </h2>

                <p className="text-[#64748B] text-sm mb-2">
                  Identificamos seu veículo:
                </p>
                <p className="font-semibold text-[#121A33] text-base mb-4">
                  {vehicle.marca} {vehicle.modelo} {vehicle.ano}
                </p>

                <p className="text-[#64748B] text-sm mb-8 leading-relaxed">
                  Para esse modelo, não conseguimos calcular o valor automaticamente.
                  <br />
                  Fale com nosso consultor para receber uma cotação personalizada!
                </p>

                <a
                  href={`https://wa.me/5521980214882?text=${encodeURIComponent(`Olá! Fiz uma simulação no site mas meu veículo precisa de cotação especial.\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}\nPlaca: ${form.placa}\nVeículo: ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}\nFIPE: R$ ${vehicle.fipeValue.toLocaleString('pt-BR')}${form.leilao !== 'nao' ? `\nOrigem: ${form.leilao === 'leilao' ? 'Leilão' : 'Remarcado'}` : ''}${form.carroApp === 'sim' ? `\nCarro de aplicativo: Sim (Uber/99)` : ''}${form.temSeguro === 'sim' ? `\nSeguro/proteção atual: ${form.nomeSeguro.trim() || 'Sim (não informado)'}` : ''}\nPode me ajudar?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    trackWhatsAppClick('cotacao_excluido')
                    if (typeof window !== 'undefined' && (window as any).dataLayer) {
                      (window as any).dataLayer.push({
                        event: 'whatsapp_click',
                        tipo: 'veiculo_excluido',
                        veiculo: `${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}`,
                      })
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#25D366] to-[#20BD5A] text-white font-bold text-base rounded-full shadow-lg shadow-[#25D366]/20 hover:shadow-xl hover:shadow-[#25D366]/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 mb-4"
                >
                  <MessageCircle className="w-5 h-5" />
                  Falar com Consultor no WhatsApp
                </a>

                <div className="flex items-center justify-center gap-2 text-xs text-[#94A3B8] mb-6">
                  <Lock className="w-3.5 h-3.5" />
                  Atendimento rápido e sem compromisso
                </div>

                <button
                  onClick={() => {
                    setStep(1)
                    setExcluded(false)
                    setVehicle(null)
                    setPlans([])
                    setForm({ nome: '', whatsapp: '', email: '', placa: '', leilao: 'nao', carroApp: 'nao', temSeguro: 'nao', nomeSeguro: '' })
                  }}
                  className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#121A33] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Nova simulação
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
                <h2 className="font-[var(--font-display)] text-2xl md:text-3xl font-bold text-[#121A33] mb-2">
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
                            ? 'bg-white text-[#121A33] shadow-md'
                            : 'text-[#64748B] hover:text-[#121A33]'
                        }`}>
                        {plan.name}
                        {plan.popular && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#F7963D] bg-[#F7963D]/10 px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                            Mais escolhido
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Coberturas toggle */}
                  <button onClick={() => setShowCoberturas(!showCoberturas)}
                    className="flex items-center justify-between w-full mb-5 text-[#121A33] font-semibold text-sm">
                    Benefícios incluídos
                    {showCoberturas ? <ChevronUp className="w-4 h-4 text-[#94A3B8]" /> : <ChevronDown className="w-4 h-4 text-[#94A3B8]" />}
                  </button>

                  {showCoberturas && planInfo && (
                    <ul className="space-y-3.5">
                      {planInfo.features.map(c => (
                        <li key={c.text} className="flex items-center gap-3">
                          {c.included
                            ? <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0"><Check className="w-3.5 h-3.5 text-[#10B981]" /></div>
                            : <div className="w-6 h-6 rounded-full bg-[#F0F4FA] flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-[#CBD5E1]" /></div>}
                          <span className={`text-sm ${c.included ? 'text-[#121A33] font-medium' : 'text-[#CBD5E1] line-through'}`}>{c.text}</span>
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
                      <span className="font-[var(--font-display)] text-5xl font-bold text-[#121A33] leading-none">{priceFormatted}</span>
                      <span className="text-lg text-[#64748B] font-medium">/mês</span>
                    </div>
                  </div>

                  <div className="border-t border-[#E8ECF4] pt-4 mb-6 space-y-4 text-sm">
                    {/* ATIVAÇÃO — Pagamento único do plano (cartão à vista ou 12x) */}
                    <div className="bg-[#FFF7ED] border border-[#F7963D]/20 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-[#121A33]">Ativação</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#F7963D] bg-[#F7963D]/10 px-2 py-0.5 rounded-full">Pagamento único</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-[#64748B] font-semibold">À vista no cartão</span>
                          <span className="font-extrabold text-[#F7963D] text-xl">R$ {formatPrice(ativacaoAvista)}</span>
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
                        <span className="font-bold text-[#121A33]">1º pagamento</span>
                        <span className="text-xs text-[#64748B]">vencimento até {dueDateFormatted}</span>
                      </div>
                      <div className="flex items-baseline justify-end gap-2 mt-1">
                        <span className="text-sm text-[#94A3B8] line-through">R$ {priceFormatted}</span>
                        <span className="font-extrabold text-[#10B981] text-2xl">R$ {discountFormatted}</span>
                      </div>
                      <p className="text-xs text-[#10B981] font-semibold mt-1.5 text-right">5% de desconto pagando antes do vencimento</p>
                    </div>

                    {/* Mensalidade regular — destaque */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-[#121A33]">Mensalidade regular</span>
                        <span className="font-extrabold text-[#121A33] text-2xl">R$ {priceFormatted}<span className="text-sm font-medium text-[#64748B]">/mês</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Desconto Adesivo — com ElectricBorder (não aparece para motos) */}
                  {!isMoto && (
                  <div className="mb-6">
                    <ElectricBorder color="#F7963D" speed={0.6} chaos={0.08} borderRadius={20}>
                      <div className="bg-white rounded-[20px] p-4 sm:p-5">
                        {/* Header com toggle */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-9 h-9 rounded-xl bg-[#F7963D]/10 flex items-center justify-center flex-shrink-0">
                            <Car className="w-5 h-5 text-[#F7963D]" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-[#121A33] text-sm leading-tight">Desconto Adesivo 21Go</p>
                            <p className="text-[10px] text-[#64748B]">Adesivo no vidro traseiro</p>
                          </div>
                          <span className="bg-[#F7963D] text-white text-xs font-extrabold px-2.5 py-1 rounded-full shadow-sm shadow-[#F7963D]/20">
                            -{stickerPct}%
                          </span>
                        </div>

                        {/* Toggle aceitar/recusar */}
                        <div className="flex items-center gap-3 mb-4">
                          <button
                            onClick={() => setStickerAccepted(true)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                              stickerAccepted
                                ? 'bg-[#F7963D] text-white shadow-md shadow-[#F7963D]/20'
                                : 'bg-[#F7F8FC] text-[#94A3B8] border border-[#E2E8F0] hover:border-[#F7963D]/40'
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
                                <span className="font-extrabold text-[#F7963D] text-xl">R$ {stickerPriceFormatted}</span>
                              </div>
                            </div>
                            <div className="h-px bg-[#F7963D]/10" />
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
                    </ElectricBorder>
                  </div>
                  )}

                  <a href={`https://wa.me/5521980214882?text=${encodeURIComponent(`Olá! Fiz uma simulação no site.\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}${form.email ? `\nE-mail: ${form.email}` : ''}\nPlaca: ${form.placa}${form.leilao !== 'nao' ? `\nOrigem: ${form.leilao === 'leilao' ? 'Leilão' : 'Remarcado'}` : ''}${form.carroApp === 'sim' ? `\nCarro de aplicativo: Sim (Uber/99)` : ''}${form.temSeguro === 'sim' ? `\nSeguro/proteção atual: ${form.nomeSeguro.trim() || 'Sim (não informado)'}` : ''}\nVeículo: ${vehicleLabel}\nFIPE: R$ ${fipeFormatted}\nPlano: ${selectedPlan.name}\nMensalidade: R$ ${priceFormatted}/mês\nAtivação: R$ ${formatPrice(ativacaoAvista)} à vista no cartão ou 12x de R$ ${formatPrice(ativacaoParcela12x)}\nQuero contratar!`)}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => {
                      trackWhatsAppClick('cotacao_resultado', { plano: selectedPlan.name, valor: price })
                      notifyWhatsAppClick()
                      // GTM event
                      if (typeof window !== 'undefined' && (window as any).dataLayer) {
                        (window as any).dataLayer.push({
                          event: 'whatsapp_click',
                          plano: selectedPlan.name,
                          valor: price,
                          veiculo: vehicleLabel,
                        })
                      }
                    }}
                    className="flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#F7963D] to-[#F9A95E] text-white font-bold text-base rounded-full shadow-lg shadow-[#F7963D]/20 hover:shadow-xl hover:shadow-[#F7963D]/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 mb-4">
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
                  className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#121A33] transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Editar dados
                </button>
                <button onClick={() => { setStep(1); setForm({ nome: '', whatsapp: '', email: '', placa: '', leilao: 'nao', carroApp: 'nao', temSeguro: 'nao', nomeSeguro: '' }); setVehicle(null); setPlans([]); setRequiresHumanSupport(false); setExcluded(false); setSearchMode('placa'); setFipeMarcaCode(''); setFipeModeloCode(''); setFipeAnoCode(''); whatsappClicked.current = false }}
                  className="text-sm text-[#375191] hover:text-[#3D72DE] transition-colors">
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
      <label htmlFor={name} className="block text-sm font-semibold text-[#121A33] mb-2">{label}</label>
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
          className={`w-full ${icon ? 'pl-12' : 'px-5'} pr-5 py-4 rounded-2xl border-2 text-[#121A33] text-[15px] font-medium placeholder:text-[#94A3B8] bg-[#F7F8FC] focus:outline-none focus:border-[#375191] focus:bg-white focus:shadow-[0_0_0_3px_rgba(55,81,145,0.1)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-[#EF4444] bg-[#FEF2F2] shadow-[0_0_0_3px_rgba(239,68,68,0.08)]' : 'border-[#D1DFFA] hover:border-[#375191]/40'
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
          className={`w-full appearance-none pl-4 pr-10 py-3.5 rounded-xl border-2 bg-white text-[#121A33] text-[14px] font-medium focus:outline-none focus:border-[#375191] focus:shadow-[0_0_0_3px_rgba(55,81,145,0.1)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
            error ? 'border-[#EF4444]' : 'border-[#D1DFFA] hover:border-[#375191]/40'
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
