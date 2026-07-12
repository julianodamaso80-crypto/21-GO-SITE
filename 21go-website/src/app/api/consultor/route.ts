import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'sitelet1234'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const NOTIFY_NUMBER = process.env.NOTIFY_NUMBER || '5521965774240'
const COMPANY_ID = process.env.DEFAULT_COMPANY_ID || 'company-21go'

function isValidWhatsApp(v: string): boolean {
  const digits = v.replace(/\D/g, '')
  if (digits.length < 11) return false
  const ddd = parseInt(digits.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  if (digits[2] !== '9') return false
  return digits.length === 11
}

// Cai no funil de "Vendas de Consultores" — fase com menor `position`.
// Resolução é dinâmica (busca por nome) pra sobreviver a recriação dos seeds.
async function resolveConsultorTarget(
  supa: ReturnType<typeof supabaseAdmin>,
): Promise<{ pipeId: string; phaseId: string; createdById: string } | null> {
  const { data: pipes } = await supa
    .from('pipes')
    .select('id, name')
    .eq('company_id', COMPANY_ID)
    .ilike('name', '%consultor%')
    .limit(1)
  const pipe = pipes?.[0]
  if (!pipe) return null

  const { data: phases } = await supa
    .from('phases')
    .select('id, position')
    .eq('pipe_id', pipe.id)
    .order('position', { ascending: true })
    .limit(1)
  const phase = phases?.[0]
  if (!phase) return null

  // Card.created_by_id é NOT NULL — usa um admin/gestor da empresa
  const { data: users } = await supa
    .from('users')
    .select('id, role')
    .eq('company_id', COMPANY_ID)
    .in('role', ['admin', 'gestor'])
    .limit(1)
  const user = users?.[0]
  if (!user) return null

  return { pipeId: pipe.id, phaseId: phase.id, createdById: user.id }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, email, contato, cidade, estado, experiencia } = body as {
      nome?: string
      email?: string
      contato?: string
      cidade?: string
      estado?: string
      experiencia?: string
    }

    if (!nome?.trim() || !email?.trim() || !contato?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nome, e-mail e contato são obrigatórios.' },
        { status: 400 },
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'E-mail inválido.' },
        { status: 400 },
      )
    }
    if (!isValidWhatsApp(contato)) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp inválido (DDD + 9 dígitos).' },
        { status: 400 },
      )
    }

    // Normaliza telefone com DDI Brasil pra bater com formato do CRM/Evolution
    const phoneDigits = contato.replace(/\D/g, '')
    const phoneE164 = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`

    const supa = supabaseAdmin()
    const now = new Date().toISOString()
    const leadId = `lead_consultor_${crypto.randomBytes(8).toString('hex')}`

    // 1) Grava o lead — vira fonte de dados pro agente IA e pra qualquer flow do CRM
    const localContext = [cidade?.trim(), estado?.trim()].filter(Boolean).join(' - ')
    const leadDescription = [
      localContext && `Local: ${localContext}`,
      experiencia?.trim() && `Experiência: ${experiencia.trim()}`,
    ].filter(Boolean).join(' | ')

    const { error: leadErr } = await supa.from('leads').insert({
      id: leadId,
      company_id: COMPANY_ID,
      nome: nome.trim(),
      email: email.trim(),
      telefone: phoneE164,
      whatsapp: phoneE164,
      origem: 'seja_consultor',
      qualificado_por: 'site_consultor',
      etapa_funil: 'novo',
      status: 'lead',
      score_qualificacao: 0,
      cotacao_enviada: false,
      meta_capi_sent: false,
      google_ads_sent: false,
      follow_up_enviado: false,
      reengajamento_enviado: false,
      whatsapp_clicado: false,
      pdf_enviado: false,
      motivo_perda: leadDescription || null,
      created_at: now,
      updated_at: now,
    })

    let cardId: string | null = null
    let cardWarning: string | null = null

    if (leadErr) {
      console.error('[consultor] insert leads falhou', leadErr)
      cardWarning = `lead_insert_failed:${leadErr.code || 'unknown'}`
    } else {
      // 2) Cria o card no Kanban — vai pra primeira fase do "Funil de Consultores"
      const target = await resolveConsultorTarget(supa)
      if (!target) {
        cardWarning = 'pipe_or_phase_or_user_not_found'
        console.warn('[consultor] funil de consultor não resolvido — lead gravado, card pulado')
      } else {
        cardId = `card_${crypto.randomBytes(12).toString('hex')}`
        const cardDesc = [
          `Cadastro como consultor pelo site.`,
          localContext && `Local: ${localContext}`,
          experiencia?.trim() && `Experiência: ${experiencia.trim()}`,
          `Lead: ${leadId}`,
        ].filter(Boolean).join('\n')

        const { error: cardErr } = await supa.from('cards').insert({
          id: cardId,
          company_id: COMPANY_ID,
          pipe_id: target.pipeId,
          current_phase_id: target.phaseId,
          title: `${nome.trim()} (Consultor)`,
          description: cardDesc,
          status: 'active',
          created_by_id: target.createdById,
          assigned_to_id: null,
          created_at: now,
          updated_at: now,
        })

        if (cardErr) {
          console.error('[consultor] insert card falhou', cardErr)
          cardId = null
          cardWarning = `card_insert_failed:${cardErr.code || 'unknown'}`
        }
      }
    }

    // 3) Notifica internamente pelo WhatsApp (não bloqueia o resto)
    if (EVOLUTION_API_KEY) {
      const message = [
        `💼 NOVO CANDIDATO A CONSULTOR — 21Go`,
        ``,
        `Nome: ${nome.trim()}`,
        `E-mail: ${email.trim()}`,
        `WhatsApp: ${contato.trim()}`,
        localContext && `Local: ${localContext}`,
        ``,
        `Já trabalhou com proteção veicular?`,
        experiencia?.trim() ? experiencia.trim() : '(não informado)',
        ``,
        cardId ? `🟢 Card criado no Kanban.` : `⚠️ Atenção: card NÃO foi criado (${cardWarning ?? 'motivo desconhecido'}).`,
      ].filter(Boolean).join('\n')

      try {
        const r = await fetch(
          `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ number: NOTIFY_NUMBER, text: message }),
          },
        )
        if (!r.ok) {
          const txt = await r.text().catch(() => '')
          console.error('[consultor] Evolution falhou', r.status, txt.slice(0, 200))
        }
      } catch (err: any) {
        console.error('[consultor] Evolution exception', err.message)
      }
    } else {
      console.warn('[consultor] EVOLUTION_API_KEY ausente — notificação WhatsApp pulada')
    }

    return NextResponse.json({
      success: true,
      leadId: leadErr ? null : leadId,
      cardId,
      warning: cardWarning,
    })
  } catch (err: any) {
    console.error('[consultor]', err.message, err.stack)
    return NextResponse.json(
      { success: false, error: 'Erro inesperado.' },
      { status: 500 },
    )
  }
}
