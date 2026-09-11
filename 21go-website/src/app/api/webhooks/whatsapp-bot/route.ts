import { NextRequest, NextResponse } from 'next/server'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'
import { assinaturaConfere, mensagensDoNumero, podeResponder } from '@/lib/whatsapp-cloud'
import { mensagemJaGravada, registrarInbound } from '@/lib/isa/banco'
import { processarFila } from '@/lib/isa/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook da WhatsApp Cloud API para o robô de atendimento (Isa), número 98004-0964.
 *
 * Só a WABA de vendas aponta para cá, via override_callback_uri — o app "21 GO" continua com o
 * callback do CRM (crm21go.site) para o número dele. Mesmo assim filtramos por phone_number_id.
 *
 * Grava a mensagem e, se ela e nova, coloca o cliente na fila da Isa (src/lib/isa/worker.ts).
 * Quem responde e o worker — sempre atras da trava de teste (ISA_MODO_TESTE / ISA_ALLOWLIST).
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
  let chegouNova = false
  for (const m of mensagensDoNumero(payload, phoneId)) {
    const jid = phoneToJid(m.from) ?? `${m.from}@s.whatsapp.net`
    const responderia = podeResponder(m.from, {
      modoTeste: process.env.ISA_MODO_TESTE,
      allowlist: process.env.ISA_ALLOWLIST,
    })
    console.log(`[isa] recebida ${m.tipo} de ${m.from.slice(0, 6)}*** | responderia=${responderia}`)

    try {
      // A Meta reentrega eventos. A gravacao ja e idempotente, mas a resposta nao seria: so
      // mensagem que ainda nao existia coloca o cliente na fila da Isa.
      const nova = !(await mensagemJaGravada(m.id).catch(() => false))
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
      if (nova) {
        await registrarInbound({ telefone: m.from, conversationId: conversa.id, nome: m.nome })
        chegouNova = true
      }
    } catch (err) {
      console.error('[isa] falha ao gravar mensagem', m.id, err)
    }
  }

  // Responde a Meta ja; a Isa entra quando o cliente parar de digitar. Se o container cair antes,
  // o cron de 1 em 1 minuto pega — o estado da fila mora no banco.
  if (chegouNova) {
    setTimeout(() => {
      processarFila().catch((err) => console.error('[isa] fila (webhook):', err))
    }, 10_500)
  }

  return NextResponse.json({ ok: true })
}
