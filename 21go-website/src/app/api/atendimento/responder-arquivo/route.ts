import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { sql, registrarEvento, type ContatoIsa } from '@/lib/isa/banco'
import { enviarArquivo, EnvioBloqueado } from '@/lib/isa/cloud'
import { tipoDeAnexo, nomeDoAnexo, anexoRecusado } from '@/lib/isa/envio.regras'
import { upsertMessage, phoneToJid } from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Print ou documento pelo painel/CRM (dono, 14/09/2026): "o cliente ja manda print e doc pelo
 * WhatsApp dele; quero poder mandar tambem". Mesmas travas do texto e do audio: sessao, janela
 * de 24 h e `humano_em`.
 */
export async function POST(req: NextRequest) {
  const s = sessaoDoRequest(req)
  if (!s) return NextResponse.json({ erro: 'sem sessao' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  const telefone = String(form?.get('telefone') ?? '').replace(/\D/g, '')
  const legenda = String(form?.get('legenda') ?? '')
  if (!telefone || !(arquivo instanceof File)) return NextResponse.json({ erro: 'telefone e arquivo' }, { status: 400 })

  const tipo = tipoDeAnexo(arquivo.type)
  const recusa = anexoRecusado({ tamanho: arquivo.size, tipo })
  if (recusa) return NextResponse.json({ erro: recusa }, { status: 400 })

  const [c] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!c) return NextResponse.json({ erro: 'contato nao encontrado' }, { status: 404 })
  if (!c.janela_ate || new Date(c.janela_ate).getTime() < Date.now()) {
    return NextResponse.json({ erro: 'a janela de 24h desse cliente fechou — a Meta só deixa mandar template agora' }, { status: 409 })
  }

  const nome = nomeDoAnexo(arquivo.name, tipo)
  // O mime do documento vai como veio; imagem sem mime reconhecido nunca chega aqui (vira documento).
  const mime = arquivo.type || (tipo === 'image' ? 'image/jpeg' : 'application/octet-stream')

  try {
    const wamid = await enviarArquivo(telefone, Buffer.from(await arquivo.arrayBuffer()), { tipo, mime, nome, legenda })
    await upsertMessage({
      conversation_id: c.conversation_id,
      whatsapp_message_id: wamid,
      evolution_instance: 'cloud_isa',
      jid: phoneToJid(telefone) ?? `${telefone}@s.whatsapp.net`,
      direction: 'outbound',
      status: 'SENT',
      sender: s.u,
      message_type: tipo,
      content: legenda.trim() || (tipo === 'image' ? `🖼 ${nome}` : `📄 ${nome}`),
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof EnvioBloqueado) {
      return NextResponse.json({ erro: 'modo teste: a Isa só fala com os números liberados' }, { status: 403 })
    }
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'falha ao enviar' }, { status: 502 })
  }

  await sql(`UPDATE public.isa_contatos SET humano_em = now(), updated_at = now() WHERE telefone = $1`, [telefone])
  await registrarEvento(telefone, 'humano_respondeu', { tipo, isa: c.ligada ? 'ligada' : 'desligada' }, s.u)
  return NextResponse.json({ ok: true })
}
