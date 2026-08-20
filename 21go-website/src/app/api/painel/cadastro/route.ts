import { NextRequest, NextResponse } from 'next/server'
import { normalizarWhatsapp } from '@/lib/painel/formato'
import { assinarSessao, DURACAO_SESSAO_MS } from '@/lib/painel/sessao'
import { criarUsuario } from '@/lib/painel/usuarios'
import { COOKIE_SESSAO, consultorDoHost, segredoSessao } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROS: Record<string, { status: number; msg: string }> = {
  email_em_uso: { status: 409, msg: 'Esse e-mail já tem cadastro. Tente entrar.' },
  nome_invalido: { status: 400, msg: 'Escreva seu nome completo.' },
}

export async function POST(req: NextRequest) {
  const slug = consultorDoHost(req)
  if (!slug) return NextResponse.json({ erro: 'host_invalido' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    nome?: string
    email?: string
    whatsapp?: string
    senha?: string
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

  let usuario
  try {
    usuario = await criarUsuario({ consultorSlug: slug, nome, email, whatsapp, senha })
  } catch (err) {
    const conhecido = ERROS[(err as Error).message]
    if (conhecido) return NextResponse.json({ erro: conhecido.msg }, { status: conhecido.status })
    console.error('[painel/cadastro]', err)
    return NextResponse.json({ erro: 'Não deu pra concluir agora.' }, { status: 500 })
  }

  // Ja entra logado: a pessoa acabou de digitar a senha, mandar ela pra tela de
  // login de novo so cria chance de errar e desistir.
  const token = assinarSessao(
    {
      uid: usuario.id,
      slug,
      papel: usuario.papel,
      v: usuario.tokenVersao,
      exp: Date.now() + DURACAO_SESSAO_MS,
    },
    segredoSessao(),
  )

  const res = NextResponse.json({
    ok: true,
    nome: usuario.nome,
    link: `https://21go.com.br/${slug}/${usuario.vendedorSlug}`,
  })
  res.cookies.set(COOKIE_SESSAO, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  /**
   * So pra TELA saber o que mostrar (esconder a aba "Equipe" de quem nao e
   * dono). Nao e httpOnly de proposito e nao vale como permissao: quem decide
   * continua sendo a sessao assinada, conferida no servidor a cada rota.
   */
  res.cookies.set('painel_papel', usuario.papel, {
    path: '/',
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  return res
}
