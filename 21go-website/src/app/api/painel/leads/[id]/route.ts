import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizarWhatsapp } from '@/lib/painel/formato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Editar, comentar e ocultar um lead do painel.
 *
 * ⚠️ Todo update carrega `.eq('consultor_slug', sessao.slug)`. A tabela `leads`
 * e a mesma de TODOS os sites e do CRM: sem esse filtro, um id adivinhado
 * deixaria o dono de um painel escrever no lead de outro consultor.
 *
 * So admin. O divulgador le o que trouxe; mexer no dado do cliente e do dono.
 */

async function conferirDono(id: string, consultorSlug: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
    .maybeSingle()
  return !!data
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    if (!(await conferirDono(id, sessao.slug)))
      return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })

    const b = (await req.json().catch(() => ({}))) as {
      nome?: string
      telefone?: string
      nota?: string
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (b.nome !== undefined) {
      const nome = b.nome.trim()
      if (nome.length < 2)
        return NextResponse.json({ erro: 'Nome curto demais.' }, { status: 400 })
      patch.nome = nome
    }
    if (b.telefone !== undefined) {
      const tel = normalizarWhatsapp(b.telefone)
      if (!tel) return NextResponse.json({ erro: 'WhatsApp inválido.' }, { status: 400 })
      patch.telefone = tel
      patch.whatsapp = tel
    }
    // Nota vazia limpa o comentario — e o jeito de desfazer sem botao extra.
    if (b.nota !== undefined) patch.nota_painel = b.nota.trim() || null

    const { error } = await supabaseAdmin()
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('consultor_slug', sessao.slug)
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/leads PATCH]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    if (!(await conferirDono(id, sessao.slug)))
      return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })

    /**
     * OCULTA, nao apaga. A linha alimenta o funil do PowerCRM e o historico de
     * quem indicou; apagar seria reescrever o passado de quem ganha comissao.
     */
    const { error } = await supabaseAdmin()
      .from('leads')
      .update({ oculto_painel_em: new Date().toISOString() })
      .eq('id', id)
      .eq('consultor_slug', sessao.slug)
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao)
      return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/leads DELETE]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
