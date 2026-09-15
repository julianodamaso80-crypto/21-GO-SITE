import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { baixarMidia } from '@/lib/isa/cloud'
import { ehOggOpus, paraM4a } from '@/lib/isa/audio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Abre documento/foto do cliente (CNH, CRLV) — a midia fica na Meta, nunca no nosso banco. */
export async function GET(req: NextRequest) {
  if (!sessaoDoRequest(req)) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  const m = await baixarMidia(id)
  if (!m) return NextResponse.json({ erro: 'midia indisponivel (a Meta guarda por 30 dias)' }, { status: 404 })
  // O WhatsApp manda voz em ogg/opus, que o Safari e o app no iPhone nao tocam. Converte pra
  // mp4/aac, que toca em todo lugar (dono, 14/09/2026). Se o ffmpeg falhar, vai o original.
  if (ehOggOpus(m.mime)) {
    const m4a = await paraM4a(m.bytes)
    if (m4a) {
      return new NextResponse(new Uint8Array(m4a), {
        headers: { 'content-type': 'audio/mp4', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' },
      })
    }
  }
  return new NextResponse(new Uint8Array(m.bytes), {
    headers: { 'content-type': m.mime, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' },
  })
}
