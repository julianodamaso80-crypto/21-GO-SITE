import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = sessaoDoRequest(req)
  return s ? NextResponse.json({ usuario: s.u }) : NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
}
