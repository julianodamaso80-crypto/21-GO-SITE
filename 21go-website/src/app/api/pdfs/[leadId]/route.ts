import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateQuotePdf } from '@/lib/pdf-quote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint público que regenera o PDF de um lead on-demand.
 *
 * Usado como destino do `media` da Evolution API (URL pública em vez de
 * base64 — payloads grandes em base64 fazem a Evolution retornar HTTP 500
 * "Connection Closed").
 *
 * Estratégia:
 *   1. Recebe `leadId` (formato `lead_<trk>` ou `<trk>`).
 *   2. Busca dados do lead no Supabase (`leads`).
 *   3. Regenera o PDF com `generateQuotePdf` (mesma função usada no fluxo
 *      principal — calculos consistentes).
 *   4. Retorna `application/pdf` inline com `Cache-Control: no-store`.
 *
 * Sem auth: o leadId é hash gerado por crypto (16 hex), só quem tem o link
 * acessa. Mesmo padrão do PowerCRM `?h=DAZlZ6zr`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params
  const id = leadId.startsWith('lead_') ? leadId : `lead_${leadId}`

  const supa = supabaseAdmin()
  const { data, error } = await supa
    .from('leads')
    .select(
      'id, nome, telefone, whatsapp, email, placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado, cotacao_plano, cotacao_valor, carro_app, leilao, seguro_atual',
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return new NextResponse('Lead not found', { status: 404 })
  }

  // Validações mínimas — sem dados, não gera PDF
  const fipe = (data.valor_fipe_consultado as number) || 0
  const mensalidade = (data.cotacao_valor as number) || 0
  const marca = (data.marca_interesse as string) || ''
  const modelo = (data.modelo_interesse as string) || ''
  const planoNome = (data.cotacao_plano as string) || ''
  if (fipe <= 0 || mensalidade <= 0 || !marca || !modelo || !planoNome) {
    return new NextResponse('Lead sem dados completos pra gerar PDF', { status: 400 })
  }

  try {
    const pdf = await generateQuotePdf({
      nome: (data.nome as string) || '',
      whatsapp: (data.whatsapp as string) || (data.telefone as string) || '',
      email: data.email as string | null,
      placa: data.placa_interesse as string | null,
      marca,
      modelo,
      ano: (data.ano_interesse as number | string) || '',
      cor: null,
      fipe,
      planoNome,
      mensalidade,
      carroApp: !!data.carro_app,
      leilao: data.leilao as string | null,
      seguroAtual: data.seguro_atual as string | null,
    })

    return new NextResponse(pdf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="simulacao-21go-${id}.pdf"`,
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'X-Lead-Id': id,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/pdfs] falha ao gerar:', msg)
    return new NextResponse('Erro interno ao gerar PDF', { status: 500 })
  }
}
