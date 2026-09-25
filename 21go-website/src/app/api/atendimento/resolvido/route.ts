import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Tira a conversa da aba "Precisa de você" sem mexer em mais nada (dono, 25/09/2026: "quero tirar
 * ele ali e deixar ele normal em todos"). `resolvido: false` devolve pra aba.
 *
 * Sinal novo (pergunta sem resposta, pedido de desconto, pausa) limpa isto sozinho — é o
 * `voltaPraPrecisaDeVoce` dentro do `atualizarContato`.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; resolvido?: boolean }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  if (!telefone) return NextResponse.json({ erro: 'telefone' }, { status: 400 })
  const resolvido = b.resolvido !== false

  await sql(
    `UPDATE public.isa_contatos SET resolvido_em = CASE WHEN $2 THEN now() ELSE NULL END, updated_at = now()
      WHERE telefone = $1`,
    [telefone, resolvido],
  )
  await registrarEvento(telefone, resolvido ? 'resolvido' : 'voltou_pra_precisa', null, s.u)
  return NextResponse.json({ ok: true })
}
