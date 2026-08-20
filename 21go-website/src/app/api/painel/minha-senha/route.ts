import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao, COOKIE_SESSAO, segredoSessao } from '@/lib/painel/contexto'
import { buscarPorEmail, buscarPorId, redefinirSenha } from '@/lib/painel/usuarios'
import { conferirSenha } from '@/lib/painel/senha'
import { assinarSessao, DURACAO_SESSAO_MS } from '@/lib/painel/sessao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Qualquer um troca a PROPRIA senha — o dono inclusive, que ate agora dependia
 * de mim pra isso.
 *
 * Exige a senha atual. Sem isso, um notebook deixado aberto vira uma troca de
 * senha e a perda da conta.
 */
export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req)
    const b = (await req.json().catch(() => ({}))) as { atual?: string; nova?: string }

    const nova = b.nova ?? ''
    if (nova.length < 8)
      return NextResponse.json({ erro: 'A nova senha precisa de 8 caracteres ou mais.' }, { status: 400 })

    const usuario = await buscarPorId(sessao.uid, sessao.slug)
    if (!usuario) throw new SemPermissao(401)

    const comHash = await buscarPorEmail(sessao.slug, usuario.email)
    if (!comHash || !conferirSenha(b.atual ?? '', comHash.senhaHash))
      return NextResponse.json({ erro: 'Senha atual incorreta.' }, { status: 400 })

    await redefinirSenha(sessao.uid, sessao.slug, nova)

    /**
     * Trocar a senha sobe o `token_versao`, o que derruba TODA sessao — a desta
     * aba inclusive. Reemitimos aqui pra quem trocou continuar de pe; as outras
     * (celular, outro navegador) caem, que e o efeito desejado.
     */
    const res = NextResponse.json({ ok: true })
    res.cookies.set(
      COOKIE_SESSAO,
      assinarSessao(
        {
          uid: usuario.id,
          slug: sessao.slug,
          papel: usuario.papel,
          v: usuario.tokenVersao + 1,
          exp: Date.now() + DURACAO_SESSAO_MS,
        },
        segredoSessao(),
      ),
      { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: DURACAO_SESSAO_MS / 1000 },
    )
    return res
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/minha-senha]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
