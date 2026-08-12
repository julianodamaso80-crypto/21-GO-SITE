import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { slugDoNome } from '@/lib/consultor'
import {
  buscarConsultorNoPower,
  nomeMascarado,
  telefoneMascarado,
} from '@/lib/power-consultor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Passo 1 do formulario: "esse e-mail e de quem?"
 *
 * Devolve o nome e o telefone MASCARADOS de proposito. O consultor precisa de
 * pouco pra se reconhecer ("Anderson C., (21) *****-9280"), e quem estiver
 * chutando e-mail nao leva nada aproveitavel. Sem isso, este endpoint viraria
 * uma forma de baixar a lista de consultores da 21Go a partir de e-mails.
 */

export async function POST(req: NextRequest) {
  let email = ''
  try {
    const corpo = (await req.json()) as { email?: string }
    email = (corpo.email || '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'e-mail inválido' }, { status: 400 })
  }

  let consultor
  try {
    consultor = await buscarConsultorNoPower(email)
  } catch {
    // Power fora do ar nao e "consultor nao existe": dizer isso mandaria embora
    // uma pessoa legitima. Melhor pedir pra tentar de novo.
    return NextResponse.json(
      { erro: 'não consegui falar com o Power agora. Tente de novo em instantes.' },
      { status: 503 },
    )
  }

  if (!consultor) {
    return NextResponse.json({ encontrado: false })
  }

  if (!consultor.telefone) {
    // Sem telefone no Power nao ha como provar que e ele. Vai pro humano.
    return NextResponse.json({
      encontrado: true,
      semTelefone: true,
      nome: nomeMascarado(consultor.nome),
    })
  }

  const supa = supabaseAdmin()

  // Ja tem site? (por e-mail, que e a chave unica na tabela)
  const { data: existente } = await supa
    .from('sites_consultor')
    .select('slug, status')
    .ilike('email', consultor.email)
    .maybeSingle()

  if (existente && existente.status !== 'cancelado') {
    return NextResponse.json({
      encontrado: true,
      jaTemSite: true,
      slug: existente.slug,
      status: existente.status,
    })
  }

  return NextResponse.json({
    encontrado: true,
    nome: nomeMascarado(consultor.nome),
    telefone: telefoneMascarado(consultor.telefone),
    slugSugerido: await slugLivre(slugDoNome(consultor.nome)),
  })
}

/**
 * Um slug que ainda nao existe.
 *
 * Homonimo acontece — a 21Go tem milhares de consultores. O primeiro "joaosilva"
 * fica com o slug limpo e o segundo vira "joaosilva2". Quem chegou antes nunca
 * perde o link que ja imprimiu no cartao.
 */
async function slugLivre(base: string): Promise<string> {
  const limpo = base || 'consultor'
  const supa = supabaseAdmin()

  const { data } = await supa
    .from('sites_consultor')
    .select('slug')
    .like('slug', `${limpo}%`)

  const ocupados = new Set((data || []).map((r) => r.slug as string))
  if (!ocupados.has(limpo)) return limpo

  for (let n = 2; n < 100; n++) {
    if (!ocupados.has(`${limpo}${n}`)) return `${limpo}${n}`
  }
  return `${limpo}${Date.now().toString().slice(-5)}`
}
