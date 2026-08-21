import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateQuotePdf } from '@/lib/pdf-quote'
import { isStorageConfigured, uploadPdf } from '@/lib/storage'
import {
  buildExcludedMessage,
  buildFollowUpMessage,
  formatPhone,
  getEvolutionInstance,
  isWhatsappConfigured,
  sendPdfMedia,
  sendText,
} from '@/lib/whatsapp'
import { upsertConversation, upsertMessage, phoneToJid } from '@/lib/supabase-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint admin pra re-enviar PDF/WhatsApp de um lead.
 *
 * Auth: header `x-admin-token: <ADMIN_TOKEN>` (env ADMIN_RESEND_TOKEN).
 * Sem token configurado, endpoint fica bloqueado (404).
 *
 * Uso:
 *   POST /api/admin/resend
 *   Body: { "leadId": "lead_xyz" }            → busca dados no Supabase
 *   ou:    { "trk": "xyz" }                    → idem, busca por trk
 *   ou:    { "phone": "5521987654321", ... }   → re-envia com dados explícitos
 *
 * Sempre marca pdf_enviado=true e pdf_erro=null em sucesso.
 */

const ADMIN_TOKEN = process.env.ADMIN_RESEND_TOKEN || ''

interface AdminResendBody {
  leadId?: string
  trk?: string
  // re-envio manual sem lead salvo
  phone?: string
  nome?: string
  marca?: string
  modelo?: string
  ano?: string | number
  valorFipe?: number
  plano?: string
  valorMensal?: number
  placa?: string | null
  email?: string | null
  cor?: string | null
  carroApp?: boolean
  leilao?: string
  seguroAtual?: string | null
  mode?: 'pdf' | 'text' | 'auto'
}

