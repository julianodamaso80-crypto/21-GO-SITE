import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { atualizarContato, registrarEvento } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Chave liga/desliga a Isa por contato (dono, 10/09/2026): desligada, ela nao fala mais com esse
 * cliente; religada, ela le a conversa inteira — inclusive o que o humano escreveu — e responde a
 * proxima mensagem dele.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; ligada?: boolean }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  if (!telefone || typeof b.ligada !== 'boolean') return NextResponse.json({ erro: 'telefone e ligada' }, { status: 400 })
  await atualizarContato(
    telefone,
    b.ligada
      ? { ligada: true, pausa_motivo: null, pausa_por: null, pausada_em: null, aguardando_dono: null }
      : { ligada: false, pausa_motivo: 'manual', pausa_por: s.u, pausada_em: new Date().toISOString() },
  )
  await registrarEvento(telefone, b.ligada ? 'ligou' : 'desligou', { motivo: 'manual' }, s.u)
  return NextResponse.json({ ok: true })
}
