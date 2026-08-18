import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { buscarPorId } from '@/lib/painel/usuarios'
import { resumoDoPainel } from '@/lib/painel/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req)
    const usuario = await buscarPorId(sessao.uid, sessao.slug)
    if (!usuario) throw new SemPermissao(401)

    const recorte = sessao.papel === 'admin' ? null : usuario.vendedorSlug
    const resumo = await resumoDoPainel(sessao.slug, recorte)

    return NextResponse.json({
      papel: sessao.papel,
      nome: usuario.nome,
      link: `https://21go.com.br/${sessao.slug}/${usuario.vendedorSlug}`,
      resumo,
    })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/resumo]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
