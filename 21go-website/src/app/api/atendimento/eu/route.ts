import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { IDENTIDADE, ETIQUETAS_DO_BOT } from '@/lib/isa/identidade'
import { painelDoBot } from '@/lib/isa/identidade.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nome do bot e etiquetas nao sao segredo: vao tambem no 401, pra tela de login ja mostrar o bot certo.
export async function GET(req: NextRequest) {
  const s = sessaoDoRequest(req)
  const bot = painelDoBot(IDENTIDADE, ETIQUETAS_DO_BOT)
  return s ? NextResponse.json({ usuario: s.u, bot }) : NextResponse.json({ erro: 'sem sessao', bot }, { status: 401 })
}
