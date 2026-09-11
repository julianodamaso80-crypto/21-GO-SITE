import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento, type ContatoIsa } from '@/lib/isa/banco'
import { enviarTexto, EnvioBloqueado } from '@/lib/isa/cloud'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Resposta humana pelo 98004-0964 (painel ou CRM). Fora da janela de 24 h a Meta so aceita
 * template — o painel avisa em vez de tentar.
 *
 * Responder NAO desliga a Isa (dono, 11/09/2026): grava `humano_em` e a Isa nao manda nada por
 * cima dessa mensagem ate o cliente responder. Se o cliente responder e a Isa estiver ligada, ela
 * segue; quem quer atender sozinho desliga a chave.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; texto?: string }
  const telefone = (b.telefone || '').replace(/\D/g, '')
  const texto = (b.texto || '').trim()
  if (!telefone || !texto) return NextResponse.json({ erro: 'telefone e texto' }, { status: 400 })
  if (texto.length > 4000) return NextResponse.json({ erro: 'texto muito longo' }, { status: 400 })

  const [c] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!c) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  if (!c.janela_ate || new Date(c.janela_ate).getTime() < Date.now()) {
    return NextResponse.json({ erro: 'a janela de 24h desse cliente fechou — a Meta só deixa mandar template agora' }, { status: 409 })
  }

  try {
    const wamid = await enviarTexto(telefone, texto)
    await upsertMessage({
      conversation_id: c.conversation_id,
      whatsapp_message_id: wamid,
      evolution_instance: 'cloud_isa',
      jid: phoneToJid(telefone) ?? `${telefone}@s.whatsapp.net`,
      direction: 'outbound',
      status: 'SENT',
      sender: s.u,
      message_type: 'text',
      content: texto,
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof EnvioBloqueado) {
      return NextResponse.json({ erro: 'modo teste: a Isa só fala com os números liberados' }, { status: 403 })
    }
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'falha ao enviar' }, { status: 502 })
  }

  await sql(`UPDATE public.isa_contatos SET humano_em = now(), updated_at = now() WHERE telefone = $1`, [telefone])
  await registrarEvento(telefone, 'humano_respondeu', { isa: c.ligada ? 'ligada' : 'desligada' }, s.u)
  return NextResponse.json({ ok: true })
}
