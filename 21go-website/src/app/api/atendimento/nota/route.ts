import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAXIMO = 2000

/**
 * Anotação interna do contato (dono, 12/09/2026). Fica no card do funil e na conversa; NUNCA vai
 * pro cliente e a Isa não lê — é recado do time pro time.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; nota?: string }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  const nota = (b.nota ?? '').trim().slice(0, MAXIMO)
  if (!telefone) return NextResponse.json({ erro: 'telefone' }, { status: 400 })

  await sql(`UPDATE public.isa_contatos SET nota = NULLIF($2::text, ''), updated_at = now() WHERE telefone = $1`, [telefone, nota])
  await registrarEvento(telefone, 'nota', { tamanho: nota.length }, s.u)
  return NextResponse.json({ ok: true })
}
