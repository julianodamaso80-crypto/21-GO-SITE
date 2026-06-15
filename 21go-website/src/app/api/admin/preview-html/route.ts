import { NextRequest, NextResponse } from 'next/server'
import { renderQuoteHTML } from '@/lib/pdf-quote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_RESEND_TOKEN || ''
const IS_PROD = process.env.NODE_ENV === 'production'

export async function POST(req: NextRequest) {
  if (IS_PROD) {
    if (!ADMIN_TOKEN) return new NextResponse('Not Found', { status: 404 })
    if (req.headers.get('x-admin-token') !== ADMIN_TOKEN)
      return new NextResponse('Unauthorized', { status: 401 })
  }
  const body = (await req.json()) as Record<string, unknown>
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
  const html = renderQuoteHTML(input)
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'admin/preview-html' })
}
