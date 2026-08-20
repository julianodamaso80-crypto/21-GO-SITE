import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import {
  atualizarUsuario,
  redefinirSenha,
  desativarUsuario,
  excluirUsuario,
} from '@/lib/painel/usuarios'
import { normalizarWhatsapp } from '@/lib/painel/formato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    const b = (await req.json().catch(() => ({}))) as {
      acao?: 'editar' | 'senha' | 'ativar' | 'desativar'
      nome?: string
      email?: string
      whatsapp?: string
      senha?: string
    }

    if (b.acao === 'senha') {
      const nova = await redefinirSenha(id, sessao.slug, b.senha)
      return NextResponse.json({ ok: true, senha: nova })
    }
    if (b.acao === 'ativar' || b.acao === 'desativar') {
      // O admin nao pode se desativar: o painel ficaria sem dono e so um UPDATE
      // no banco resolveria.
      if (id === sessao.uid && b.acao === 'desativar')
        return NextResponse.json(
          { erro: 'Você não pode desativar seu próprio acesso.' },
          { status: 400 },
        )
      await desativarUsuario(id, sessao.slug, b.acao === 'ativar')
      return NextResponse.json({ ok: true })
    }

    const usuario = await atualizarUsuario(id, sessao.slug, {
      nome: b.nome,
      email: b.email,
      whatsapp: b.whatsapp === undefined ? undefined : normalizarWhatsapp(b.whatsapp),
    })
    return NextResponse.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome } })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'email_em_uso')
      return NextResponse.json({ erro: 'Esse e-mail já está cadastrado.' }, { status: 409 })
    if (m === 'admin_nao_desativa')
      return NextResponse.json({ erro: 'Não dá pra desativar o dono do painel.' }, { status: 400 })
    if (m === 'nao_encontrado') return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })
    console.error('[painel/usuarios PATCH]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    if (id === sessao.uid)
      return NextResponse.json(
        { erro: 'Você não pode excluir seu próprio acesso.' },
        { status: 400 },
      )

    /**
     * Exclusao e SOFT. Apagar a linha soltaria o slug pra outra pessoa e
     * reescreveria o historico de quem trouxe cada lead — o painel passaria a
     * mostrar comissao de gente errada.
     */
    await excluirUsuario(id, sessao.slug)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'admin_nao_desativa')
      return NextResponse.json({ erro: 'Não dá pra excluir o dono do painel.' }, { status: 400 })
    if (m === 'nao_encontrado') return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })
    console.error('[painel/usuarios DELETE]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
