import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_SESSAO } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Chamado por um `<form method="post">` no cabecalho, entao responde com
 * redirect (303) — o navegador volta pro login sozinho, sem JavaScript.
 *
 * ⚠️ O destino sai do header `host`, NAO de `req.url`.
 *
 * Dentro do container o Next enxerga a propria URL como `http://0.0.0.0:3000`,
 * porque e nesse endereco que ele escuta. `new URL('/', req.url)` devolvia
 * exatamente isso e o dono caia numa tela de "nao e possivel acessar esse
 * site". Quem sabe o endereco publico e o proxy, e ele conta no `host`.
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const destino = host ? `${proto}://${host}/` : '/'

  const res = NextResponse.redirect(destino, { status: 303 })
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', httpOnly: true, maxAge: 0 })
  return res
}
