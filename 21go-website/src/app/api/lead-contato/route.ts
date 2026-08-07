import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMPANY_ID = process.env.DEFAULT_COMPANY_ID || 'company-21go'

/**
 * Contato pelo portão do WhatsApp (WhatsAppGate) — FAQ, indicação e afins.
 *
 * Só GRAVA o lead. Não dispara WhatsApp nenhum: quem inicia a conversa é o
 * cliente, clicando no botão depois de preencher o formulário. Nenhum outbound
 * automático sai daqui (regra do dono, 07/08/2026).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      nome?: string
      whatsapp?: string
      assunto?: string
      origem?: string
    }

    const nome = body.nome?.trim()
    const digits = (body.whatsapp || '').replace(/\D/g, '')
    if (!nome || digits.length < 11) {
      return NextResponse.json(
        { success: false, error: 'nome e whatsapp são obrigatórios' },
        { status: 400 },
      )
    }

    const phoneE164 = digits.startsWith('55') ? digits : `55${digits}`
    const now = new Date().toISOString()
    const leadId = `lead_contato_${crypto.randomBytes(8).toString('hex')}`

    const { error } = await supabaseAdmin()
      .from('leads')
      .insert({
        id: leadId,
        company_id: COMPANY_ID,
        nome,
        telefone: phoneE164,
        whatsapp: phoneE164,
        origem: body.origem?.trim() || 'site_contato',
        qualificado_por: 'site_whatsapp_gate',
        etapa_funil: 'novo',
        status: 'lead',
        score_qualificacao: 0,
        cotacao_enviada: false,
        meta_capi_sent: false,
        google_ads_sent: false,
        follow_up_enviado: false,
        reengajamento_enviado: false,
        whatsapp_clicado: true,
        pdf_enviado: false,
        motivo_perda: body.assunto?.trim() || null,
        created_at: now,
        updated_at: now,
      })

    if (error) {
      console.error('[lead-contato] insert falhou', error.message)
      // O cliente já está indo pro WhatsApp — falha de banco não pode virar erro
      // na tela dele.
      return NextResponse.json({ success: false, error: 'persist_failed' }, { status: 200 })
    }

    return NextResponse.json({ success: true, leadId })
  } catch (err) {
    console.error('[lead-contato]', err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, error: 'unexpected' }, { status: 200 })
  }
}
