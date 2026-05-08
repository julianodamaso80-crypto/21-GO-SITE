import { NextRequest, NextResponse } from 'next/server'
import { sendPdfMedia, sendText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_RESEND_TOKEN || ''

/**
 * Endpoint de debug interno — chama sendPdfMedia/sendText com dados controlados
 * pra reproduzir e debugar a falha 500 "Connection Closed".
 */
export async function POST(req: NextRequest) {
  if (!ADMIN_TOKEN || req.headers.get('x-admin-token') !== ADMIN_TOKEN) {
    return new NextResponse('Not Found', { status: 404 })
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tipo = (body.tipo as string) || 'media'
  const phone = (body.phone as string) || '5521979034169'
  const mediaUrl =
    (body.media as string) ||
    'https://noawceqgqfwtpnrzmvdo.supabase.co/storage/v1/object/public/quotes/2026-05-08/lead_22be509dca0615c4.pdf'

  const t0 = Date.now()
  try {
    let result
    if (tipo === 'text') {
      result = await sendText(phone, 'debug interno')
    } else {
      result = await sendPdfMedia(phone, mediaUrl, 'debug', 'debug.pdf')
    }
    return NextResponse.json({ ok: true, ms: Date.now() - t0, result })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
