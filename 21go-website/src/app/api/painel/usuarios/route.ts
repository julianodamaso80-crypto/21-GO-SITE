import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { listarUsuarios, criarUsuario } from '@/lib/painel/usuarios'
import { gerarSenha } from '@/lib/painel/senha'
import { normalizarWhatsapp } from '@/lib/painel/formato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const usuarios = await listarUsuarios(sessao.slug)
    return NextResponse.json({
      itens: usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        papel: u.papel,
        ativo: u.ativo,
        link: `https://21go.com.br/${sessao.slug}/${u.vendedorSlug}`,
        vendedorSlug: u.vendedorSlug,
        criadoEm: u.criadoEm,
        ultimoLoginEm: u.ultimoLoginEm,
      })),
    })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/usuarios GET]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const b = (await req.json().catch(() => ({}))) as {
      nome?: string
      email?: string
      whatsapp?: string
      senha?: string
    }

    const nome = (b.nome ?? '').trim()
    const email = (b.email ?? '').trim().toLowerCase()
    if (nome.length < 3)
      return NextResponse.json({ erro: 'Escreva o nome completo.' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 })

    // Senha gerada quando o admin nao digita uma: ela aparece na tela dele, que
    // repassa como quiser. Nada sai pelo nosso WhatsApp (REGRA 0.1).
    const senha = b.senha && b.senha.length >= 8 ? b.senha : gerarSenha()

    const usuario = await criarUsuario({
      consultorSlug: sessao.slug,
      nome,
      email,
      whatsapp: normalizarWhatsapp(b.whatsapp ?? ''),
      senha,
    })

    return NextResponse.json({
      ok: true,
      senha,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        link: `https://21go.com.br/${sessao.slug}/${usuario.vendedorSlug}`,
      },
    })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'email_em_uso')
      return NextResponse.json({ erro: 'Esse e-mail já está cadastrado.' }, { status: 409 })
    if (m === 'nome_invalido')
      return NextResponse.json({ erro: 'Nome curto demais.' }, { status: 400 })
    console.error('[painel/usuarios POST]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
