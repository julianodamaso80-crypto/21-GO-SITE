import { NextRequest, NextResponse } from 'next/server'
import { listBrandsPowerCrm, type PowerCrmKind } from '@/lib/powercrm-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalize(value: string | null): PowerCrmKind {
  return value === 'moto' ? 'moto' : 'carro'
}

export async function GET(req: NextRequest) {
  const tipo = normalize(req.nextUrl.searchParams.get('tipo'))
  try {
    const data = await listBrandsPowerCrm(tipo)
    // Mapeia pro formato consumido pelo FipeSelect ({code, name})
    const mapped = data.map((b) => ({ code: String(b.id), name: b.text }))
    return NextResponse.json({ success: true, data: mapped })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro ao buscar marcas' },
      { status: 200 },
    )
  }
}
