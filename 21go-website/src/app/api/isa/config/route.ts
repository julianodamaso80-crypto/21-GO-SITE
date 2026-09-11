import { NextRequest, NextResponse } from 'next/server'
import { ehDominioDaCasa } from '@/lib/isa/popup.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Chaves de runtime da Isa pro navegador. NEXT_PUBLIC_* nao chega ao build do Lightsail (o
 * Dockerfile so passa ARGs especificos), entao a chave do popup mora no env do container e e
 * lida aqui, a cada visita — liga e desliga sem rebuild.
 *
 * Quem veio de um site de consultor (cookie c21go_dono) nunca ve o popup (REGRA 0.1).
 */
export async function GET(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(':')[0]
  const doConsultor = Boolean(req.cookies.get('c21go_dono')?.value)
  const popup = process.env.ISA_POPUP === 'on' && ehDominioDaCasa(host) && !doConsultor
  return NextResponse.json({ popup }, { headers: { 'Cache-Control': 'no-store' } })
}
