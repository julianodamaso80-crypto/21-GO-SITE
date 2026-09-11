import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { baixarMidia } from '@/lib/isa/cloud'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Abre documento/foto do cliente (CNH, CRLV) — a midia fica na Meta, nunca no nosso banco. */
export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  const m = await baixarMidia(id)
  if (!m) return NextResponse.json({ erro: 'midia indisponivel (a Meta guarda por 30 dias)' }, { status: 404 })
  return new NextResponse(new Uint8Array(m.bytes), {
    headers: { 'content-type': m.mime, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' },
  })
}
