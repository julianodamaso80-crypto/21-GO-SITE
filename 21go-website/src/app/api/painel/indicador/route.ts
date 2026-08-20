import { NextRequest, NextResponse } from 'next/server'
import { normalizarWhatsapp } from '@/lib/painel/formato'
import { criarUsuario } from '@/lib/painel/usuarios'
import { criarIndicadorNoPower } from '@/lib/painel/power-indicador'
import { PAINEL_POR_CONSULTOR, hostDoPainel } from '@/lib/consultores-painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cadastro de indicador feito DE DENTRO do site do consultor (`/indique`).
 *
 * Existe porque o `/indique` gerava so um codigo `?ind=` do Member Get Member —
 * outra tabela, sem login — e quem se cadastrava por la nunca aparecia em "Quem
 * me indica" no painel. Eram dois sistemas parecidos resolvendo coisas
 * diferentes, e o dono do painel via o link errado.
 *
 * O irmao deste endpoint (`/api/painel/cadastro`) tira o consultor do HOST,
 * porque roda no subdominio do painel. Aqui o host e `21go.com.br`: o slug vem
 * no corpo e e conferido contra o mapa — so consultor COM painel aceita.
 *
 * Nao abre sessao: o cookie do painel pertence a outro dominio e nao pode ser
 * gravado daqui. A pessoa sai com o endereco de login na tela.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    consultorSlug?: string
    nome?: string
    email?: string
    whatsapp?: string
    senha?: string
  }

  const slug = (body.consultorSlug ?? '').trim().toLowerCase()
  if (!slug || !PAINEL_POR_CONSULTOR.has(slug)) {
    return NextResponse.json({ erro: 'consultor_sem_painel' }, { status: 404 })
  }

  const nome = (body.nome ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const senha = body.senha ?? ''
  const whatsapp = normalizarWhatsapp(body.whatsapp ?? '')

  if (nome.length < 3)
    return NextResponse.json({ erro: 'Escreva seu nome completo.' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 })
  if (!whatsapp)
    return NextResponse.json({ erro: 'WhatsApp inválido — use DDD e número.' }, { status: 400 })
  if (senha.length < 8)
    return NextResponse.json({ erro: 'A senha precisa de 8 caracteres ou mais.' }, { status: 400 })

  try {
    const usuario = await criarUsuario({ consultorSlug: slug, nome, email, whatsapp, senha })

    // Fora do await: a pessoa nao pode esperar o Power pra ver o proprio link,
    // e se o Power estiver fora do ar o cadastro dela continua valendo.
    void criarIndicadorNoPower({ consultorSlug: slug, nome, whatsapp, email })

    return NextResponse.json({
      ok: true,
      nome: usuario.nome,
      link: `https://21go.com.br/${slug}/${usuario.vendedorSlug}`,
      painel: `https://${hostDoPainel(slug)}`,
      email: usuario.email,
    })
  } catch (err) {
    const m = (err as Error).message
    if (m === 'email_em_uso')
      return NextResponse.json(
        { erro: 'Esse e-mail já tem cadastro. Entre no painel com ele.' },
        { status: 409 },
      )
    if (m === 'nome_invalido')
      return NextResponse.json({ erro: 'Escreva seu nome completo.' }, { status: 400 })
    console.error('[painel/indicador]', err)
    return NextResponse.json({ erro: 'Não deu pra concluir agora.' }, { status: 500 })
  }
}
