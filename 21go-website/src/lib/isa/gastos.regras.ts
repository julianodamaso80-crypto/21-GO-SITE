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
