import { NextRequest, NextResponse } from 'next/server'
import { identifyPlate } from '@/lib/plate-identify'
import { isPlacaFormatValid, normalizePlaca } from '@/lib/placa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Placa → veículo já mapeado na tabela do PowerCRM.
 *
 * Substitui o /plate-check no formulário de cotação: além de confirmar que a
 * placa existe, devolve os IDs (marca, ano, modelo) que os dropdowns produziam
 * na mão. O valor FIPE NÃO sai daqui — continua saindo do /powercrm/preco
 * quando o cliente clica em ver a simulação, que é o único lugar onde preço é
 * calculado. Nada nesta rota é cobrado por consulta.
 *
 * Placa de padrão suspeito é consultada igual: quem decide se ela é real é a
 * base, não a heurística.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ placa: string }> },
) {
  const { placa } = await params
  const p = normalizePlaca(placa)

  if (p.length !== 7 || !isPlacaFormatValid(p)) {
    return NextResponse.json({ status: 'invalid' })
  }

  const result = await identifyPlate(p)
  return NextResponse.json(result)
}
