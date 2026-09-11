import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, type ContatoIsa } from '@/lib/isa/banco'
import { enviarTexto } from '@/lib/isa/cloud'
import { transferir } from '@/lib/isa/acoes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Botao "Transferir pro 4824": o cliente recebe o link com o resumo e a Isa desliga. */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  const [c] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!c) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  if (!c.janela_ate || new Date(c.janela_ate).getTime() < Date.now()) {
    return NextResponse.json({ erro: 'a janela de 24h desse cliente fechou' }, { status: 409 })
  }
  try {
    await transferir(
      c,
      'manual',
      async (partes) => {
        for (const p of partes) await enviarTexto(telefone, p)
        return true
      },
      { avisarDono: false, por: s.u },
    )
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'falha' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
