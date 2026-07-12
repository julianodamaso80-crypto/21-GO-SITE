import 'server-only'
import { supabaseAdmin } from './supabase-admin'

/**
 * Helpers idempotentes pra orquestrar lead + conversation + message no Supabase.
 * Toda escrita usa UPSERT/ON CONFLICT pra ser segura sob retries e webhooks duplicados.
 *
 * Convenções:
 *  - phone E.164 brasileiro: "5521987654321" (sem +, sem espaços, sem máscara)
 *  - jid: "5521987654321@s.whatsapp.net"
 *  - direction: 'inbound' (cliente -> nós) | 'outbound' (nós -> cliente)
 *  - status: 'PENDING' | 'SENT' | 'SERVER_ACK' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED'
 */

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || 'company-21go'
const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE || 'sitelet1234'

export type Direction = 'inbound' | 'outbound'
export type MessageStatus =
  | 'PENDING'
  | 'SENT'
  | 'SERVER_ACK'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RECEIVED'

/* ─── Normalização ─── */

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  return digits.startsWith('55') ? digits : `55${digits}`
}

export function phoneToJid(phone: string | null | undefined): string | null {
  const p = normalizePhone(phone)
  return p ? `${p}@s.whatsapp.net` : null
}

export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null
  const m = jid.match(/^(\d+)@/)
  return m ? m[1] : null
}

/* ─── LEADS ─── */

export interface UpsertLeadInput {
  trk: string
  event_id?: string | null
  nome: string
  telefone: string
  email?: string | null
  cpf?: string | null

  // Veículo
  placa?: string | null
  marca?: string | null
  modelo?: string | null
  ano_modelo?: number | null
  ano_fabricacao?: number | null
  fipe_codigo?: string | null
  valor_fipe?: number | null

  // Plano
  plano?: string | null
  valor_mensal?: number | null

  // Contexto
  cidade?: string | null
  estado?: string | null
  carro_app?: boolean
  leilao?: string | null
  seguro_atual?: string | null

  // Tracking
  origem?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  fbp?: string | null
  fbc?: string | null
  ga_client_id?: string | null
  external_id?: string | null
  referrer?: string | null
  landing_page?: string | null
  ip_address?: string | null
  user_agent?: string | null

  // PowerCRM
  quotation_code?: string | null
  negotiation_code?: string | null
  powercrm_payload?: unknown

  // Funil
  etapa_funil?: string | null
  status?: string | null
}

/**
 * Cria ou atualiza um lead pelo `trk` (idempotente).
 * Retorna o id do lead (mesmo formato gerado pelo trigger).
 */
