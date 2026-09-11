import { NextRequest, NextResponse } from 'next/server'
import { conferirLogin, criarSessao, loginBloqueado, COOKIE_ISA, DURACAO_MS } from '@/lib/isa/painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (loginBloqueado(ip)) return NextResponse.json({ erro: 'muitas tentativas — espere 15 minutos' }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as { usuario?: string; senha?: string }
  const u = conferirLogin(b.usuario || '', b.senha || '')
  if (!u) return NextResponse.json({ erro: 'usuário ou senha incorretos' }, { status: 401 })
  const res = NextResponse.json({ ok: true, usuario: u })
  res.cookies.set(COOKIE_ISA, criarSessao(u), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.floor(DURACAO_MS / 1000),
  })
  return res
}
