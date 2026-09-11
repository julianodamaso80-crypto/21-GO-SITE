import { NextRequest, NextResponse } from 'next/server'
import { processarFila } from '@/lib/isa/worker'
import { abordarLeadsNovos } from '@/lib/isa/abordagem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rede de seguranca da fila da Isa: /opt/isa-cron.sh chama de 1 em 1 minuto.
 * Pega mensagem que o disparo do webhook perdeu (deploy, reinicio) e a fila das 8h.
 * Tambem manda a mensagem dos 5 min (desligada por padrao — ISA_5MIN=on).
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    const fila = await processarFila()
    // Separado da fila: erro nos 5 min nao pode deixar cliente sem resposta, nem o contrario.
    const cincoMin = await abordarLeadsNovos().catch((err) => {
      console.error('[isa] 5 min falhou:', err)
      return { enviados: 0, erro: err instanceof Error ? err.message : String(err) }
    })
    return NextResponse.json({ ok: true, ...fila, cincoMin })
  } catch (err) {
    console.error('[isa] cron falhou:', err)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
