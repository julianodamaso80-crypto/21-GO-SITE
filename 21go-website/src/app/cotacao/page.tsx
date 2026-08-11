'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { trackCotacaoInicio, trackCotacaoCompleta, trackPedidoOrcamento, trackPageView, getTrackingData } from '@/lib/tracking'
import { useConsultor } from '@/components/ConsultorProvider'
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
import { buildContratarMessage } from '@/lib/quote-message'
import { isPlacaFormatValid, normalizePlaca, validatePlaca } from '@/lib/placa'

/* ─── Types ─── */
interface FormData {
  nome: string
  whatsapp: string
  email: string
  /** '' = ainda não escolheu. Zero km dispensa placa; usado exige. */
  condicao: '' | 'zero' | 'usado'
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
  /** Código FIPE da versão — vem do `back` do PowerCRM e amarra o valor. */
  codFipe?: string | null
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
  // Num site de consultor (21go.com.br/julianodamaso) a venda e dele: o lead
  // nasce no Power dele e o botao de contato abre o WhatsApp dele.
  const consultor = useConsultor()
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0)
  const [showCoberturas, setShowCoberturas] = useState(true)

  // API state
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [vehicle, setVehicle] = useState<VehicleData | null>(null)
  const [plans, setPlans] = useState<QuotePlan[]>([])

  // Veiculo sem plano no PowerCRM — o unico motivo que dispensa cliente desde 06/08/2026.
  // Mostramos tela de agradecimento e salvamos o contato pra acionar quando aceitarmos.
  const [excluded, setExcluded] = useState(false)

  // Adesivo toggle
  const [stickerAccepted, setStickerAccepted] = useState(true)

  // Atendimento humano: quando PowerCRM + API Brasil + Parallelum falham
  // ou quando o veículo não retorna FIPE confiável. Cliente é direcionado
  // pro WhatsApp da consultora com dados pré-preenchidos, via /api/wa (rodízio).
  const [requiresHumanSupport, setRequiresHumanSupport] = useState(false)
  const [humanSupportReason, setHumanSupportReason] = useState<'fipe_indisponivel' | 'consulta_falhou' | 'manual' | 'elegibilidade_indisponivel'>('consulta_falhou')
  // Rate-limit: bloqueia após 3 veículos distintos por 7 dias (anti-consultor concorrente).
  // No 4º, abre pop-up com WhatsApp em vez de mostrar a simulação.

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
    condicao: '',
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

  // Identificação do veículo pela placa (PowerCRM → DENATRAN).
  //
  // Diferente do antigo plate-check, que só confirmava que a placa existia,
  // isto devolve os MESMOS IDs que os dropdowns produzem (marca, ano, modelo)
  // — então o formulário se preenche sozinho e o cliente não escolhe nada.
  // 'found'    → versão fechada, nada mais a perguntar
  // 'partial'  → sabemos marca e ano; falta o cliente confirmar a versão
  // 'notfound' → base respondeu e não achou; abre o modo manual, nunca trava
  // 'unknown'  → consulta fora do ar; abre o modo manual, sem alarde
  const [plateId, setPlateId] = useState<{
    status: 'idle' | 'checking' | 'found' | 'partial' | 'notfound' | 'unknown'
    label?: string
    cor?: string
  }>({ status: 'idle' })

  // Versões prováveis do veículo quando a placa não fechou uma só. Lista curta
  // (2-5 itens) filtrada pelo nome que veio do DENATRAN. `null` = usa a lista
  // completa da marca+ano, que é o que o "ver todos os modelos" faz.
  const [plateCandidates, setPlateCandidates] = useState<FipeItem[] | null>(null)

  // Cliente pediu pra escolher o veículo na mão, mesmo tendo dado a placa.
  const [manualVehicle, setManualVehicle] = useState(false)

  // Cliente afirmou que a placa de padrão estranho é a dele mesmo. Guardado por
  // placa: se ele editar o campo depois, a confirmação não vale mais.
  const [placaConfirmada, setPlacaConfirmada] = useState('')

  // Placa que a base do PowerCRM reconheceu OU que o cliente confirmou na mão:
  // nos dois casos o padrão suspeito deixa de importar. É o que garante que
  // ninguém com placa de verdade fique travado aqui.
  const placaLiberada =
    plateId.status === 'found'
    || plateId.status === 'partial'
    || placaConfirmada === normalizePlaca(form.placa)
  const placaPedeConfirmacao =
    form.condicao === 'usado'
    && !placaLiberada
    && validatePlaca(form.placa, true, false)?.level === 'confirm'

  /**
   * A placa só assume o formulário quando de fato amarrou o veículo na tabela
   * do PowerCRM. Tem placa que o DENATRAN devolve sem marca (o "GOLF 2.0" de
   * 2003 é um caso real): aí sabemos o carro mas não os IDs, e o cliente
   * escolhe na mão — com o que identificamos mostrado ali do lado.
   */
  const placaResolveu =
    plateId.status === 'found'
    || (plateId.status === 'partial' && !!fipeMarcaCode && !!fipeAnoCode)
  /**
   * A placa é um ATALHO, não um requisito (ordem do dono, 07/08/2026). Achou o
   * veículo → o formulário se preenche sozinho. Não achou, veio errada, ficou
   * vazia ou a consulta caiu → o cliente escolhe marca/ano/modelo na mão e a
   * simulação sai igual. Por isso o padrão é o modo manual: só saímos dele
   * quando a placa realmente amarrou o veículo na tabela do PowerCRM.
   */
  const veiculoPelaPlaca = form.condicao === 'usado' && !manualVehicle && placaResolveu
  const modoManual = !veiculoPelaPlaca && plateId.status !== 'checking'

  /**
   * Placa que vai pro PowerCRM/lead. Placa fora dos dois formatos oficiais é
   * lixo de digitação: não trava o cliente, mas também não suja o cadastro.
   */
  const placaParaEnvio = isPlacaFormatValid(form.placa) ? normalizePlaca(form.placa) : ''

  useEffect(() => {
    const p = normalizePlaca(form.placa)
    // Consulta toda placa bem formada — inclusive as de padrão suspeito, porque
    // é a base que decide se elas são reais.
    if (form.condicao !== 'usado' || p.length !== 7 || !isPlacaFormatValid(p)) {
      setPlateId({ status: 'idle' })
      setPlateCandidates(null)
      return
    }
    let cancelled = false
    setPlateId({ status: 'checking' })
    setManualVehicle(false)
    const t = setTimeout(() => {
      // Timeout curto: consulta de placa que pendura deixaria o cliente preso em
      // "Buscando...". Estourou, vira 'unknown' e ele escolhe o veículo na mão.
      const ctrl = new AbortController()
      const abortTimer = setTimeout(() => ctrl.abort(), 12000)
      fetch(`${API_BASE}/api/vehicle/plate-identify/${p}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then((d: {
          status: string
          label?: string
          cor?: string
          tipo?: 'carro' | 'moto'
          brandId?: string
          brandText?: string
          year?: string
          modelId?: string
          modelText?: string
          codFipe?: string
          candidates?: { code: string; name: string; codFipe: string | null }[]
        }) => {
          if (cancelled) return
          if (d.status !== 'found' && d.status !== 'partial') {
            setPlateId({ status: d.status === 'notfound' ? 'notfound' : 'unknown' })
            setPlateCandidates(null)
            // Limpa o que uma placa anterior tinha preenchido: deixar Chevrolet
            // 2019 na tela depois de trocar de placa confunde mais que ajuda.
            setFipeMarcaCode('')
            setFipeMarcaText('')
            setFipeAnoCode('')
            setFipeModeloCode('')
            setFipeModeloText('')
            setFipeModeloCodFipe('')
            return
          }
          // Preenche exatamente os mesmos estados que os dropdowns preencheriam,
          // pra que o cálculo de preço siga pelo caminho único de sempre.
          if (d.tipo) setFipeKind(d.tipo === 'moto' ? 'motos' : 'carros')
          if (d.brandId) setFipeMarcaCode(d.brandId)
          if (d.brandText) setFipeMarcaText(d.brandText)
          if (d.year) setFipeAnoCode(d.year)
          setFipeModeloCode(d.modelId || '')
          setFipeModeloText(d.modelText || '')
          setFipeModeloCodFipe(d.codFipe || '')
          setPlateCandidates(
            d.status === 'partial' && d.candidates?.length
              ? d.candidates.map(c => ({ code: c.code, name: c.name, codFipe: c.codFipe }))
              : null,
          )
          setPlateId({ status: d.status, label: d.label, cor: d.cor })
          setErrors(prev => ({ ...prev, fipeMarca: '', fipeAno: '', fipeModelo: '', placa: '' }))
        })
        .catch(() => { if (!cancelled) setPlateId({ status: 'unknown' }) })
        .finally(() => clearTimeout(abortTimer))
    }, 700)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.placa, form.condicao])

  // Lead tracking (backend CRM cuida de follow-up + PDF + Bull queue)
  const [leadId, setLeadId] = useState<string | null>(null)
  const whatsappClicked = useRef(false)

  // Semente da variação da mensagem de contratação (ver quote-message.ts).
  // Sorteada só no client, depois da hidratação, pra não gerar mismatch de SSR.
  // Enquanto não existe leadId, é ela que faz dois clientes mandarem textos
  // diferentes pro mesmo número — que é o ponto todo do anti-ban.
  const [msgSeed, setMsgSeed] = useState('')
  useEffect(() => {
    setMsgSeed(`${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
  }, [])

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
    if (!form.condicao) e.condicao = 'Diga se o veículo é zero km ou usado'
    // Identificado pela placa: marca e ano já vieram prontos, só a versão pode
    // faltar. No modo manual continuam valendo os três selects.
    if (plateId.status === 'checking') {
      e.placa = 'Só um instante, estamos identificando seu veículo...'
    } else if (veiculoPelaPlaca) {
      if (!fipeModeloCode) e.fipeModelo = 'Confirme a versão do seu veículo'
    } else {
      if (!fipeMarcaCode) e.fipeMarca = 'Escolha a marca'
      if (!fipeAnoCode) e.fipeAno = 'Escolha o ano'
      if (!fipeModeloCode) e.fipeModelo = 'Escolha o modelo'
    }
    // PLACA NÃO BLOQUEIA NADA (ordem do dono, 07/08/2026). Vazia, errada,
    // não encontrada ou de padrão suspeito: em todos os casos o cliente segue
    // pelos selects de marca/ano/modelo, que é o que de fato calcula o valor.
    // Lead com placa é melhor; lead sem placa continua sendo lead.
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

  // (o toggle `sem-whatsapp` saiu junto com o botão flutuante — 03/08/2026)

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
  function triggerHumanSupport(reason: 'fipe_indisponivel' | 'consulta_falhou' | 'manual' | 'elegibilidade_indisponivel') {
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
        consultorSlug: consultor?.slug ?? null,
        placa: placaParaEnvio,
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
          leilao: form.leilao,
        }),
      })
      const data = await precoRes.json()

      if (!data.success) {
        if (data.requires_human_support) {
          // 'elegibilidade_indisponivel' = o Power não respondeu se cobre o veículo. Vai pro
          // consultor, nunca pra tela de "não fazemos" — só o Power pode dizer isso.
          triggerHumanSupport(
            data.reason === 'elegibilidade_indisponivel' ? 'elegibilidade_indisponivel' : 'fipe_indisponivel',
          )
          return
        }
        setApiError(data.error || 'Não foi possível consultar a FIPE. Tente novamente.')
        return
      }

      const v = data.vehicle
      setVehicle(v)

      // Sem rate-limit de simulações (removido 2026-07-29, ordem do dono): a
      // trava de 3 veículos/7 dias estava barrando cliente de verdade. Qualquer
      // pessoa simula quantos veículos quiser.

      // Quem manda é o PowerCRM, versão por versão, respondido no servidor — e só ele. Saíram
      // daqui em 06/08/2026 a lista de modelos escrita por nome e o corte de ano: as duas
      // rodavam DEPOIS de o Power já ter aprovado o veículo, então a única coisa que podiam
      // fazer era virar um "faz" em "não faz" e derrubar venda.
      if (data.excluded) {
        setExcluded(true)
        setStep(2)

        // Veiculo que nao fazemos NAO vira lead de atendimento (ordem do dono,
        // 31/07/2026): nada de PowerCRM, nada de WhatsApp, nenhum botao pra
        // clicar. O contato fica so no nosso banco (o endpoint corta o caminho
        // de atendimento quando plano === 'EXCLUIDO') pra podermos avisar essa
        // pessoa se voltarmos a aceitar o veiculo. A tela agradece e encerra.
        fetch(`${API_BASE}/api/vehicle/lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: form.nome,
            whatsapp: form.whatsapp,
            email: form.email || undefined,
            consultorSlug: consultor?.slug ?? null,
            placa: placaParaEnvio,
            marca: v.marca,
            modelo: v.modelo,
            ano: v.ano,
            valorFipe: v.fipeValue,
            fipeCode: v.fipeCode,
            plano: 'EXCLUIDO',
          }),
        }).catch(() => {})
        return
      }

      // Calcula planos localmente pela tabela real (defesa em camada — bate com /preco).
      // Leilão/remarcado: cobra a faixa imediatamente ABAIXO da tabela (regra oficial
      // 21Go — tratada dentro de findPrice, não como percentual).
      const isLeilao = form.leilao !== 'nao'
      const finalPlans = getApplicablePlans(
        v.fipeValue,
        v.categoria,
        v.combustivel,
        undefined,
        v.modelo,
        isLeilao,
      )

      if (finalPlans.length === 0) {
        setApiError('Não encontramos planos para esse veículo. Fale com um consultor.')
        return
      }

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
          consultorSlug: consultor?.slug ?? null,
          placa: placaParaEnvio,
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
  //   - mensalidade CHEIA da base + R$ 50 (carro e moto), piso R$ 249
  //   - BYD → R$ 1.550 fixo
  //   - A vista = valor cheio; 12x = valor + juros 22,11% / 12 (nunca sem juros)
  // Base = MAIOR entre o VIP de referencia e o plano escolhido: Basico/Do Seu Jeito
  // pagam VIP + R$ 50 (VIP e o piso), Premium paga Premium + R$ 50.
  // Ordem de fallback quando nao ha VIP "puro" (moto/suv/especial usam o "VIP" deles).
  const vipOrder: PlanId[] = ['vip', 'suv', 'moto-1000', 'moto-400', 'especial', 'premium', 'do-seu-jeito', 'basico']
  const vipPlan = vipOrder.map((id) => plans.find((p) => p.id === id)).find((p) => !!p) || null
  const vipIsMoto = vipPlan?.id === 'moto-400' || vipPlan?.id === 'moto-1000'
  const vipMonthly = (vipPlan?.monthly || 0) + carroAppExtra
    + (form.danosTerceiros === 'sim' && vipIsMoto ? 22 : 0)
  const isBYD = (vehicle?.marca || '').trim().toUpperCase() === 'BYD'
  // `price` = mensalidade cheia do plano selecionado (ja com carroApp/danos a terceiros).
  const taxaAtivacao = calcActivation(vipMonthly, isBYD, price)
  // A vista = valor cheio (base + R$50); 12x = valor + juros 22,11% / 12 (nunca sem juros).
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

  // ── CTA de contratação (reaproveitado em vários pontos do resultado) ──
  // Mesmo link/rastreamento em todos os botões "Quero contratar".
  //
  // A mensagem sai VARIADA (quote-message.ts) e com o contexto completo da
  // simulação: tudo que o cliente marcou (leilão, carro de app, danos a
  // terceiros, adesivo, seguro atual) + a lista inteira de planos que ele viu
  // na tela, marcando qual escolheu. A consultora não precisa perguntar de
  // novo o que o site já sabe.
  const planMonthlyOf = (p: QuotePlan) => {
    const pIsMoto = p.id === 'moto-400' || p.id === 'moto-1000'
    return p.monthly + carroAppExtra + (form.danosTerceiros === 'sim' && pIsMoto ? 22 : 0)
  }
  const contratarHref = selectedPlan && vehicle
    ? `/api/wa?text=${encodeURIComponent(buildContratarMessage({
        nome: form.nome,
        whatsapp: form.whatsapp,
        email: form.email.trim() || undefined,
        placa: placaParaEnvio || undefined,
        tipo: fipeKind === 'motos' ? 'Moto' : 'Carro',
        condicao: form.condicao === 'zero' ? 'zero' : 'usado',
        veiculo: vehicleLabel,
        fipeFormatted,
        leilao: form.leilao,
        carroApp: form.carroApp === 'sim',
        // Só é opção real em plano de moto — em carro nem aparece na tela.
        danosTerceiros: selIsMoto ? form.danosTerceiros === 'sim' : null,
        seguroAtual: form.temSeguro === 'sim'
          ? (form.nomeSeguro.trim() || 'Sim (não informou qual)')
          : null,
        adesivo: isMoto
          ? null
          : {
              aceito: stickerAccepted,
              percentual: stickerPct,
              valorFormatted: stickerPriceFormatted,
            },
        planos: plans.map((p, idx) => ({
          name: p.name,
          monthlyFormatted: formatPrice(planMonthlyOf(p)),
          selected: idx === selectedPlanIdx,
        })),
        planoEscolhido: selectedPlan.name,
        mensalidadeFormatted: priceFormatted,
        ativacaoAvistaFormatted: formatPrice(ativacaoAvista),
        ativacao12xFormatted: formatPrice(ativacaoParcela12x),
        seed: leadId || msgSeed,
      }))}${consultor ? `&c=${consultor.slug}` : ''}`
    : '#'
  const handleContratarClick = () => {
    if (!selectedPlan) return
    trackPedidoOrcamento({
      plano: selectedPlan.name,
      valor: price,
      marca: vehicle?.marca,
      modelo: vehicle?.modelo,
      ano: vehicle?.ano,
    })
    notifyWhatsAppClick()
  }
  // Botão "Quero contratar" — usado no topo do card de preço, após os benefícios
  // e no rodapé. Todos abrem o WhatsApp com o mesmo resumo pré-montado.
  const ContratarCTA = ({
    label,
    sub,
    wrapClass,
    variant = 'solid',
  }: {
    label: string
    sub?: string
    wrapClass?: string
    variant?: 'solid' | 'outline'
  }) => (
    <div className={wrapClass}>
      <a
        href={contratarHref}
        target="_blank"
        rel="noopener noreferrer"
        data-track-origin="cotacao_resultado"
        data-track-button-text="Contratar pelo WhatsApp"
        onClick={handleContratarClick}
        className={
          variant === 'solid'
            ? 'flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold text-base rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:shadow-[#F2911D]/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200'
            : 'flex items-center justify-center gap-2.5 w-full py-3.5 bg-white text-[#F2911D] font-bold text-base rounded-full border-2 border-[#F2911D] hover:bg-[#FFF7ED] active:scale-[0.99] transition-all duration-200'
        }
      >
        <MessageCircle className="w-5 h-5" />
        {label}
      </a>
      {sub && <p className="text-center text-[11px] text-[#94A3B8] mt-2">{sub}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F7F8FC] relative">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #293C82 1px, transparent 0)`,
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
                  {/* Zero km ou usado — define se a placa vai ser exigida */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A2754] mb-2">O veículo é zero km ou usado?</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'zero', label: 'Zero km', sub: 'ainda sem placa' },
                        { value: 'usado', label: 'Usado', sub: 'já tem placa' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            set('condicao', opt.value)
                            // Zero km não tem placa nem passa por leilão/remarcado.
                            if (opt.value === 'zero') {
                              set('placa', '')
                              set('leilao', 'nao')
                            }
                          }}
                          className={`py-3 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                            form.condicao === opt.value
                              ? 'border-[#293C82] bg-[#293C82]/10 text-[#293C82] shadow-sm'
                              : 'border-[#D1DFFA] bg-[#F7F8FC] text-[#64748B] hover:border-[#293C82]/40'
                          }`}
                        >
                          {opt.label}
                          <span className="block text-[11px] font-medium opacity-70">{opt.sub}</span>
                        </button>
                      ))}
                    </div>
                    {errors.condicao && <p className="mt-1.5 ml-1 text-xs text-[#EF4444] font-medium">{errors.condicao}</p>}
                  </div>

                  {/* Só faz sentido depois de saber se tem placa — senão o quadro abre vazio */}
                  {form.condicao && (
                  <div className="space-y-4 rounded-2xl border-2 border-[#D1DFFA] bg-[#F7F8FC]/60 p-4 sm:p-5">
                    <label className="block text-sm font-semibold text-[#1A2754]">Dados do veículo</label>

                    {/* ── Placa PRIMEIRO: é ela que identifica o veículo sozinha ── */}
                    {form.condicao === 'usado' && (
                      <div>
                        <PillInput
                          label="Placa do veículo (opcional)"
                          name="placa"
                          value={form.placa}
                          error={errors.placa}
                          onChange={v => set('placa', maskPlaca(v))}
                          placeholder="RIO2A18"
                          mono
                          disabled={loading}
                        />
                        <p className="mt-1.5 ml-1 text-[11px] text-[#94A3B8] leading-snug">
                          Com a placa a gente já acha seu veículo. Não lembra ou não achamos?
                          Você escolhe marca, ano e modelo aqui embaixo e a simulação sai igual.
                        </p>
                        {/* Digitou errado: avisa e segue. Nunca trava — o valor
                            vem dos selects, não da placa. */}
                        {form.placa.trim().length > 0 && !isPlacaFormatValid(form.placa) && (
                          <p className="mt-2 ml-1 text-xs text-[#F2911D] font-medium">
                            Confira a placa (formato ABC1D23 ou ABC1234). Pode seguir sem ela
                            também — é só escolher o veículo abaixo.
                          </p>
                        )}
                        {/* Padrão estranho: NUNCA barra. Um toque e o cliente segue.
                            Existe só pra dar trabalho pra quem inventa placa. */}
                        {placaPedeConfirmacao && (
                          <div className="mt-2 ml-1 flex flex-wrap items-center gap-2">
                            {!errors.placa && (
                              <p className="text-xs text-[#F2911D] font-medium">
                                Essa placa parece um exemplo. É mesmo a do seu veículo?
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPlacaConfirmada(normalizePlaca(form.placa))
                                setErrors(prev => ({ ...prev, placa: '' }))
                              }}
                              className="px-3 py-1.5 rounded-full border-2 border-[#293C82] text-[#293C82] text-xs font-bold hover:bg-[#293C82]/10 transition-colors"
                            >
                              Sim, é a minha placa
                            </button>
                          </div>
                        )}
                        {plateId.status === 'checking' && (
                          <p className="mt-2 ml-4 text-xs text-[#94A3B8] font-medium flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Buscando seu veículo na base nacional...
                          </p>
                        )}
                        {/* Aviso, não bloqueio: pode ser carro novo na base ou consulta fora
                            do ar. Nos dois casos o cliente escolhe o veículo logo abaixo. */}
                        {!errors.placa && !placaPedeConfirmacao && plateId.status === 'notfound' && (
                          <p className="mt-2 ml-4 text-xs text-[#F2911D] font-medium">
                            Não localizamos essa placa. Confira se digitou certo — se estiver
                            correta, é só escolher o veículo abaixo que a simulação sai igual.
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Veículo achado pela placa: o cliente só confere ── */}
                    {veiculoPelaPlaca && (
                      <div className="rounded-2xl border-2 border-[#10B981]/40 bg-[#F0FDF4] p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#10B981]/10 flex items-center justify-center flex-shrink-0">
                            <Car className="w-5 h-5 text-[#10B981]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#10B981] mb-0.5">
                              Veículo identificado
                            </p>
                            <p className="font-semibold text-[#1A2754] text-sm leading-snug">
                              {plateId.label}
                            </p>
                            {plateId.status === 'found' && fipeModeloText && (
                              <p className="text-xs text-[#64748B] mt-0.5">{fipeModeloText}</p>
                            )}
                            {plateId.cor && (
                              <p className="text-[11px] text-[#94A3B8] mt-0.5">{plateId.cor}</p>
                            )}
                          </div>
                        </div>

                        {/* Placa achada mas sem versão fechada: a lista já vem curta,
                            filtrada pelo nome do modelo. Quem escolhe é sempre o cliente —
                            versão chutada é valor FIPE errado. */}
                        {plateId.status === 'partial' && (
                          <div className="mt-4">
                            <FipeSelect
                              label="Confirme a versão do seu veículo"
                              value={fipeModeloCode}
                              options={plateCandidates || fipeModelos}
                              loading={!plateCandidates && fipeLoadingModelos}
                              disabled={loading}
                              error={errors.fipeModelo}
                              placeholder="Selecione a versão"
                              onChange={code => {
                                setFipeModeloCode(code)
                                const hit = (plateCandidates || fipeModelos).find(m => m.code === code)
                                setFipeModeloText(hit?.name || '')
                                setFipeModeloCodFipe(hit?.codFipe || '')
                                setErrors(prev => ({ ...prev, fipeModelo: '' }))
                              }}
                            />
                            {plateCandidates && (
                              <button
                                type="button"
                                onClick={() => setPlateCandidates(null)}
                                className="mt-2 ml-1 text-xs font-semibold text-[#293C82] hover:underline"
                              >
                                Não achei o meu — ver todos os modelos
                              </button>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setManualVehicle(true)
                            setPlateCandidates(null)
                            setFipeMarcaCode('')
                            setFipeMarcaText('')
                            setFipeAnoCode('')
                            setFipeModeloCode('')
                            setFipeModeloText('')
                            setFipeModeloCodFipe('')
                          }}
                          className="mt-3 text-xs text-[#64748B] hover:text-[#1A2754] underline"
                        >
                          Não é esse veículo? Escolher na mão
                        </button>
                      </div>
                    )}

                    {/* ── Modo manual: zero km, placa não achada, ou o cliente pediu ── */}
                    {modoManual && (
                    <>
                    {/* Achamos o veículo, mas sem os IDs da tabela: mostramos o que
                        sabemos e o cliente fecha a escolha. */}
                    {plateId.label && plateId.status === 'partial' && (
                      <div className="flex items-start gap-2.5 rounded-xl bg-[#EFF6FF] border border-[#293C82]/20 p-3">
                        <Search className="w-4 h-4 text-[#293C82] flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-[#1A2754] leading-snug">
                          Encontramos <span className="font-semibold">{plateId.label}</span> na
                          placa, mas não deu pra fechar a versão. Confirme os dados abaixo.
                        </p>
                      </div>
                    )}

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

                    </>
                    )}

                    <p className="text-[11px] text-[#94A3B8] leading-snug pt-1">
                      {form.condicao === 'zero'
                        ? 'Veículo zero km não precisa de placa agora. O consultor cadastra a placa assim que você emplacar.'
                        : 'Valor estimado pela tabela FIPE. O consultor confirma o valor final com a placa real.'}
                    </p>
                  </div>
                  )}

                  {/* Contato — depois do veículo: a placa é que abre a conversa */}
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

                  {/* Leilão / Remarcado — não faz sentido pra zero km */}
                  {form.condicao !== 'zero' && (
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
                  )}

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
                          href={`${consultor ? `/api/wa?c=${consultor.slug}&text=` : '/api/wa?text='}${encodeURIComponent(
                            `Olá! Preciso de ajuda com uma simulação no site.${form.nome ? `\nNome: ${form.nome}` : ''}${form.whatsapp ? `\nWhatsApp: ${form.whatsapp}` : ''}${placaParaEnvio ? `\nPlaca: ${placaParaEnvio}` : ''}`,
                          )}`}
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
                            : humanSupportReason === 'elegibilidade_indisponivel'
                            ? 'Identificamos seu veículo, mas nosso sistema de cotação não respondeu agora. Nosso consultor confere a cobertura e te passa os valores na hora.'
                            : 'Não conseguimos consultar a sua placa automaticamente. Fale com nosso consultor agora pra fazer sua simulação personalizada.'}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`${consultor ? `/api/wa?c=${consultor.slug}&text=` : '/api/wa?text='}${encodeURIComponent(
                        `Olá! Tentei fazer uma simulação no site e não consegui. Pode me ajudar?\n\nNome: ${form.nome}\nWhatsApp: ${form.whatsapp}${placaParaEnvio ? `\nPlaca: ${placaParaEnvio}` : ''}${form.email ? `\nE-mail: ${form.email}` : ''}`,
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
                  Mas <span className="font-semibold text-[#10B981]">guardamos o seu contato com cuidado</span>. Assim que voltarmos a aceitar esse veículo, nós entraremos em contato com você para apresentar a melhor proposta.
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
                    setForm({ nome: '', whatsapp: '', email: '', condicao: '', placa: '', leilao: 'nao', carroApp: 'nao', danosTerceiros: 'nao', temSeguro: 'nao', nomeSeguro: '' })
                    setPlateId({ status: 'idle' })
                    setPlateCandidates(null)
                    setManualVehicle(false)
                    setPlacaConfirmada('')
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
                {/* Coberturas — no mobile vem DEPOIS do preço (order-2), no desktop à esquerda */}
                <div className="order-2 lg:order-1 bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-4 sm:p-6 md:p-8">
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

                  {/* CTA após os benefícios — cliente rolou as coberturas e pode seguir daqui */}
                  <ContratarCTA
                    label="Gostei! Quero contratar"
                    variant="outline"
                    wrapClass="mt-7"
                  />
                </div>

                {/* Preço / CTA — no mobile vem PRIMEIRO (order-1), preço + botão na 1ª dobra */}
                <div className="order-1 lg:order-2 bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-black/[0.04] border border-[#E8ECF4] p-4 sm:p-6 md:p-8 h-fit lg:sticky lg:top-28">
                  <div className="text-center mb-5">
                    <p className="text-sm text-[#64748B] mb-1">Plano {selectedPlan.name}</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-lg text-[#64748B] font-medium">R$</span>
                      <span className="font-[var(--font-display)] text-5xl font-bold text-[#1A2754] leading-none">{priceFormatted}</span>
                      <span className="text-lg text-[#64748B] font-medium">/mês</span>
                    </div>
                  </div>

                  {/* CTA principal — acima da dobra, logo abaixo do preço */}
                  <ContratarCTA
                    label="Quero contratar 🛡️"
                    sub="Sem compromisso · a Letycia te responde na hora"
                    wrapClass="mb-6"
                  />

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

                  <p className="text-center text-sm font-semibold text-[#1A2754] mb-3">
                    Gostou dos planos? 🎉 Dá o próximo passo pra sair protegido — a Letycia te acompanha daqui 👇
                  </p>
                  <ContratarCTA
                    label="Gostei! Quero sair protegido 🛡️"
                    wrapClass="mb-4"
                  />

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
                <button onClick={() => { setStep(1); setForm({ nome: '', whatsapp: '', email: '', condicao: '', placa: '', leilao: 'nao', carroApp: 'nao', danosTerceiros: 'nao', temSeguro: 'nao', nomeSeguro: '' }); setVehicle(null); setPlans([]); setRequiresHumanSupport(false); setExcluded(false); setFipeMarcaCode(''); setFipeMarcaText(''); setFipeModeloCode(''); setFipeModeloText(''); setFipeModeloCodFipe(''); setFipeAnoCode(''); setPlateId({ status: 'idle' }); setPlateCandidates(null); setManualVehicle(false); setPlacaConfirmada(''); whatsappClicked.current = false }}
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
