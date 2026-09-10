import { NextRequest, NextResponse } from 'next/server'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { assinaturaConfere, mensagensDoNumero, podeResponder } from '@/lib/whatsapp-cloud'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook da WhatsApp Cloud API para o robô de atendimento (Isa), número 98004-0964.
 *
 * Só a WABA de vendas aponta para cá, via override_callback_uri — o app "21 GO" continua com o
 * callback do CRM (crm21go.site) para o número dele. Mesmo assim filtramos por phone_number_id.
 *
 * Etapa atual: RECEBE E GRAVA, não responde nada. A decisão da allowlist só vai para o log,
 * para provar a trava antes de existir qualquer envio.
 *
 * Responde 200 mesmo em erro: a Meta desativa o endpoint que devolve erro repetido. Isso inclui
 * assinatura inválida — se o App Secret for trocado no painel e não aqui, tudo passa a ser
 * descartado em silêncio; o log `[isa] assinatura invalida` é o sinal.
 */

const ORIGEM = 'cloud_isa'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const token = process.env.WA_VERIFY_TOKEN

  // A Meta só salva o callback se receber o hub.challenge cru, em texto puro.
  if (q.get('hub.mode') === 'subscribe' && token && q.get('hub.verify_token') === token) {
    return new NextResponse(q.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return new NextResponse('forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const corpo = await req.text()

  if (!assinaturaConfere(corpo, req.headers.get('x-hub-signature-256'), process.env.WA_APP_SECRET ?? '')) {
    console.warn('[isa] assinatura invalida — descartado')
    return NextResponse.json({ ok: true })
  }

  let payload: unknown
  try {
    payload = JSON.parse(corpo)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const phoneId = process.env.WA_PHONE_ID ?? ''
  for (const m of mensagensDoNumero(payload, phoneId)) {
    const jid = phoneToJid(m.from) ?? `${m.from}@s.whatsapp.net`
    const responderia = podeResponder(m.from, {
      modoTeste: process.env.ISA_MODO_TESTE,
      allowlist: process.env.ISA_ALLOWLIST,
    })
    console.log(`[isa] recebida ${m.tipo} de ${m.from.slice(0, 6)}*** | responderia=${responderia}`)

    try {
      const conversa = await upsertConversation({
        jid,
        evolution_instance: ORIGEM,
        contact_phone: m.from,
        pushname: m.nome,
      })
      await upsertMessage({
        conversation_id: conversa.id,
        whatsapp_message_id: m.id,
        evolution_instance: ORIGEM,
        jid,
        direction: 'inbound',
        message_type: m.tipo,
        content: m.texto,
        pushname: m.nome,
        raw_payload: payload,
        sent_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
      })
    } catch (err) {
      console.error('[isa] falha ao gravar mensagem', m.id, err)
    }
  }

  return NextResponse.json({ ok: true })
}
