import { NextRequest, NextResponse } from 'next/server'
import { listModelsPowerCrm } from '@/lib/powercrm-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const marca = req.nextUrl.searchParams.get('marca')
  const ano = req.nextUrl.searchParams.get('ano')
  if (!marca || !ano) {
    return NextResponse.json(
      { success: false, error: 'marca e ano obrigatórios' },
      { status: 200 },
    )
  }
  try {
    const data = await listModelsPowerCrm(marca, ano)
    // Mapeia pro formato consumido pelo FipeSelect ({code, name, codFipe})
    const mapped = data.map((m) => ({
      code: String(m.id),
      name: m.text,
      codFipe: m.back || null,
    }))
    return NextResponse.json({ success: true, data: mapped })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro ao buscar modelos' },
      { status: 200 },
    )
  }
}
