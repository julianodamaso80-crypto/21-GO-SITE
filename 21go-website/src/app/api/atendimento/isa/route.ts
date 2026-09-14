import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { atualizarContato, registrarEvento } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Chave liga/desliga a Isa por contato (dono, 10/09/2026): desligada, ela nao fala mais com esse
 * cliente.
 *
 * Ao RELIGAR ela comeca do zero dali pra frente (dono, 14/09/2026: "se eu desativar a Isa e logo
 * depois ativar, ela so vai responder o que perguntar a frente e nunca responder junto comigo ou
 * perguntas atrasadas"). Por isso o processado_ate anda pra agora: tudo que o cliente mandou
 * enquanto ela estava desligada ja foi tratado por quem atendeu, e ela nao responde por cima.
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
      ? {
          ligada: true, pausa_motivo: null, pausa_por: null, pausada_em: null, aguardando_dono: null,
          // corta o atrasado: so responde o que chegar DEPOIS de religar
          processado_ate: new Date().toISOString(),
        }
      : { ligada: false, pausa_motivo: 'manual', pausa_por: s.u, pausada_em: new Date().toISOString() },
  )
  await registrarEvento(telefone, b.ligada ? 'ligou' : 'desligou', { motivo: 'manual', ...(b.ligada ? { comeca_agora: true } : {}) }, s.u)
  return NextResponse.json({ ok: true })
}