export async function POST(req: NextRequest) {
  if (!ADMIN_TOKEN) {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (req.headers.get('x-admin-token') !== ADMIN_TOKEN) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let body: AdminResendBody
  try {
    body = (await req.json()) as AdminResendBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json({ ok: false, error: 'whatsapp_not_configured' }, { status: 503 })
  }

  // Resolver dados do lead
  const supa = supabaseAdmin()
  let leadData: Record<string, unknown> | null = null

  if (body.leadId || body.trk) {
    const filter = body.leadId
      ? { col: 'id', val: body.leadId }
      : { col: 'trk', val: body.trk! }
    const { data, error } = await supa
      .from('leads')
      .select(
        'id, nome, telefone, whatsapp, email, placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado, cotacao_plano, cotacao_valor, carro_app, leilao, seguro_atual, consultor_slug',
      )
      .eq(filter.col, filter.val)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 })
    leadData = data as Record<string, unknown>
  }

  // Compor entrada de envio
  const nome = (body.nome ?? (leadData?.nome as string)) || ''
  const phone = body.phone || (leadData?.telefone as string) || (leadData?.whatsapp as string)
  if (!nome || !phone) {
    return NextResponse.json({ ok: false, error: 'nome_e_phone_obrigatorios' }, { status: 400 })
  }

  const marca = body.marca ?? (leadData?.marca_interesse as string | null)
  const modelo = body.modelo ?? (leadData?.modelo_interesse as string | null)
  const ano = body.ano ?? (leadData?.ano_interesse as number | null) ?? ''
  const valorFipe =
    body.valorFipe ?? (leadData?.valor_fipe_consultado as number | null) ?? undefined
  const plano = body.plano ?? (leadData?.cotacao_plano as string | null) ?? undefined
  const valorMensal =
    body.valorMensal ?? (leadData?.cotacao_valor as number | null) ?? undefined
  const placa = body.placa ?? (leadData?.placa_interesse as string | null) ?? undefined
  const carroApp = body.carroApp ?? !!leadData?.carro_app
  const leilao = body.leilao ?? (leadData?.leilao as string | null) ?? undefined
  const seguroAtual = body.seguroAtual ?? (leadData?.seguro_atual as string | null) ?? undefined

  const formattedPhone = formatPhone(phone)
  const jid = phoneToJid(formattedPhone)
  const instance = getEvolutionInstance()
  const leadId = (leadData?.id as string) || `manual_${Date.now()}`
  const mode = body.mode ?? 'auto'

  // Plano EXCLUIDO ou modo text — manda só texto
  const isExcluded = (plano || '').toUpperCase() === 'EXCLUIDO'
  const dadosCompletos = !!marca && !!modelo && !!valorFipe && !!plano && !!valorMensal
  const usePdf = mode === 'pdf' || (mode === 'auto' && dadosCompletos && !isExcluded)

  try {
    if (!usePdf) {
      const text = isExcluded
        ? buildExcludedMessage({
            nome,
            whatsapp: phone,
            placa,
            marca,
            modelo,
            ano,
            fipe: valorFipe,
          })
        : buildFollowUpMessage({ nome, marca, modelo, placa })

      const result = await sendText(formattedPhone, text)

      if (jid && result.whatsapp_message_id) {
        const conv = await upsertConversation({
          jid,
          evolution_instance: instance,
          contact_phone: formattedPhone,
          contact_name: nome,
          lead_id: leadData?.id ? (leadData.id as string) : null,
        })
        await upsertMessage({
          conversation_id: conv.id,
          whatsapp_message_id: result.whatsapp_message_id,
          evolution_instance: instance,
          jid,
          direction: 'outbound',
          status: 'PENDING',
          message_type: 'text',
          content: text,
          raw_payload: result.raw,
          sent_at: new Date().toISOString(),
          lead_id: leadData?.id ? (leadData.id as string) : null,
        })
      }
      if (leadData?.id) {
        await supa
          .from('leads')
          .update({ pdf_enviado: false, updated_at: new Date().toISOString() })
          .eq('id', leadData.id as string)
      }
      return NextResponse.json({ ok: true, sent: 'text', leadId })
    }

    // PDF
    if (!marca || !modelo) {
      return NextResponse.json(
        { ok: false, error: 'marca e modelo sao obrigatorios pra gerar PDF' },
        { status: 400 },
      )
    }
    const filename = `simulacao-21go-${leadId}.pdf`
    // Mesmo motivo do /api/pdfs/[leadId]: reenviar um lead de site vendido sem
    // o slug faria o PDF sair com o botao da casa e o rodape da casa.
    const pdf = await generateQuotePdf({
      consultorSlug: (leadData?.consultor_slug as string | null) ?? null,
      nome,
      whatsapp: phone,
      email: (body.email ?? leadData?.email) as string | null,
      placa: placa ?? null,
      marca,
      modelo,
      ano,
      cor: body.cor ?? null,
      fipe: valorFipe!,
      planoNome: plano!,
      mensalidade: valorMensal!,
      isMoto: (marca || '').toLowerCase().includes('moto'),
      carroApp,
      leilao,
      seguroAtual,
    })

    let media: string
    let pdfUrl: string | null = null
    if (isStorageConfigured()) {
      try {
        const key = `quotes/${new Date().toISOString().slice(0, 10)}/${leadId}.pdf`
        const { url } = await uploadPdf(key, pdf, filename)
        media = url
        pdfUrl = url
      } catch {
        media = pdf.toString('base64')
      }
    } else {
      media = pdf.toString('base64')
    }

    const caption = buildFollowUpMessage({ nome, marca, modelo, placa })
    const result = await sendPdfMedia(formattedPhone, media, caption, filename)

    if (jid && result.whatsapp_message_id) {
      const conv = await upsertConversation({
        jid,
        evolution_instance: instance,
        contact_phone: formattedPhone,
        contact_name: nome,
        lead_id: leadData?.id ? (leadData.id as string) : null,
      })
      await upsertMessage({
        conversation_id: conv.id,
        whatsapp_message_id: result.whatsapp_message_id,
        evolution_instance: instance,
        jid,
        direction: 'outbound',
        status: 'PENDING',
        message_type: 'document',
        content: caption,
        caption,
        media_url: pdfUrl,
        media_filename: filename,
        media_mime_type: 'application/pdf',
        raw_payload: result.raw,
        sent_at: new Date().toISOString(),
        lead_id: leadData?.id ? (leadData.id as string) : null,
      })
    }
    if (leadData?.id) {
      await supa
        .from('leads')
        .update({
          pdf_enviado: true,
          pdf_enviado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadData.id as string)
    }

    return NextResponse.json({
      ok: true,
      sent: 'pdf',
      leadId,
      whatsapp_message_id: result.whatsapp_message_id,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/resend] falha:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!ADMIN_TOKEN || req.headers.get('x-admin-token') !== ADMIN_TOKEN) {
    return new NextResponse('Not Found', { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    endpoint: 'admin/resend',
    usage: 'POST com header x-admin-token e body {leadId|trk|phone+nome+...}',
  })
}
