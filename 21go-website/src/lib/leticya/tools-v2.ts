import 'server-only'
import { z } from 'zod'
import { tool } from 'ai'
import { leticyaDb } from './db'

/**
 * Tools v2 da Leticya — destiladas dos padrões reais observados em 263 conversas.
 *
 * REGRA SAGRADA: NENHUMA tool aqui dispara mensagem pro cliente real.
 * Todas registram INTENÇÃO no banco (followups, quotes, candidates, facts).
 * O envio efetivo é feito por humano no console interno ou por job dedicado
 * com aprovação humana.
 *
 * Tabelas usadas:
 *   · chat.contact_facts      (existente — Mem0-style)
 *   · ai.followups            (220 migration — fila de follow-up)
 *   · ai.consultant_candidates (220 — funil APN)
 *   · ai.lead_quotes          (220 — auditoria de cotações)
 *   · ai.rejected_vehicles    (220 — catálogo de bloqueio)
 *   · core.leads              (220 — colunas cold_reason/cold_at)
 */

const COMPANY_ID = 'company-21go'

// ─────────────────────────────────────────────────────────────────────────────
// 1. saveFact — salva fato sobre o contato (Mem0)
// ─────────────────────────────────────────────────────────────────────────────
export const saveFactTool = tool({
  description:
    'Salva um fato extraído da conversa atual (preferência, objeção, info pessoal, veículo mencionado, competidor). Use pra o próximo turno do agente lembrar.',
  inputSchema: z.object({
    contact_id: z.string().describe('UUID do contato'),
    fact: z.string().describe('Frase curta no formato "Cliente disse X" ou "Cliente quer Y"'),
    category: z
      .enum([
        'VEHICLE_INTEREST',
        'OBJECTION',
        'PERSONAL',
        'FINANCIAL',
        'COMPETITOR',
        'PREFERENCE',
        'CONTACT_INFO',
        'OTHER',
      ])
      .describe('Categoria do fato'),
    confidence: z.number().min(0).max(1).default(0.9),
    source_run_id: z.string().nullable().optional(),
  }),
  execute: async (i) => {
    const db = leticyaDb()
    const { data, error } = await db
      .schema('chat')
      .from('contact_facts')
      .insert({
        contact_id: i.contact_id,
        company_id: COMPANY_ID,
        fact: i.fact,
        category: i.category,
        confidence: i.confidence,
        source_type: 'AGENT_IA',
        source_run_id: i.source_run_id ?? null,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, fact_id: data.id, saved: i.fact }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. checkRejected — checa se modelo está na lista de bloqueio
// ─────────────────────────────────────────────────────────────────────────────
export const checkRejectedTool = tool({
  description:
    'Verifica se o veículo informado pelo cliente está na lista de modelos REJEITADOS pela 21Go (Freemont, Veloster, Linea, Iveco, etc.). Chame SEMPRE antes de prosseguir com a cotação. Retorna { rejected: bool, reason }.',
  inputSchema: z.object({
    descricao_veiculo: z
      .string()
      .describe('Texto livre do que o cliente disse sobre o veículo (marca + modelo + observações). Ex: "Iveco Daily 2014" ou "passou em leilão"'),
  }),
  execute: async ({ descricao_veiculo }) => {
    const db = leticyaDb()
    const { data, error } = await db
      .schema('ai')
      .from('rejected_vehicles')
      .select('pattern, display_name, category, reason')
      .eq('is_active', true)
    if (error) return { ok: false, error: error.message, rejected: false }
    const lower = descricao_veiculo.toLowerCase()
    for (const row of data ?? []) {
      try {
        const re = new RegExp(row.pattern, 'i')
        if (re.test(lower)) {
          return {
            ok: true,
            rejected: true,
            matched: row.display_name,
            category: row.category,
            reason: row.reason,
            suggested_response:
              'infelizmente esse veiculo nós nao fazemos 😢',
          }
        }
      } catch {
        // regex inválido no banco — ignora
      }
    }
    return { ok: true, rejected: false }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. simulateDiscount — calcula desconto contextual + REGISTRA cotação
// ─────────────────────────────────────────────────────────────────────────────
const PROFILES = {
  sem_boleto_sem_urgencia: { activation: 300, label: 'sem boleto, sem urgência' },
  sem_boleto_fecha_hoje: { activation: 250, label: 'sem boleto, fechando hoje' },
  com_boleto: { activation: 200, label: 'com boleto antigo da concorrência' },
  com_boleto_fecha_hoje: { activation: 150, label: 'com boleto + fecha hoje' },
  fipe_alta: { activation: 250, label: 'lead premium (FIPE > R$ 80k)' },
  so_rastreador: { activation: 190, label: 'só rastreador (isenta ativação)' },
} as const

export const simulateDiscountTool = tool({
  description:
    'Calcula desconto contextual para a ativação com base no perfil do lead. Registra a cotação em ai.lead_quotes pra auditoria. NÃO envia mensagem — só retorna valor sugerido pro agente usar na conversa.',
  inputSchema: z.object({
    contact_id: z.string().describe('UUID do contato'),
    conversation_id: z.string().nullable().optional(),
    plan_id: z
      .enum(['basico', 'do-seu-jeito', 'vip', 'premium', 'suv', 'moto-400', 'moto-1000', 'especial']),
    fipe_value: z.number().positive(),
    monthly_brl: z.number().positive().describe('Valor mensal calculado por getPlanPrice'),
    profile: z.enum([
      'sem_boleto_sem_urgencia',
      'sem_boleto_fecha_hoje',
      'com_boleto',
      'com_boleto_fecha_hoje',
      'fipe_alta',
      'so_rastreador',
    ]),
    valid_hours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24)
      .describe('Por quantas horas a oferta fica válida'),
    source_run_id: z.string().nullable().optional(),
  }),
  execute: async (i) => {
    const p = PROFILES[i.profile]
    const validUntil = new Date(Date.now() + i.valid_hours * 3600_000).toISOString()
    const db = leticyaDb()
    const { data, error } = await db
      .schema('ai')
      .from('lead_quotes')
      .insert({
        contact_id: i.contact_id,
        conversation_id: i.conversation_id ?? null,
        company_id: COMPANY_ID,
        plan_id: i.plan_id,
        fipe_value_brl: i.fipe_value,
        monthly_brl: i.monthly_brl,
        activation_full_brl: 419.91,
        activation_offer_brl: p.activation,
        tracker_included: i.profile !== 'so_rastreador',
        profile_used: i.profile,
        valid_until: validUntil,
        status: 'OFFERED',
        triggered_by_run_id: i.source_run_id ?? null,
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      quote_id: data.id,
      activation_offer_brl: p.activation,
      monthly_brl: i.monthly_brl,
      profile_label: p.label,
      valid_until: validUntil,
      suggested_phrasing: `consegui aq no sistema R$ ${p.activation},00 ${i.profile === 'so_rastreador' ? 'só com o rastreador, ativação isenta' : 'incluindo rastreador'}. mensal fica R$ ${i.monthly_brl.toFixed(2).replace('.', ',')}. e se eu conseguir fechamos hoje?`,
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. compareCompetitor — comparativo vs proposta da concorrência
// ─────────────────────────────────────────────────────────────────────────────
const COMPETITORS_INFO: Record<string, { type: 'seguradora' | 'protecao'; obs: string }> = {
  suhai: { type: 'seguradora', obs: 'analisa perfil, pode recusar, franquia alta' },
  apvs: { type: 'protecao', obs: 'cooperativa, cobertura limitada em alguns estados' },
  alamo: { type: 'protecao', obs: 'cobertura regional, preço agressivo' },
  alianca: { type: 'protecao', obs: 'similar à 21Go, varia rede credenciada' },
  genessis: { type: 'seguradora', obs: 'tradicional, preço mais alto' },
  hdi: { type: 'seguradora', obs: 'tradicional, foco em carros premium' },
  loovi: { type: 'seguradora', obs: 'digital, perfil restrito' },
  bem_brasil: { type: 'protecao', obs: 'similar à 21Go' },
  zen: { type: 'seguradora', obs: 'tradicional' },
  sempre_supra: { type: 'protecao', obs: 'cobertura regional' },
}

export const compareCompetitorTool = tool({
  description:
    'Recebe info da proposta da concorrência (nome + valor mensal/ativação se houver) e retorna comparativo + frase sugerida. Também salva fact COMPETITOR.',
  inputSchema: z.object({
    contact_id: z.string(),
    competitor_name: z
      .string()
      .describe('Nome cru como o cliente disse: "Suhai", "Alamo", "APVS", etc.'),
    competitor_monthly_brl: z.number().nullable().optional(),
    competitor_activation_brl: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  execute: async (i) => {
    const key = i.competitor_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15)
    const found = Object.entries(COMPETITORS_INFO).find(
      ([k]) => key.includes(k) || k.includes(key),
    )
    const compInfo = found ? found[1] : { type: 'desconhecido' as const, obs: 'não catalogada' }
    // Salva COMPETITOR fact
    const factBody = `Cliente cita concorrente "${i.competitor_name}"${
      i.competitor_monthly_brl ? ` (mensal R$ ${i.competitor_monthly_brl})` : ''
    }${i.competitor_activation_brl ? ` (ativação R$ ${i.competitor_activation_brl})` : ''}${
      i.notes ? `. ${i.notes}` : ''
    }`
    const db = leticyaDb()
    await db.schema('chat').from('contact_facts').insert({
      contact_id: i.contact_id,
      company_id: COMPANY_ID,
      fact: factBody,
      category: 'COMPETITOR',
      confidence: 0.95,
      source_type: 'AGENT_IA',
      is_active: true,
    })

    const isSeguradora = compInfo.type === 'seguradora'
    const suggestedAngle = isSeguradora
      ? 'destaque mutualismo (sem análise de perfil, sem recusa) e cobertura 100% FIPE'
      : 'destaque cobertura nacional + 20+ anos de mercado + assistência 24h própria'

    return {
      ok: true,
      competitor_recognized: !!found,
      competitor_type: compInfo.type,
      competitor_obs: compInfo.obs,
      suggested_angle: suggestedAngle,
      suggested_phrasing: isSeguradora
        ? `me manda a proposta deles? aqui a gente é proteção via mutualismo, sem análise de perfil. cobre 100% da FIPE não sendo de leilão. me diz o valor deles que eu vejo se consigo algo melhor pra senhor`
        : `me manda a proposta deles? aqui a gente tem mais de 20 anos de mercado, cobertura nacional. me diz o valor que eu vejo se consigo algo melhor`,
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. addToTrainingGroup — funil de consultor APN
// ─────────────────────────────────────────────────────────────────────────────
export const addToTrainingGroupTool = tool({
  description:
    'Registra interesse no programa de consultor 21Go (APN). Use quando cliente disser "quero ser consultor" / "participar do treinamento" / "vi o APN". NÃO dispara convite — só registra pra humano contatar.',
  inputSchema: z.object({
    contact_id: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    phone: z.string().describe('Telefone do candidato'),
    email: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    previous_experience: z.string().nullable().optional(),
    source: z.enum(['site_form', 'whatsapp_inbound', 'indicacao']).default('whatsapp_inbound'),
  }),
  execute: async (i) => {
    const db = leticyaDb()
    const { data, error } = await db
      .schema('ai')
      .from('consultant_candidates')
      .insert({
        contact_id: i.contact_id ?? null,
        company_id: COMPANY_ID,
        full_name: i.full_name ?? null,
        email: i.email ?? null,
        phone: i.phone,
        city: i.city ?? null,
        state: i.state ?? null,
        previous_experience: i.previous_experience ?? null,
        source: i.source,
        status: 'NEW',
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      candidate_id: data.id,
      next_action: 'humano da equipe vai contatar e mandar link do grupo Meet',
      suggested_phrasing:
        'que bacana! aqui na 21Go a gente tem o programa de consultor\n\ntem treinamento online às 19h30 pelo Meet e presencial em Campo Grande\n\nvou registrar seu interesse e a equipe te chama com os próximos passos, ok? 💼',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. scheduleFollowUp — agenda follow-up automático
// ─────────────────────────────────────────────────────────────────────────────
const STEP_OFFSETS_MS = {
  '+1h': 60 * 60 * 1000,
  '+24h': 24 * 60 * 60 * 1000,
  '+72h': 72 * 60 * 60 * 1000,
  '+7d': 7 * 24 * 60 * 60 * 1000,
}

export const scheduleFollowUpTool = tool({
  description:
    'Agenda um follow-up futuro pro lead (cotação enviada / vai pensar / sem resposta). Cria registro em ai.followups com mensagem rascunho. NÃO dispara nada — humano aprova e envia.',
  inputSchema: z.object({
    contact_id: z.string(),
    conversation_id: z.string().nullable().optional(),
    step: z.enum(['+1h', '+24h', '+72h', '+7d', 'custom']),
    custom_offset_minutes: z.number().int().min(15).max(20160).nullable().optional(),
    reason: z
      .enum(['cotacao_enviada', 'vai_pensar', 'sem_resposta', 'falar_conjuge', 'aguarda_doc', 'custom'])
      .default('sem_resposta'),
    draft_message: z.string().describe('Mensagem rascunho da Leticya pra mandar quando der o horário'),
  }),
  execute: async (i) => {
    let offsetMs: number
    if (i.step === 'custom') {
      if (!i.custom_offset_minutes) {
        return { ok: false, error: 'custom_offset_minutes obrigatório quando step=custom' }
      }
      offsetMs = i.custom_offset_minutes * 60_000
    } else {
      offsetMs = STEP_OFFSETS_MS[i.step]
    }
    const scheduledFor = new Date(Date.now() + offsetMs).toISOString()
    const db = leticyaDb()
    const { data, error } = await db
      .schema('ai')
      .from('followups')
      .insert({
        contact_id: i.contact_id,
        conversation_id: i.conversation_id ?? null,
        company_id: COMPANY_ID,
        scheduled_for: scheduledFor,
        step: i.step,
        reason: i.reason,
        draft_message: i.draft_message,
        status: 'SCHEDULED',
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      followup_id: data.id,
      scheduled_for: scheduledFor,
      status: 'SCHEDULED — humano aprova antes de enviar',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. sendAppvisto — gera link de vistoria (MOCK — não chama PowerCRM real)
// ─────────────────────────────────────────────────────────────────────────────
export const sendAppvistoTool = tool({
  description:
    'Gera intenção de envio do link da vistoria pelo app Visto. NÃO chama PowerCRM real — só registra a intenção. Humano vai aprovar e disparar manualmente. Use quando cliente fechou e está pronto pra vistoria.',
  inputSchema: z.object({
    contact_id: z.string(),
    conversation_id: z.string().nullable().optional(),
    placa: z.string().describe('Placa do veículo a ser vistoriado'),
  }),
  execute: async (i) => {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const fakeUuid = crypto.randomUUID()
    const link = `https://appvisto.link/${fakeUuid}`
    // Salva como fact pra ficar registrado na timeline
    const db = leticyaDb()
    await db.schema('chat').from('contact_facts').insert({
      contact_id: i.contact_id,
      company_id: COMPANY_ID,
      fact: `Vistoria solicitada — placa ${i.placa.toUpperCase()} — código ${code}`,
      category: 'OTHER',
      confidence: 1.0,
      source_type: 'AGENT_IA',
      is_active: true,
    })
    return {
      ok: true,
      placa: i.placa.toUpperCase(),
      code,
      link,
      suggested_message: `APPVISTO: Realize a vistoria do veículo PLACA: ${i.placa.toUpperCase()} pelo app Visto, usando o CODIGO: ${code} ou use o link: ${link}\n\nsó deixar as fotos bem nitidas\n\nqualquer dúvida pode mandar mensagem`,
      note: 'MOCK — não foi chamado o PowerCRM real. Humano deve confirmar antes de enviar.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. markLeadCold — marca lead como frio (após 7d sem resposta)
// ─────────────────────────────────────────────────────────────────────────────
export const markLeadColdTool = tool({
  description:
    'Marca lead como FRIO após N tentativas de follow-up sem resposta. UPDATE em core.leads + cancela follow-ups pendentes.',
  inputSchema: z.object({
    contact_id: z.string(),
    reason: z.string().describe('Motivo curto: "sem resposta após 7d", "desistiu", etc.'),
  }),
  execute: async ({ contact_id, reason }) => {
    const db = leticyaDb()
    const now = new Date().toISOString()
    // 1. UPDATE no lead mais recente
    const { error: leadErr } = await db
      .schema('core')
      .from('leads')
      .update({ cold_reason: reason, cold_at: now })
      .eq('contact_id', contact_id)
    // 2. Cancela follow-ups SCHEDULED
    const { error: fuErr } = await db
      .schema('ai')
      .from('followups')
      .update({ status: 'CANCELLED', skipped_reason: `lead frio: ${reason}` })
      .eq('contact_id', contact_id)
      .eq('status', 'SCHEDULED')
    if (leadErr || fuErr) {
      return { ok: false, error: leadErr?.message ?? fuErr?.message }
    }
    return { ok: true, status: 'lead marcado como frio, follow-ups cancelados' }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. markLeadExcluido — veículo rejeitado pela política
// ─────────────────────────────────────────────────────────────────────────────
export const markLeadExcluidoTool = tool({
  description:
    'Marca lead como EXCLUIDO porque o veículo está na lista de rejeitados. UPDATE em core.leads (etapa_funil=excluido, status=EXCLUIDO).',
  inputSchema: z.object({
    contact_id: z.string(),
    reason: z.string().describe('Motivo: "Fiat Freemont", "leilão pesado", etc.'),
  }),
  execute: async ({ contact_id, reason }) => {
    const db = leticyaDb()
    const { error } = await db
      .schema('core')
      .from('leads')
      .update({
        etapa_funil: 'excluido',
        status: 'EXCLUIDO',
        cold_reason: `veículo rejeitado: ${reason}`,
        cold_at: new Date().toISOString(),
      })
      .eq('contact_id', contact_id)
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      status: 'lead marcado como EXCLUIDO',
      suggested_phrasing: 'infelizmente esse veiculo nós nao fazemos 😢',
    }
  },
})

// ─── Bundle v2 ───
export const leticyaToolsV2 = {
  saveFact: saveFactTool,
  checkRejected: checkRejectedTool,
  simulateDiscount: simulateDiscountTool,
  compareCompetitor: compareCompetitorTool,
  addToTrainingGroup: addToTrainingGroupTool,
  scheduleFollowUp: scheduleFollowUpTool,
  sendAppvisto: sendAppvistoTool,
  markLeadCold: markLeadColdTool,
  markLeadExcluido: markLeadExcluidoTool,
}
