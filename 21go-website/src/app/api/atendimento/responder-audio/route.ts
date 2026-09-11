import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento, type ContatoIsa } from '@/lib/isa/banco'
import { enviarAudio, EnvioBloqueado } from '@/lib/isa/cloud'
import { ehOggOpus, paraOggOpus } from '@/lib/isa/audio'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAMANHO_MAXIMO = 16 * 1024 * 1024

/**
 * Resposta em ÁUDIO pelo painel/CRM (dono, 11/09/2026). O navegador manda o que gravou
 * (webm/opus no Chrome, mp4/aac no iPhone) e aqui vira ogg/opus, o formato de mensagem de voz
 * da Meta. Mesmas travas do texto: sessão, janela de 24 h e `humano_em`.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('audio')
  const telefone = String(form?.get('telefone') ?? '').replace(/\D/g, '')
  if (!telefone || !(arquivo instanceof File)) return NextResponse.json({ erro: 'telefone e audio' }, { status: 400 })
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: 'audio vazio ou grande demais' }, { status: 400 })

  const [c] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!c) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  if (!c.janela_ate || new Date(c.janela_ate).getTime() < Date.now()) {
    return NextResponse.json({ erro: 'a janela de 24h desse cliente fechou — a Meta só deixa mandar template agora' }, { status: 409 })
  }

  const bruto = Buffer.from(await arquivo.arrayBuffer())
  const ogg = ehOggOpus(arquivo.type) ? bruto : await paraOggOpus(bruto)
  if (!ogg) return NextResponse.json({ erro: 'não consegui converter o áudio aqui — tente de novo' }, { status: 500 })

  try {
    const wamid = await enviarAudio(telefone, ogg)
    await upsertMessage({
      conversation_id: c.conversation_id,
      whatsapp_message_id: wamid,
      evolution_instance: 'cloud_isa',
      jid: phoneToJid(telefone) ?? `${telefone}@s.whatsapp.net`,
      direction: 'outbound',
      status: 'SENT',
      sender: s.u,
      message_type: 'audio',
      content: '🎤 áudio',
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof EnvioBloqueado) {
      return NextResponse.json({ erro: 'modo teste: a Isa só fala com os números liberados' }, { status: 403 })
    }
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'falha ao enviar' }, { status: 502 })
  }

  await sql(`UPDATE public.isa_contatos SET humano_em = now(), updated_at = now() WHERE telefone = $1`, [telefone])
  await registrarEvento(telefone, 'humano_respondeu', { tipo: 'audio', isa: c.ligada ? 'ligada' : 'desligada' }, s.u)
  return NextResponse.json({ ok: true })
}
