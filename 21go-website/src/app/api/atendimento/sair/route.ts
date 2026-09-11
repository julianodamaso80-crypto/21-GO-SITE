import { NextResponse } from 'next/server'
import { COOKIE_ISA } from '@/lib/isa/painel'

export const runtime = 'nodejs'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_ISA, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
