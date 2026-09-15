/**
 * O que a 21Go gasta na Meta com WhatsApp. Dono, 14/09/2026: "vai ser tudo que gastei no meta com
 * whatsap... consigo ver disparo com boleto, disparo com conversa isa".
 *
 * A fonte e o `pricing_analytics` da Graph API (a `conversation_analytics` nao devolve mais custo
 * desde que a Meta passou a cobrar por MENSAGEM em vez de por conversa). Cada ponto vem com
 * `start` (unix), `volume` (mensagens) e `cost` em DOLAR. Logica pura, sem rede.
 */

export interface PontoDaMeta {
  start: number
  end?: number
  volume?: number
  cost?: number
  pricing_category?: string
}

export interface PorDia {
  dia: string
  mensagens: number
  custo: number
}

export interface PorCategoria {
  categoria: string
  mensagens: number
  custo: number
}

export interface ResumoGastos {
  porDia: PorDia[]
  porCategoria: PorCategoria[]
  mensagens: number
  custo: number
}

/** O dia como a pessoa ve no Brasil — a Meta manda o comeco do dia em unix. */
export function diaDoPonto(start: number): string {
  const d = new Date(start * 1000)
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return f.format(d)
}

const ROTULO: Record<string, string> = {
  UTILITY: 'Utilidade',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Autenticação',
  SERVICE: 'Atendimento',
  REFERRAL_CONVERSION: 'Indicação',
}

export function rotuloDaCategoria(c: string | undefined): string {
  if (!c) return 'Outros'
  return ROTULO[c] ?? c.charAt(0) + c.slice(1).toLowerCase()
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Junta os pontos da Meta em dia e categoria. Ponto sem `cost` conta mensagem com custo zero —
 * e o que acontece com a janela de atendimento, que nao e cobrada.
 */
export function resumirGastos(pontos: PontoDaMeta[]): ResumoGastos {
  const dias = new Map<string, PorDia>()
  const cats = new Map<string, PorCategoria>()
  let mensagens = 0
  let custo = 0

  for (const p of pontos) {
    if (!p || typeof p.start !== 'number') continue
    const vol = Number(p.volume ?? 0) || 0
    const c = Number(p.cost ?? 0) || 0
    mensagens += vol
    custo += c

    const dia = diaDoPonto(p.start)
    const d = dias.get(dia) ?? { dia, mensagens: 0, custo: 0 }
    d.mensagens += vol
    d.custo += c
    dias.set(dia, d)

    const cat = rotuloDaCategoria(p.pricing_category)
    const k = cats.get(cat) ?? { categoria: cat, mensagens: 0, custo: 0 }
    k.mensagens += vol
    k.custo += c
    cats.set(cat, k)
  }

  return {
    porDia: [...dias.values()].map((d) => ({ ...d, custo: r4(d.custo) })).sort((a, b) => a.dia.localeCompare(b.dia)),
    porCategoria: [...cats.values()].map((c) => ({ ...c, custo: r4(c.custo) })).sort((a, b) => b.custo - a.custo),
    mensagens,
    custo: r4(custo),
  }
}

/** Lê a resposta da Graph API sem quebrar quando a Meta devolve o objeto vazio. */
export function pontosDaResposta(corpo: unknown): PontoDaMeta[] {
  const p = (corpo as { pricing_analytics?: { data?: { data_points?: PontoDaMeta[] }[] } } | null)?.pricing_analytics
  const blocos = p?.data ?? []
  return blocos.flatMap((b) => b?.data_points ?? [])
}

/**
 * A JANELA QUE A TELA PEDIU. O painel nasceu so com 7/30/90 dias; o dono (15/09/2026) pediu
 * tambem filtro por DIA e periodo escolhido a mao. Aqui e o unico lugar que decide datas:
 * a rota do CRM e a do 21go.site chamam esta funcao e mandam o mesmo recorte pra Meta.
 *
 * Trabalha em dia de calendario de Sao Paulo (nao em "24h atras"), que e como a pessoa le o
 * grafico. O Brasil nao tem horario de verao desde 2019, entao -03 e fixo.
 */
export const MAX_DIAS = 90

const DIA = /^\d{4}-\d{2}-\d{2}$/
const ehDia = (v: unknown): v is string => typeof v === 'string' && DIA.test(v)
const meiaNoiteEmSP = (dia: string) => Math.floor(Date.parse(`${dia}T00:00:00Z`) / 1000) + 3 * 3600
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000) + 1

/** O dia de hoje como a pessoa ve no Brasil. */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

export interface Janela {
  /** Primeiro e ultimo dia do periodo, YYYY-MM-DD, fuso de Sao Paulo. */
  de: string
  ate: string
  /** O que a Graph API pede: unix do comeco do primeiro dia e do fim do ultimo. */
  inicio: number
  fim: number
  dias: number
}

export function janelaDoPedido(
  pedido: { dias?: string | number | null; de?: string | null; ate?: string | null },
  agora: Date = new Date(),
): Janela {
  const hoje = hojeNoBrasil(agora)
  let de: string
  let ate: string

  if (ehDia(pedido.de) || ehDia(pedido.ate)) {
    // so um lado preenchido: "de" sozinho vai ate hoje; "ate" sozinho e um dia so
    de = ehDia(pedido.de) ? pedido.de : (pedido.ate as string)
    ate = ehDia(pedido.ate) ? pedido.ate : hoje
    if (de > ate) [de, ate] = [ate, de]
    // dia no futuro nao tem gasto: puxa pra hoje em vez de pedir vazio pra Meta
    if (ate > hoje) ate = hoje
    if (de > ate) de = ate
    // a Meta so devolve DAILY numa janela curta: corta o comeco, mantendo o fim que foi pedido
    if (diasEntre(de, ate) > MAX_DIAS) de = somarDias(ate, -(MAX_DIAS - 1))
  } else {
    const n = Number(pedido.dias ?? 30)
    const dias = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_DIAS) : 30
    ate = hoje
    de = somarDias(hoje, -(dias - 1))
  }

  const fimDoDia = meiaNoiteEmSP(ate) + 86399
  return {
    de,
    ate,
    inicio: meiaNoiteEmSP(de),
    fim: Math.min(fimDoDia, Math.floor(agora.getTime() / 1000)),
    dias: diasEntre(de, ate),
  }
}
