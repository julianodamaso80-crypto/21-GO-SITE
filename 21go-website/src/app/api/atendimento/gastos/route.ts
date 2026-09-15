import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { resumirGastos, pontosDaResposta } from '@/lib/isa/gastos.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Quanto a WABA da Isa (98004-0964) custou na Meta. Dono, 14/09/2026: ele quer ver, num painel,
 * o gasto do disparo de boleto separado do gasto da conversa da Isa. O CRM chama esta rota pra
 * parte da Isa e consulta a WABA dos boletos por conta propria — assim o token de cada lado fica
 * onde ja mora (REGRA: sites isolados, nunca copiar .env entre projetos).
 *
 * A metrica e `pricing_analytics`: a `conversation_analytics` parou de devolver custo quando a
 * Meta passou a cobrar por MENSAGEM em vez de por conversa. O custo vem em DOLAR.
 */
const MAX_DIAS = 90

export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })

  const waba = (process.env.WA_WABA_ID || '').trim()
  const token = (process.env.WA_TOKEN || '').trim()
  if (!waba || !token) return NextResponse.json({ erro: 'WABA da Isa sem configuração no servidor' }, { status: 503 })

  const pedido = Number(req.nextUrl.searchParams.get('dias') || 30)
  const dias = Number.isFinite(pedido) ? Math.min(Math.max(Math.trunc(pedido), 1), MAX_DIAS) : 30
  const fim = Math.floor(Date.now() / 1000)
  const inicio = fim - dias * 86400

  const url = new URL(`https://graph.facebook.com/v22.0/${encodeURIComponent(waba)}`)
  url.searchParams.set(
    'fields',
    `pricing_analytics.start(${inicio}).end(${fim}).granularity(DAILY).dimensions(["PRICING_CATEGORY"])`,
  )

  let corpo: unknown
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
    corpo = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (corpo as { error?: { message?: string } })?.error?.message || 'a Meta recusou a consulta'
      return NextResponse.json({ erro: msg }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ erro: 'a Meta não respondeu' }, { status: 502 })
  }

  // A MOEDA DA CONTA decide se o valor precisa de conversao. A WABA da Isa ("21 Go - Vendas")
  // e BRL: em 14/09/2026 o painel multiplicou por 5,50 e mostrou 5x o gasto real.
  let moeda: string | null = null
  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(waba)}?fields=currency`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    moeda = ((await r.json().catch(() => ({}))) as { currency?: string }).currency ?? null
  } catch {
    // sem a moeda o CRM nao converte nada, que e o lado seguro do erro
  }

  return NextResponse.json({ waba, dias, moeda, ...resumirGastos(pontosDaResposta(corpo)) })
}
