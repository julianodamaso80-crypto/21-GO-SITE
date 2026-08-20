import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_SESSAO } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Chamado por um `<form method="post">` no cabecalho do painel, entao responde
 * com redirect (303) em vez de JSON — assim o navegador volta pra tela de login
 * sozinho, sem depender de JavaScript.
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/', req.url), { status: 303 })
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', httpOnly: true, maxAge: 0 })
  return res
}
