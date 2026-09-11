import { NextRequest, NextResponse } from 'next/server'
import { processarFila } from '@/lib/isa/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rede de seguranca da fila da Isa: /opt/isa-cron.sh chama de 1 em 1 minuto.
 * Pega mensagem que o disparo do webhook perdeu (deploy, reinicio) e a fila das 8h.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await processarFila()) })
  } catch (err) {
    console.error('[isa] cron falhou:', err)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