export async function upsertLead(input: UpsertLeadInput): Promise<{ id: string; created: boolean }> {
  const supa = supabaseAdmin()
  const phone = normalizePhone(input.telefone) ?? input.telefone

  const id = `lead_${input.trk}`
  const row = {
    id,
    company_id: DEFAULT_COMPANY_ID,
    trk: input.trk,
    event_id: input.event_id ?? null,
    nome: input.nome,
    telefone: phone,
    whatsapp: phone,
    email: input.email ?? null,
    cpf: input.cpf ?? null,
    placa_interesse: input.placa?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
    marca_interesse: input.marca ?? null,
    modelo_interesse: input.modelo ?? null,
    ano_interesse: input.ano_modelo ?? null,
    ano_fabricacao: input.ano_fabricacao ?? null,
    fipe_codigo: input.fipe_codigo ?? null,
    valor_fipe_consultado: input.valor_fipe ?? null,
    cotacao_plano: input.plano ?? null,
    cotacao_valor: input.valor_mensal ?? null,
    cotacao_enviada: !!input.plano,
    cotacao_data: input.plano ? new Date().toISOString() : null,
    cidade: input.cidade ?? null,
    estado: input.estado ?? null,
    carro_app: !!input.carro_app,
    leilao: input.leilao ?? null,
    seguro_atual: input.seguro_atual ?? null,
    qualificado_por: 'site',
    score_qualificacao: 0,
    etapa_funil: input.etapa_funil ?? 'novo',
    status: input.status ?? 'lead',
    origem: input.origem ?? deriveOrigem(input.utm_source, input.utm_medium),
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
    utm_content: input.utm_content ?? null,
    utm_term: input.utm_term ?? null,
    gclid: input.gclid ?? null,
    gbraid: input.gbraid ?? null,
    wbraid: input.wbraid ?? null,
    fbclid: input.fbclid ?? null,
    fbp: input.fbp ?? null,
    fbc: input.fbc ?? null,
    ga_client_id: input.ga_client_id ?? null,
    external_id: input.external_id ?? null,
    referrer: input.referrer ?? null,
    landing_page: input.landing_page ?? null,
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent ?? null,
    quotation_code: input.quotation_code ?? null,
    negotiation_code: input.negotiation_code ?? null,
    powercrm_payload: input.powercrm_payload ?? null,
    evolution_instance: DEFAULT_INSTANCE,
    conversion_value_cents:
      typeof input.valor_mensal === 'number' ? Math.round(input.valor_mensal * 100) : null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supa
    .from('leads')
    .upsert(row, { onConflict: 'trk', ignoreDuplicates: false })
    .select('id, created_at, updated_at')
    .single()

  if (error) throw new Error(`upsertLead falhou: ${error.message}`)

  const created =
    !!data?.created_at && !!data?.updated_at && data.created_at === data.updated_at
  return { id: (data?.id as string) ?? id, created }
}

/**
 * Atualiza status do PowerCRM (etapa do funil).
 * Insere também em lead_status_history pra ter trail.
 */
export async function updateLeadStatus(args: {
  lead_id?: string | null
  quotation_code?: string | null
  to_status: string
  source: string
  raw_payload?: unknown
  liberado_cadastro?: boolean
  conversion_value_cents?: number | null
}): Promise<{ ok: boolean; lead_id: string | null; from_status: string | null }> {
  const supa = supabaseAdmin()

  // Resolver lead_id
  let leadId = args.lead_id ?? null
  let currentStatus: string | null = null
  if (!leadId && args.quotation_code) {
    const { data } = await supa
      .from('leads')
      .select('id, etapa_funil')
      .eq('quotation_code', args.quotation_code)
      .single()
    if (data) {
      leadId = data.id as string
      currentStatus = (data.etapa_funil as string) ?? null
    }
  } else if (leadId) {
    const { data } = await supa
      .from('leads')
      .select('etapa_funil')
      .eq('id', leadId)
      .single()
    currentStatus = (data?.etapa_funil as string) ?? null
  }

  if (!leadId) return { ok: false, lead_id: null, from_status: null }

  const patch: Record<string, unknown> = {
    etapa_funil: args.to_status,
    updated_at: new Date().toISOString(),
  }
  if (args.liberado_cadastro) {
    patch.liberado_cadastro = true
    patch.liberado_cadastro_em = new Date().toISOString()
  }
  if (typeof args.conversion_value_cents === 'number') {
    patch.conversion_value_cents = args.conversion_value_cents
  }
  if (args.to_status === 'COMPLETED' || args.to_status === 'ganho') {
    patch.data_conversao = new Date().toISOString()
    patch.status = 'convertido'
  }
  if (args.to_status === 'LOST' || args.to_status === 'perdido') {
    patch.status = 'perdido'
  }

  const { error: updErr } = await supa.from('leads').update(patch).eq('id', leadId)
  if (updErr) console.warn('[updateLeadStatus] update lead falhou:', updErr.message)

  const { error: histErr } = await supa.from('lead_status_history').insert({
    lead_id: leadId,
    from_status: currentStatus,
    to_status: args.to_status,
    source: args.source,
    raw_payload: args.raw_payload ?? null,
  })
  if (histErr) console.warn('[updateLeadStatus] history insert falhou:', histErr.message)

  return { ok: true, lead_id: leadId, from_status: currentStatus }
}

/* ─── CONVERSATIONS ─── */

export interface UpsertConversationInput {
  jid: string
  evolution_instance?: string
  channel?: string
  contact_phone?: string | null
  contact_name?: string | null
  pushname?: string | null
  profile_pic_url?: string | null
  lead_id?: string | null
}

/**
 * Cria conversa (1 por jid+instance) ou retorna a existente.
 * Idempotente — chamadas repetidas atualizam metadados sem duplicar.
 */
export async function upsertConversation(
  input: UpsertConversationInput,
): Promise<{ id: string }> {
  const supa = supabaseAdmin()
  const instance = input.evolution_instance || DEFAULT_INSTANCE
  const phone = input.contact_phone ?? jidToPhone(input.jid)

  // updated_at é NOT NULL sem default no schema atual — sempre enviamos
  // created_at tem CURRENT_TIMESTAMP default — deixamos o banco preencher
  const row = {
    company_id: DEFAULT_COMPANY_ID,
    channel: input.channel ?? 'whatsapp',
    jid: input.jid,
    evolution_instance: instance,
    contact_phone: phone,
    contact_name: input.contact_name ?? null,
    pushname: input.pushname ?? null,
    profile_pic_url: input.profile_pic_url ?? null,
    lead_id: input.lead_id ?? null,
    status: 'open',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supa
    .from('conversations')
    .upsert(row, { onConflict: 'jid,evolution_instance', ignoreDuplicates: false })
    .select('id')
    .single()

  if (error) throw new Error(`upsertConversation falhou: ${error.message}`)
  return { id: data!.id as string }
}

/**
 * Liga uma conversa a um lead (caso o lead chegue depois da conversa,
 * ex: cliente já mandava msg antes de preencher o form).
 */
export async function linkConversationToLead(
  jid: string,
  evolution_instance: string,
  lead_id: string,
): Promise<void> {
  const supa = supabaseAdmin()
  const { error } = await supa
    .from('conversations')
    .update({ lead_id, updated_at: new Date().toISOString() })
    .eq('jid', jid)
    .eq('evolution_instance', evolution_instance)
    .is('lead_id', null)
  if (error) console.warn('[linkConversationToLead] falhou:', error.message)
}

/* ─── MESSAGES ─── */

export interface InsertMessageInput {
  conversation_id?: string | null
  whatsapp_message_id: string
  evolution_instance?: string
  jid: string
  direction: Direction
  status?: MessageStatus
  sender?: string | null
  message_type?: string
  content?: string | null
  caption?: string | null
  media_url?: string | null
  media_filename?: string | null
  media_mime_type?: string | null
  pushname?: string | null
  raw_payload?: unknown
  sent_at?: string | null
  delivered_at?: string | null
  read_at?: string | null
  lead_id?: string | null
}

/**
 * Insere mensagem (idempotente: dedup por whatsapp_message_id+instance).
 * Se já existir, atualiza apenas campos de status (PENDING -> SENT -> DELIVERED -> READ).
 */
export async function upsertMessage(input: InsertMessageInput): Promise<{ id: string }> {
  const supa = supabaseAdmin()
  const instance = input.evolution_instance || DEFAULT_INSTANCE

  // Fallback de content por message_type (NOT NULL no schema)
  const messageType = input.message_type ?? 'text'
  const fallbackContent = (() => {
    if (input.content) return input.content
    if (input.caption) return input.caption
    if (messageType === 'image') return '[imagem]'
    if (messageType === 'audio') return '[áudio]'
    if (messageType === 'video') return '[vídeo]'
    if (messageType === 'document') return input.media_filename || '[documento]'
    if (messageType === 'sticker') return '[figurinha]'
    if (messageType === 'location') return '[localização]'
    return ''
  })()

  const row = {
    company_id: DEFAULT_COMPANY_ID,
    conversation_id: input.conversation_id ?? null,
    whatsapp_message_id: input.whatsapp_message_id,
    evolution_instance: instance,
    jid: input.jid,
    direction: input.direction,
    status: input.status ?? 'PENDING',
    sender: input.sender ?? (input.direction === 'outbound' ? 'agent' : 'contact'),
    message_type: messageType,
    content: fallbackContent,
    caption: input.caption ?? null,
    media_url: input.media_url ?? null,
    media_filename: input.media_filename ?? null,
    media_mime_type: input.media_mime_type ?? null,
    pushname: input.pushname ?? null,
    raw_payload: input.raw_payload ?? null,
    sent_at: input.sent_at ?? null,
    delivered_at: input.delivered_at ?? null,
    read_at: input.read_at ?? null,
    lead_id: input.lead_id ?? null,
  }

  const { data, error } = await supa
    .from('messages')
    .upsert(row, {
      onConflict: 'whatsapp_message_id,evolution_instance',
      ignoreDuplicates: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`upsertMessage falhou: ${error.message}`)
  return { id: data!.id as string }
}

/**
 * Atualiza apenas o status (e timestamps) de uma mensagem existente.
 * Usado pelo webhook de updates da Evolution.
 */
export async function updateMessageStatus(args: {
  whatsapp_message_id: string
  evolution_instance?: string
  status: MessageStatus
  delivered_at?: string | null
  read_at?: string | null
  raw_payload?: unknown
}): Promise<void> {
  const supa = supabaseAdmin()
  const instance = args.evolution_instance || DEFAULT_INSTANCE

  const patch: Record<string, unknown> = { status: args.status }
  if (args.delivered_at) patch.delivered_at = args.delivered_at
  if (args.read_at) patch.read_at = args.read_at
  if (args.raw_payload) patch.raw_payload = args.raw_payload

  const { error } = await supa
    .from('messages')
    .update(patch)
    .eq('whatsapp_message_id', args.whatsapp_message_id)
    .eq('evolution_instance', instance)

  if (error) console.warn('[updateMessageStatus] falhou:', error.message)
}

/* ─── CONVERSION EVENTS LOG ─── */

export async function logConversionEvent(args: {
  lead_id: string
  destino: 'google_ads' | 'meta_capi' | 'ga4_mp'
  event_name: string
  event_id?: string | null
  payload?: unknown
  response_status?: number
  response_body?: unknown
  success: boolean
  error_message?: string | null
}): Promise<void> {
  const supa = supabaseAdmin()
  const { error } = await supa.from('conversion_events_log').insert({
    lead_id: args.lead_id,
    destino: args.destino,
    event_name: args.event_name,
    event_id: args.event_id ?? null,
    payload: args.payload ?? null,
    response_status: args.response_status ?? null,
    response_body: args.response_body ?? null,
    success: args.success,
    error_message: args.error_message ?? null,
  })
  if (error) console.warn('[logConversionEvent] falhou:', error.message)
}

/* ─── helpers ─── */

function deriveOrigem(utmSource?: string | null, utmMedium?: string | null): string {
  const s = (utmSource || '').toLowerCase()
  const m = (utmMedium || '').toLowerCase()
  if (!s) return 'site_organico'
  if (s === 'google' && (m === 'cpc' || m === 'paid' || m === 'ads')) return 'google_ads'
  if (s === 'facebook' || s === 'meta') return 'meta_ads'
  if (s === 'instagram') return 'instagram'
  if (s === 'whatsapp') return 'whatsapp'
  return 'outro'
}
