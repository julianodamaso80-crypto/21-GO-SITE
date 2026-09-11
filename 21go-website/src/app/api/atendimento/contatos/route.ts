import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { listarContatos, contarPrecisa, type Aba } from '@/lib/isa/painel-dados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ABAS = new Set(['todos', 'precisa', 'isa', 'off', 'transferidos'])

export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const aba = req.nextUrl.searchParams.get('aba') || 'todos'
  if (!ABAS.has(aba)) return NextResponse.json({ erro: 'aba invalida' }, { status: 400 })
  const busca = (req.nextUrl.searchParams.get('q') || '').slice(0, 60)
  const [contatos, precisa] = await Promise.all([listarContatos(aba as Aba, busca), contarPrecisa()])
  return NextResponse.json({ contatos, precisa })
}
