import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { listarFunil, gravarEtapa } from '@/lib/isa/painel-dados'
import { ETAPAS, ehEtapa } from '@/lib/isa/funil.regras'
import { registrarEvento } from '@/lib/isa/banco'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Cards do funil (kanban) — pedido do dono, 11/09/2026. Toda conversa aparece. */
export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  return NextResponse.json({ etapas: ETAPAS, cards: await listarFunil() })
}

/** Arrastou o card: grava a etapa escolhida (ou volta pra automática com etapa vazia). */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; etapa?: string | null }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  const etapa = b.etapa ? String(b.etapa) : null
  if (!telefone) return NextResponse.json({ erro: 'telefone' }, { status: 400 })
  if (etapa && !ehEtapa(etapa)) return NextResponse.json({ erro: 'etapa desconhecida' }, { status: 400 })

  await gravarEtapa(telefone, etapa)
  await registrarEvento(telefone, 'etapa', { etapa }, s.u)
  return NextResponse.json({ ok: true })
}
