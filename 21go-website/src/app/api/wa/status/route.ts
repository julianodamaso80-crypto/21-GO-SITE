import { NextResponse } from 'next/server'
import { whatsappStatus } from '@/lib/whatsapp-rotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diagnóstico do rodízio: mostra qual chip está no ar e qual caiu, consultando
 * a Evolution na hora. Serve pra conferir a sincronia sem entrar no servidor.
 *
 * GET /api/wa/status
 *   ok=true  → pelo menos um número no ar (o site tem pra onde mandar)
 *   ok=false → nenhum no ar, precisa reconectar um chip AGORA
 */
export async function GET() {
  const status = await whatsappStatus()
  const ok = status.online.length > 0

  const res = NextResponse.json(
    {
      ok,
      online: status.online,
      checkedAt: new Date(status.checkedAt).toISOString(),
      targets: status.targets.map((t) => ({
        numero: t.number,
        instancia: t.instance,
        online: t.online,
        estado: t.state,
      })),
    },
    { status: ok ? 200 : 503 },
  )
  res.headers.set('Cache-Control', 'no-store')
  return res
}
