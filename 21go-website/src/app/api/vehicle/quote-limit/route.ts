import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DESATIVADO em 2026-07-29 por ordem do dono: a trava de 3 veículos / 7 dias
 * estava barrando cliente de verdade e derrubando cotação em massa.
 *
 * A rota continua existindo e responde SEMPRE `allowed: true` porque navegador
 * com o JS antigo em cache continua chamando por um tempo — se ela sumisse ou
 * respondesse erro, essas pessoas seguiriam travadas.
 *
 * A tabela `quote_limits` no Supabase foi mantida (histórico), mas não é mais
 * lida nem escrita.
 */
export async function POST() {
  const res = NextResponse.json({ allowed: true, count: 0, limit: 0 }, { status: 200 })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
