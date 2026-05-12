import { NextResponse } from 'next/server'
import { listGenericYears } from '@/lib/powercrm-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Retorna lista genérica de anos (currentYear+1 .. 1995) usada antes
 * de escolher modelo. PowerCRM exige cb+cy juntos pra retornar modelos,
 * então o ano vem antes pra filtrar. Depois do modelo, /preco refina
 * com o ano-modelo real (incluindo combustível) via /cmy.
 */
export async function GET() {
  // Formato {code, name} consumido pelo FipeSelect.
  const data = listGenericYears().map((y) => ({ code: String(y), name: String(y) }))
  return NextResponse.json({ success: true, data })
}
