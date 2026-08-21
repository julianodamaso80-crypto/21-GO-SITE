import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { entregarSeOTestePassar } from '@/lib/entregar-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Quem pagou e ainda nao recebeu o link — de 15 em 15 minutos.
 *
 * ─── Por que isto existe separado do cron de cobranca ────────────────────────
 *
 * A entrega ja era retentada, mas so no cron diario das 09h. Na pratica isso
 * significa que quem paga as 16h e esbarra num WhatsApp fora do ar fica ate 17
 * horas com o site no ar e sem saber o endereco dele. Foi exatamente o caso da
 * Renata em 21/08/2026 (pagou 15h43, canal de avisos `close`) e do Fabio no dia
 * anterior — dois consultores pagos, sem link, e ninguem sabendo.
 *
 * Cobranca continua uma vez por dia, de proposito: avisar e cortar sao acoes que
 * nao se desfazem e nao podem rodar de 15 em 15 minutos. Entrega e o contrario —
 * repetir e barato, e cada repeticao so acontece enquanto alguem esta pagando
 * por um site que ainda nao recebeu.
 *
 * A trava contra entrega dupla e o `link_enviado_em`, checado dentro do
 * `entregarSeOTestePassar`: assim que a mensagem sai, este endpoint para de ver
 * a pessoa.
 */

interface Pendente {
  slug: string
  nome: string
  whatsapp: string
  powerlink_id: string
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const supa = supabaseAdmin()

  // `ativo` + sem link enviado = pagou e nao recebeu. Inadimplente nao entra:
  // se chegou ate ali e porque ja tinha recebido o link um dia.
  const { data, error } = await supa
    .from('sites_consultor')
    .select('slug, nome, whatsapp, powerlink_id')
    .eq('status', 'ativo')
    .is('link_enviado_em', null)

  if (error) {
    console.error('[cron entrega]', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const pendentes = (data || []) as Pendente[]
  const relatorio = { pendentes: pendentes.length, entregues: 0, erros: 0 }

  for (const s of pendentes) {
    try {
      const r = await entregarSeOTestePassar({
        slug: s.slug,
        nome: s.nome,
        whatsapp: s.whatsapp,
        powerlinkId: s.powerlink_id,
      })
      if (r.entregue) relatorio.entregues++
    } catch (err) {
      relatorio.erros++
      console.error('[cron entrega]', s.slug, (err as Error).message)
    }
  }

  if (relatorio.pendentes) console.log('[cron entrega]', JSON.stringify(relatorio))
  return NextResponse.json(relatorio)
}
