import { NextRequest, NextResponse } from 'next/server'
import { pickWhatsAppTarget } from '@/lib/whatsapp-rotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Redireciona o cliente pro WhatsApp aplicando o rodízio 2:1 (ver
 * whatsapp-rotation.ts). Todo link de contato do site aponta pra cá em vez de
 * apontar pro wa.me direto — é o que garante que os contatos se dividam entre
 * os dois chips.
 *
 * Só roda quando o cliente CLICA. O site não dispara mais mensagem sozinho
 * depois da cotação (decisão do dono, 2026-07-29) — contato frio automático era
 * o que vinha derrubando os números.
 *
 * GET /api/wa?text=<mensagem opcional ja decodificada>
 */
export async function GET(req: NextRequest) {
  const target = pickWhatsAppTarget()
  const text = req.nextUrl.searchParams.get('text')

  const url = new URL(`https://wa.me/${target.number}`)
  if (text) url.searchParams.set('text', text)

  console.log(`[wa] -> ${target.number} (${target.instance})`)

  // 302: o clique não deve ficar em cache do navegador nem de CDN, senão o
  // rodízio congela no primeiro número sorteado.
  const res = NextResponse.redirect(url.toString(), 302)
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return res
}
