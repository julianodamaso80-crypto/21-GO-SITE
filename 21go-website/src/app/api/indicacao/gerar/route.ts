import { NextRequest, NextResponse } from 'next/server'
import { garantirIndicador } from '@/lib/indicacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Gera (ou devolve) o link de indicacao da pessoa, na hora.
 *
 * Antes isto era uma conversa no WhatsApp com um humano do outro lado. Quem
 * pedia fora do horario comercial simplesmente nao recebia link — e indicacao
 * que nao acontece na hora do impulso nao acontece mais.
 */

function soDigitos(v: string): string {
  return (v || '').replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  let corpo: { nome?: string; whatsapp?: string; consultorSlug?: string | null }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400 })
  }

  const nome = (corpo.nome || '').trim()
  const digitos = soDigitos(corpo.whatsapp || '')

  if (nome.length < 3) {
    return NextResponse.json({ erro: 'me diga seu nome completo' }, { status: 400 })
  }
  if (digitos.length < 10 || digitos.length > 13) {
    return NextResponse.json({ erro: 'WhatsApp incompleto' }, { status: 400 })
  }

  const whatsapp = '55' + digitos.replace(/^55/, '')

  // O slug so entra se parecer slug: ele vem do navegador e vira parte do link
  // que a pessoa vai espalhar.
  const slug =
    corpo.consultorSlug && /^[a-z0-9]{3,40}$/.test(corpo.consultorSlug)
      ? corpo.consultorSlug
      : null

  try {
    const ind = await garantirIndicador({ nome, whatsapp, consultorSlug: slug })

    // O link nasce dentro do site de quem indicou: se a Maria pegou o link no
    // site do Anderson, o amigo dela entra pelo site do Anderson e o lead
    // continua caindo no Power dele. A indicacao nao rouba o lead do consultor.
    const base = slug ? `https://21go.com.br/${slug}` : 'https://21go.com.br'

    return NextResponse.json({
      codigo: ind.codigo,
      nome: ind.nome,
      link: `${base}?ind=${ind.codigo}`,
    })
  } catch (err) {
    console.error('[indicacao]', (err as Error).message)
    return NextResponse.json({ erro: 'não consegui gerar seu link agora' }, { status: 500 })
  }
}
