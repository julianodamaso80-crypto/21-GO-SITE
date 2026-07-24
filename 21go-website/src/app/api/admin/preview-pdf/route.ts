import { NextRequest, NextResponse } from 'next/server'
import { generateQuotePdf } from '@/lib/pdf-quote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint de PREVIEW do PDF — retorna o PDF binário direto, sem
 * enviar WhatsApp nem criar lead no PowerCRM. Usado pra teste/aprovação
 * visual antes de subir mudanças no template.
 *
 * Em produção fica desabilitado a menos que ADMIN_RESEND_TOKEN esteja
 * configurado E o header x-admin-token bata. Em dev (NODE_ENV !== production)
 * é livre pra facilitar testes locais.
 *
 * Uso: POST /api/admin/preview-pdf
 *      Body: { ...QuotePdfInput }
 *      Resposta: application/pdf
 *
 * Exemplo de body:
 * {
 *   "nome": "Juliano Damaso",
 *   "whatsapp": "5521969454824",
 *   "marca": "VW - VolksWagen",
 *   "modelo": "VIRTUS 1.6 MSI Flex 16V 5p Mec.",
 *   "ano": 2018,
 *   "placa": "QMD3B38",
 *   "cor": "BRANCA",
 *   "fipe": 62219,
 *   "planoNome": "VIP",
 *   "mensalidade": 314.99,
 *   "categoria": "AUTOMOVEL",
 *   "combustivel": "FLEX"
 * }
 */

const ADMIN_TOKEN = process.env.ADMIN_RESEND_TOKEN || ''
const IS_PROD = process.env.NODE_ENV === 'production'

export async function POST(req: NextRequest) {
  if (IS_PROD) {
    if (!ADMIN_TOKEN) {
      return new NextResponse('Not Found', { status: 404 })
    }
    if (req.headers.get('x-admin-token') !== ADMIN_TOKEN) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  // Defaults pra simplificar testes
  const input = {
    nome: (body.nome as string) || 'Cliente Teste',
    whatsapp: (body.whatsapp as string) || '5521900000000',
    email: body.email as string | null | undefined,
    placa: body.placa as string | null | undefined,
    marca: (body.marca as string) || 'Marca',
    modelo: (body.modelo as string) || 'Modelo',
    ano: (body.ano as string | number) || '2020',
    cor: body.cor as string | null | undefined,
    fipe: typeof body.fipe === 'number' ? (body.fipe as number) : 50000,
    planoNome: (body.planoNome as string) || 'VIP',
    mensalidade: typeof body.mensalidade === 'number' ? (body.mensalidade as number) : 200,
    isMoto: body.isMoto as boolean | undefined,
    categoria: body.categoria as string | null | undefined,
    combustivel: body.combustivel as string | null | undefined,
    cilindrada: body.cilindrada as number | null | undefined,
    carroApp: body.carroApp as boolean | undefined,
    leilao: body.leilao as string | null | undefined,
    motoTerceiros: body.motoTerceiros as boolean | undefined,
    seguroAtual: body.seguroAtual as string | null | undefined,
  }

  try {
    const pdf = await generateQuotePdf(input)
    return new NextResponse(pdf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-21go-${Date.now()}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'admin/preview-pdf',
    usage: 'POST com body QuotePdfInput. Em prod precisa header x-admin-token.',
  })
}
