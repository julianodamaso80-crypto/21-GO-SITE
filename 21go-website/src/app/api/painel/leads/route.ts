import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { buscarPorId } from '@/lib/painel/usuarios'
import { leadsDoPainel } from '@/lib/painel/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req)
    const usuario = await buscarPorId(sessao.uid, sessao.slug)
    if (!usuario) throw new SemPermissao(401)

    const p = req.nextUrl.searchParams
    /**
     * O recorte do vendedor vem da SESSAO. O `?vendedor=` da URL so e obedecido
     * pra admin — senao qualquer divulgador leria a carteira dos outros
     * trocando um parametro.
     */
    const recorte = sessao.papel === 'admin' ? p.get('vendedor') || null : usuario.vendedorSlug

    const { itens, total } = await leadsDoPainel({
      consultorSlug: sessao.slug,
      vendedorSlug: recorte,
      de: p.get('de'),
      ate: p.get('ate'),
      pagina: Number(p.get('pagina') || 1),
      mascarar: sessao.papel !== 'admin',
    })

    return NextResponse.json({ itens, total, papel: sessao.papel })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/leads]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
