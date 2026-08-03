import { NextRequest, NextResponse } from 'next/server'
import { isPlacaFormatValid, isPlacaObviouslyFake, normalizePlaca } from '@/lib/placa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Confirmação LEVE de placa, usada enquanto o cliente digita no formulário.
 *
 * Bate só no `/plates/` do PowerCRM — que é de graça e devolve só metadados
 * (marca, ano, cor). NÃO entra na cascata de valor FIPE: nada de API Brasil
 * (R$ 0,10 por consulta) num campo que dispara a cada digitação. Quem resolve
 * o valor é `/api/vehicle/fipe/preco` depois que o cliente avança.
 *
 * Três respostas possíveis, e o front trata cada uma diferente:
 *   found   → placa existe, mostra "confirmada" com marca/ano
 *   notfound→ base respondeu e não achou; front AVISA mas deixa seguir
 *   unknown → serviço fora do ar / sem token; front fica calado
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN || ''

type CacheEntry = { body: PlateCheckResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface PlateCheckResult {
  status: 'found' | 'notfound' | 'unknown' | 'invalid'
  marca?: string
  ano?: string
}

interface PowerPlatesResp {
  mensagem?: string
  brand?: string
  year?: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ placa: string }> },
) {
  const { placa } = await params
  const p = normalizePlaca(placa)

  if (p.length !== 7 || !isPlacaFormatValid(p) || isPlacaObviouslyFake(p)) {
    return NextResponse.json({ status: 'invalid' } satisfies PlateCheckResult)
  }
  if (!POWERAPI_TOKEN) {
    return NextResponse.json({ status: 'unknown' } satisfies PlateCheckResult)
  }

  const cached = cache.get(p)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.body)
  }

  let result: PlateCheckResult
  try {
    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/plates/${p}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${POWERAPI_TOKEN}` },
      // Curto de propósito: é feedback enquanto o cliente digita. Demorou, some.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      result = { status: 'unknown' }
    } else {
      const data = (await res.json().catch(() => null)) as PowerPlatesResp | null
      result =
        data?.mensagem === 'ok' && data.brand
          ? { status: 'found', marca: data.brand, ano: data.year?.match(/(\d{4})/g)?.pop() }
          : { status: 'notfound' }
    }
  } catch {
    result = { status: 'unknown' }
  }

  // 'unknown' é estado transitório do serviço, não fato sobre a placa — não cacheia.
  if (result.status !== 'unknown') {
    cache.set(p, { body: result, expiresAt: Date.now() + CACHE_TTL_MS })
  }
  return NextResponse.json(result)
}
