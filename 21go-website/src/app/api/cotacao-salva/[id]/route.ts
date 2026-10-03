import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parceiroDoHost } from '@/lib/site-parceiro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reabre uma cotacao ja feita: o link unico `21go.app/cotacao?id=<codigo>` (dono, 03/10/2026:
 * "cada cotacao um link unico pra eu enviar pra cada cliente copiando a url").
 *
 * So le, nunca grava: reabrir nao cria lead, nao mexe no Power e nao dispara evento. So serve
 * lead do proprio dominio de parceiro de onde o pedido veio, pra o codigo de uma cotacao do
 * .site nao abrir em lugar nenhum por aqui.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!parceiroDoHost(host)) return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })

  const { id } = await ctx.params
  const limpo = String(id || '').replace(/^lead_/, '')
  if (!/^[a-f0-9]{16}$/.test(limpo)) return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })

  const { data, error } = await supabaseAdmin()
    .from('leads')
    .select(
      'id, nome, whatsapp, telefone, placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado, fipe_codigo, cotacao_planos, carro_app, leilao, dominio',
    )
    .eq('id', `lead_${limpo}`)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'indisponivel' }, { status: 503 })
  const dominioDoPedido = (host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')
  const planos = Array.isArray(data?.cotacao_planos) ? data.cotacao_planos : []
  if (!data || data.dominio !== dominioDoPedido || planos.length === 0) {
    return NextResponse.json({ error: 'nao encontrado' }, { status: 404 })
  }

  return NextResponse.json(
    {
      leadId: data.id,
      nome: data.nome || '',
      whatsapp: data.whatsapp || data.telefone || '',
      placa: data.placa_interesse || '',
      leilao: data.leilao || 'nao',
      carroApp: Boolean(data.carro_app),
      vehicle: {
        marca: data.marca_interesse || '',
        modelo: data.modelo_interesse || '',
        ano: String(data.ano_interesse || ''),
        cor: '',
        fipeValue: Number(data.valor_fipe_consultado) || 0,
        fipeCode: data.fipe_codigo || '',
      },
      plans: planos,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
