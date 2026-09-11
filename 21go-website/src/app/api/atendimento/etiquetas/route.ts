import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento } from '@/lib/isa/banco'
import { ETIQUETAS, normalizarEtiquetas } from '@/lib/isa/etiquetas.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A lista oficial, pra tela montar os chips e o filtro. */
export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  return NextResponse.json({ etiquetas: ETIQUETAS })
}

/** Grava as etiquetas do contato (a lista inteira, nao um toggle — dois cliques seguidos nao embolam). */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; etiquetas?: unknown }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  if (!telefone) return NextResponse.json({ erro: 'telefone' }, { status: 400 })
  const etiquetas = normalizarEtiquetas(b.etiquetas)
  const r = await sql(
    `UPDATE public.isa_contatos SET etiquetas = $2::text[], updated_at = now() WHERE telefone = $1 RETURNING telefone`,
    [telefone, etiquetas],
  )
  if (r.length === 0) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  await registrarEvento(telefone, 'etiquetas', { etiquetas }, s.u)
  return NextResponse.json({ ok: true, etiquetas })
}
