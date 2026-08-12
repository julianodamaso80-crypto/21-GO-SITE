import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { cobrancaEmAberto, dadosDeCobranca, statusDaCobranca, MENSALIDADE } from '@/lib/asaas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O checkout, servido pela nossa marca.
 *
 * Regra do dono: o consultor nao pode perceber que tem um Asaas no meio. Entao
 * o QR do Pix, o copia-e-cola e a linha digitavel do boleto saem por aqui e sao
 * desenhados na nossa tela — ninguem e mandado pra fora.
 *
 * `?so=status` e o modo leve: a tela pergunta de tempos em tempos se ja pagou, e
 * nao faz sentido rebaixar o QR inteiro a cada pergunta.
 */

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const soStatus = req.nextUrl.searchParams.get('so') === 'status'

  const { data: site } = await supabaseAdmin()
    .from('sites_consultor')
    .select('slug, status, asaas_subscription_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!site?.asaas_subscription_id) {
    return NextResponse.json({ erro: 'não encontrei essa contratação' }, { status: 404 })
  }

  // O site ja no ar e a resposta definitiva: o webhook confirmou o pagamento.
  // Vale mais que o status da cobranca, e evita uma ida ao Asaas.
  if (site.status === 'ativo') {
    return NextResponse.json({ pago: true, status: site.status })
  }

  const cobranca = await cobrancaEmAberto(site.asaas_subscription_id).catch(() => null)
  if (!cobranca?.id) {
    return NextResponse.json({ erro: 'não achei a cobrança' }, { status: 404 })
  }

  if (soStatus) {
    const status = await statusDaCobranca(cobranca.id)
    return NextResponse.json({
      pago: status === 'CONFIRMED' || status === 'RECEIVED',
      status,
    })
  }

  const dados = await dadosDeCobranca(cobranca.id)

  return NextResponse.json({
    pago: false,
    valor: MENSALIDADE,
    vencimento: cobranca.vencimento,
    pix: { copiaECola: dados.pixCopiaECola, qr: dados.pixQrBase64 },
    boleto: { linha: dados.boletoLinha },
  })
}
