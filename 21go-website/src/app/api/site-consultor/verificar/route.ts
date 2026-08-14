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

  const sugestao = await sugerirSlug(slugDoNome(consultor.nome))

  return NextResponse.json({
    encontrado: true,
    nome: nomeMascarado(consultor.nome),
    telefone: telefoneMascarado(consultor.telefone),
    slugSugerido: sugestao.slug,
    slugOcupado: sugestao.ocupado,
    avisoSlug: sugestao.aviso,
  })
}

/**
 * Sugere o endereco do site a partir do nome do consultor.
 *
 * Homonimo acontece — a 21Go tem milhares de consultores. Antes o segundo
 * "gustavo" virava "gustavo2" automaticamente, em silencio. Isso saiu (ordem do
 * dono, 14/08/2026): **numero no endereco nao identifica ninguem**, e o
 * consultor descobria o "2" so depois de ja ter o link impresso no cartao.
 *
 * Agora o nome ocupado devolve `ocupado: true` e um aviso pedindo o sobrenome.
 * Quem chegou primeiro fica com o endereco limpo; o segundo escolhe um endereco
 * que de fato o identifica.
 */
async function sugerirSlug(
  base: string,
): Promise<{ slug: string; ocupado: boolean; aviso: string | null }> {
  const limpo = base || 'consultor'
  const supa = supabaseAdmin()

  const { data, error } = await supa
    .from('sites_consultor')
    .select('slug')
    .eq('slug', limpo)
    .maybeSingle()

  // Banco fora do ar nao pode inventar que o endereco esta livre: quem confirma
  // de verdade e o UNIQUE do insert, la no /contratar.
  if (error) return { slug: limpo, ocupado: false, aviso: null }

  if (!data) return { slug: limpo, ocupado: false, aviso: null }

  return {
    slug: '',
    ocupado: true,
    aviso: `Já existe um site em 21go.com.br/${limpo}. Complete com o seu sobrenome para o endereço identificar você.`,
  }
}
