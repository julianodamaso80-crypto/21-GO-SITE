import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { generateQuotePdf } from '@/lib/pdf-quote'
import { isStorageConfigured, uploadPdf } from '@/lib/storage'
import {
  buildExcludedMessage,
  buildFollowUpMessage,
  buildIncompleteDataMessage,
  buildPdfCaption,
  formatPhone,
  getEvolutionInstance,
  isWhatsappConfigured,
  randInt,
  sendPdfMedia,
  sendPresence,
  sendText,
  sleep,
  type SendResult,
} from '@/lib/whatsapp'
import {
  upsertLead,
  upsertConversation,
  upsertMessage,
  phoneToJid,
  normalizePhone,
  type UpsertLeadInput,
} from '@/lib/supabase-store'
import { getRequestContext } from '@/lib/request-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
const POWERCRM_DEFAULT_SLSMN_NW_ID = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
const POWERCRM_DEFAULT_LEAD_SOURCE = process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584'

interface LeadInput {
  nome?: string
  whatsapp?: string
  email?: string | null
  cpf?: string | null
  placa?: string | null
  marca?: string | null
  modelo?: string | null
  ano?: string | number | null
  cor?: string | null
  valorFipe?: number
  fipeCode?: string | null
  categoria?: string | null
  combustivel?: string | null
  cilindrada?: number | null
  plano?: string | null
  valorMensal?: number
  carroApp?: boolean
  motoTerceiros?: boolean
  leilao?: 'nao' | 'leilao' | 'remarcado' | string
  seguroAtual?: string | null
  cidade?: string | null
  estado?: string | null
  // Tracking
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
  event_id?: string | null
  landing_page?: string | null
  referrer?: string | null
  // Atendimento humano: cliente caiu na tela "Falar com consultor" porque
  // PowerCRM + API Brasil + Parallelum nao retornaram FIPE confiavel.
  requires_human_support?: boolean
  human_support_reason?: 'fipe_indisponivel' | 'consulta_falhou' | 'manual'
  // IDs já mapeados do PowerCRM (vem do fluxo novo "buscar por modelo").
  // Quando presentes, evitamos a busca/adivinhação cb/cmby/cmy no createLeadPowerCRM.
  powercrmBrandId?: number | null
  powercrmModelId?: number | null
  powercrmYearId?: number | null
}

export async function POST(req: NextRequest) {
  let body: LeadInput
  try {
    body = (await req.json()) as LeadInput
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const nome = body.nome?.trim()
  const whatsapp = body.whatsapp?.trim().replace(/\D/g, '')
  if (!nome || !whatsapp) {
    return NextResponse.json(
      { success: false, error: 'nome e whatsapp são obrigatórios' },
      { status: 400 },
    )
  }

  const trk = crypto.randomBytes(8).toString('hex')
  const leadId = `lead_${trk}`
  const ctx = getRequestContext(req)

  // Atendimento humano: nao tenta gerar PDF nem mandar mensagem com promessa
  // de cotacao. Salva lead parcial pra Letycia ver no Supabase, manda
  // PowerCRM (pra criar negociacao com responsavel) e termina.
  if (body.requires_human_support) {
    console.log(`[lead] requires_human_support=true reason=${body.human_support_reason} lead=${leadId}`)
    const powercrmHs = POWERAPI_TOKEN
      ? await createLeadPowerCRM(body, leadId).catch((err) => ({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          quotationCode: undefined as string | undefined,
          negotiationCode: undefined as string | undefined,
        }))
      : { ok: false, error: 'POWERAPI_TOKEN ausente', quotationCode: undefined as string | undefined, negotiationCode: undefined as string | undefined }

    await persistLeadInSupabase({
      body,
      trk,
      leadId,
      ctx,
      quotationCode: 'quotationCode' in powercrmHs ? powercrmHs.quotationCode : undefined,
      negotiationCode: 'negotiationCode' in powercrmHs ? powercrmHs.negotiationCode : undefined,
      powercrmPayload: powercrmHs,
    }).catch((err) => {
      console.error('[lead] human_support: falha persistir Supabase:', err instanceof Error ? err.message : err)
    })

    return NextResponse.json({
      success: true,
      leadId,
      trk,
      requires_human_support: true,
      powercrm: powercrmHs,
    })
  }

  // 1) Lead no PowerCRM (mantido — caminho crítico)
  const powercrm = POWERAPI_TOKEN
    ? await createLeadPowerCRM(body, leadId).catch((err) => ({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        quotationCode: undefined as string | undefined,
        negotiationCode: undefined as string | undefined,
      }))
    : { ok: false, error: 'POWERAPI_TOKEN ausente', quotationCode: undefined as string | undefined, negotiationCode: undefined as string | undefined }

  // 2) Persistência no Supabase (lead_attribution unificado em public.leads)
  //    Idempotente, não bloqueia o fluxo principal.
  const supaResult = await persistLeadInSupabase({
    body,
    trk,
    leadId,
    ctx,
    quotationCode: 'quotationCode' in powercrm ? powercrm.quotationCode : undefined,
    negotiationCode: 'negotiationCode' in powercrm ? powercrm.negotiationCode : undefined,
    powercrmPayload: powercrm,
  }).catch((err) => {
    console.error('[lead] Falha persistir no Supabase:', err instanceof Error ? err.message : err)
    return { ok: false, lead_id: leadId }
  })

  // 3) PDF + WhatsApp em background, registrando cada mensagem no Supabase
  ;(async () => {
    try {
      await sendQuotePdfWhatsApp(body, leadId)
    } catch (err) {
      console.error('[lead] Falha PDF/WhatsApp:', err instanceof Error ? err.message : err)
    }
  })()

  return NextResponse.json({
    success: true,
    leadId: supaResult.lead_id || leadId,
    trk,
    powercrm,
  })
}

/* ───────────────── Supabase ───────────────── */

async function persistLeadInSupabase(args: {
  body: LeadInput
  trk: string
  leadId: string
  ctx: ReturnType<typeof getRequestContext>
  quotationCode?: string | null
  negotiationCode?: string | null
  powercrmPayload?: unknown
}): Promise<{ ok: boolean; lead_id: string }> {
  const { body, trk, ctx } = args

  const phone = normalizePhone(body.whatsapp || '') || ''
  const yearStr = body.ano ? String(body.ano) : ''
  const yearNum = (yearStr.match(/(\d{4})/)?.[1])
    ? Number(yearStr.match(/(\d{4})/)![1])
    : null

  const input: UpsertLeadInput = {
    trk,
    event_id: body.event_id ?? null,
    nome: body.nome!,
    telefone: phone,
    email: body.email ?? null,
    cpf: body.cpf ?? null,

    placa: body.placa ?? null,
    marca: body.marca ?? null,
    modelo: body.modelo ?? null,
    ano_modelo: yearNum,
    ano_fabricacao: yearNum,
    fipe_codigo: body.fipeCode ?? null,
    valor_fipe: body.valorFipe ?? null,

    plano: body.plano ?? null,
    valor_mensal: body.valorMensal ?? null,

    cidade: body.cidade ?? null,
    estado: body.estado ?? null,
    carro_app: !!body.carroApp,
    leilao: body.leilao ?? null,
    seguro_atual: body.seguroAtual ?? null,

    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    gclid: body.gclid ?? null,
    gbraid: body.gbraid ?? null,
    wbraid: body.wbraid ?? null,
    fbclid: body.fbclid ?? null,
    fbp: body.fbp ?? null,
    fbc: body.fbc ?? null,
    ga_client_id: body.ga_client_id ?? null,
    external_id: body.external_id ?? null,
    referrer: body.referrer ?? ctx.referer ?? null,
    landing_page: body.landing_page ?? null,
    ip_address: ctx.ip,
    user_agent: ctx.userAgent,

    quotation_code: args.quotationCode ?? null,
    negotiation_code: args.negotiationCode ?? null,
    powercrm_payload: args.powercrmPayload as Record<string, unknown> | null,

    etapa_funil: (body.plano || '').toUpperCase() === 'EXCLUIDO' ? 'excluido' : 'cotacao_enviada',
    status: (body.plano || '').toUpperCase() === 'EXCLUIDO' ? 'excluido' : 'lead',
  }

  const { id } = await upsertLead(input)

  // Cria/atualiza conversation pra ter pronta antes do envio
  const jid = phoneToJid(phone)
  if (jid) {
    try {
      await upsertConversation({
        jid,
        evolution_instance: getEvolutionInstance(),
        contact_phone: phone,
        contact_name: body.nome,
        lead_id: id,
      })
    } catch (err) {
      console.warn('[lead] upsertConversation falhou:', err instanceof Error ? err.message : err)
    }
  }

  return { ok: true, lead_id: id }
}

/* ───────────────── PowerCRM ───────────────── */

async function createLeadPowerCRM(body: LeadInput, leadId: string) {
  const apiHeaders = {
    accept: 'application/json',
    Authorization: `Bearer ${POWERAPI_TOKEN}`,
  } as Record<string, string>

  const placa = body.placa?.toUpperCase().replace(/[^A-Z0-9]/g, '')

  let pcVehicle: Record<string, unknown> | null = null
  if (placa && placa.length === 7) {
    try {
      const r = await fetch(`${POWERCRM_BASE_URL}/api/quotation/plates/${placa}`, {
        headers: apiHeaders,
      })
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
      if (r.ok && j && (j as { mensagem?: string }).mensagem === 'ok') pcVehicle = j
    } catch {
      pcVehicle = null
    }
  }

  let cityId: number | undefined
  if (pcVehicle?.uf && pcVehicle?.city) {
    try {
      const sttRes = await fetch(`${POWERCRM_BASE_URL}/api/quotation/stt`, { headers: apiHeaders })
      const sttList = (await sttRes.json().catch(() => null)) as
        | { id: number; back: string }[]
        | null
      const state = sttList?.find((s) => s.back === pcVehicle!.uf)
      if (state) {
        const ctRes = await fetch(`${POWERCRM_BASE_URL}/api/quotation/ct?st=${state.id}`, {
          headers: apiHeaders,
        })
        const ctList = (await ctRes.json().catch(() => null)) as
          | { id: number; text: string }[]
          | null
        const cityName = (pcVehicle.city as string).toUpperCase()
        const city = ctList?.find((c) => (c.text || '').toUpperCase() === cityName)
        if (city) cityId = city.id
      }
    } catch {
      cityId = undefined
    }
  }

  let mdl: number | undefined
  let mdlYr: number | undefined
  const isMoto = (body.categoria || '').toLowerCase().includes('moto')
  const tipoFinal = isMoto ? 2 : 1

  const brandName = (body.marca || (pcVehicle?.brand as string) || '').toUpperCase()
  const codFipe = (pcVehicle?.codFipe as string) || body.fipeCode || ''
  const yearStr = (pcVehicle?.year as string) || (body.ano ? String(body.ano) : '')
  const yearMatch = yearStr.match(/(\d{4})/)
  const year = yearMatch ? yearMatch[1] : undefined

  // Caminho rápido: IDs PowerCRM já vieram mapeados do front (fluxo novo "buscar por modelo").
  // Pula toda a cascata de adivinhação cb/cmby/cmy.
  if (body.powercrmModelId) {
    mdl = Number(body.powercrmModelId)
    if (body.powercrmYearId) mdlYr = Number(body.powercrmYearId)
  } else if (brandName && codFipe && year) {
    try {
      const cbRes = await fetch(`${POWERCRM_BASE_URL}/api/quotation/cb?type=${tipoFinal}`, {
        headers: apiHeaders,
      })
      const cbList = (await cbRes.json().catch(() => null)) as { id: number; text: string }[] | null
      const tokens = brandName
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !/^I+$/.test(t))
      let cbMatch: { id: number; text: string } | undefined
      for (const tok of tokens) {
        cbMatch = cbList?.find((c) => (c.text || '').toUpperCase() === tok)
        if (cbMatch) break
      }
      if (!cbMatch) {
        for (const tok of tokens) {
          cbMatch = cbList?.find((c) => (c.text || '').toUpperCase().includes(tok))
          if (cbMatch) break
        }
      }
      if (cbMatch) {
        const cmbyRes = await fetch(
          `${POWERCRM_BASE_URL}/api/quotation/cmby?cb=${cbMatch.id}&cy=${year}`,
          { headers: apiHeaders },
        )
        const cmbyList = (await cmbyRes.json().catch(() => null)) as
          | { id: number; text: string; back: string }[]
          | null
        const exact = cmbyList?.find((m) => m.back === codFipe)
        if (exact) {
          mdl = exact.id
          const cmyRes = await fetch(
            `${POWERCRM_BASE_URL}/api/quotation/cmy?cm=${exact.id}`,
            { headers: apiHeaders },
          )
          const cmyList = (await cmyRes.json().catch(() => null)) as
            | { id: number; text: string }[]
            | null
          const matchYear = cmyList?.find((y) => (y.text || '').startsWith(year))
          if (matchYear) mdlYr = matchYear.id
        }
      }
    } catch {
      // segue
    }
  }

  const addPayload: Record<string, unknown> = {
    name: body.nome,
    phone: body.whatsapp?.replace(/\D/g, ''),
    email: body.email || undefined,
    plts: placa || undefined,
    leadSource: Number(POWERCRM_DEFAULT_LEAD_SOURCE),
    slsmnNwId: POWERCRM_DEFAULT_SLSMN_NW_ID,
  }
  if (pcVehicle?.chassi) addPayload.chassi = pcVehicle.chassi
  if (mdl) addPayload.mdl = mdl
  if (mdlYr) addPayload.mdlYr = mdlYr
  if (cityId) addPayload.city = cityId
  if (body.valorFipe) addPayload.protectedValue = body.valorFipe
  if (body.carroApp) addPayload.workVehicle = true

  const addRes = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
    method: 'POST',
    headers: { ...apiHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(addPayload),
  })
  const addJson = (await addRes.json().catch(() => null)) as Record<string, unknown> | null
  const quotationCode = addJson?.quotationCode as string | undefined

  const internalNotes: string[] = []
  if (body.leilao === 'leilao') internalNotes.push('Veículo de leilão')
  if (body.leilao === 'remarcado') internalNotes.push('Veículo remarcado')
  if (body.carroApp) internalNotes.push('Carro de aplicativo (Uber/99)')
  if (body.motoTerceiros) internalNotes.push('Moto com Danos a Terceiros (+R$ 22/mês)')
  if (body.seguroAtual && body.seguroAtual.trim())
    internalNotes.push(`Já possui proteção atual: ${body.seguroAtual.trim()}`)

  const fabricationYear = yearStr.match(/(\d{4})/)?.[1]
    ? Number(yearStr.match(/(\d{4})/)![1])
    : undefined

  const updates: Record<string, unknown>[] = []
  if (mdl) updates.push({ carModel: mdl })
  if (mdlYr) updates.push({ carModelYear: mdlYr })
  if (fabricationYear) updates.push({ fabricationYear })
  if (body.carroApp) updates.push({ workVehicle: true })
  if (internalNotes.length > 0)
    updates.push({ noteContractInternal: internalNotes.join(' | ') })

  if (quotationCode) {
    for (const patch of updates) {
      try {
        await fetch(`${POWERCRM_BASE_URL}/api/quotation/update`, {
          method: 'POST',
          headers: { ...apiHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ code: quotationCode, ...patch }),
        })
      } catch {
        // segue
      }
    }
  }

  return {
    ok: addRes.ok,
    quotationCode,
    negotiationCode: addJson?.negotiationCode as string | undefined,
    leadId,
  }
}

/* ───────────────── PDF + WhatsApp ───────────────── */

async function sendQuotePdfWhatsApp(body: LeadInput, leadId: string) {
  if (!isWhatsappConfigured()) {
    console.warn('[lead] WhatsApp não configurado — pulando envio')
    return
  }

  const isExcluded = (body.plano || '').toUpperCase() === 'EXCLUIDO'
  const phone = formatPhone(body.whatsapp || '')
  const jid = phoneToJid(phone)
  const instance = getEvolutionInstance()

  if (isExcluded) {
    const text = buildExcludedMessage({
      nome: body.nome || '',
      whatsapp: body.whatsapp || '',
      placa: body.placa,
      marca: body.marca,
      modelo: body.modelo,
      ano: body.ano,
      fipe: body.valorFipe,
    })
    const result = await sendText(phone, text)
    await registerOutboundMessage({
      result,
      jid,
      instance,
      leadId,
      message_type: 'text',
      content: text,
    })
    return
  }

  if (!body.marca || !body.modelo || !body.valorFipe || body.valorFipe <= 0 || !body.plano || !body.valorMensal) {
    console.warn('[lead] Dados incompletos pra gerar PDF — enviando mensagem honesta sem promessa de PDF')
    const text = buildIncompleteDataMessage({
      nome: body.nome || '',
      marca: body.marca,
      modelo: body.modelo,
      placa: body.placa,
    })
    const result = await sendText(phone, text)
    await registerOutboundMessage({
      result,
      jid,
      instance,
      leadId,
      message_type: 'text',
      content: text,
    })
    return
  }

  const filename = `simulacao-21go-${leadId}.pdf`

  // Tenta gerar PDF. Se falhar (Chromium quebrado, etc), cai pro fallback texto
  // e marca pdf_falhou=true no Supabase pra retry posterior via /api/admin/resend.
  let pdf: Buffer
  try {
    pdf = await generateQuotePdf({
      nome: body.nome || '',
      whatsapp: body.whatsapp || '',
      email: body.email,
      placa: body.placa,
      marca: body.marca,
      modelo: body.modelo,
      ano: body.ano || '',
      cor: body.cor,
      fipe: body.valorFipe,
      planoNome: body.plano,
      mensalidade: body.valorMensal,
      isMoto: (body.categoria || '').toLowerCase().includes('moto'),
      categoria: body.categoria,
      combustivel: body.combustivel,
      cilindrada: body.cilindrada,
      carroApp: body.carroApp,
      leilao: body.leilao,
      motoTerceiros: body.motoTerceiros,
      seguroAtual: body.seguroAtual,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[lead] PDF falhou — fallback texto. Erro:', msg)
    // Marca o lead pra retry
    await markLeadPdfFailed(leadId, msg).catch(() => {})
    // Manda texto explicando
    const fallbackText = buildFollowUpMessage({
      nome: body.nome || '',
      marca: body.marca,
      modelo: body.modelo,
      placa: body.placa,
    })
    const result = await sendText(phone, fallbackText)
    await registerOutboundMessage({
      result,
      jid,
      instance,
      leadId,
      message_type: 'text',
      content: fallbackText,
    })
    return
  }

  // Estratégia: PDF vai pro Supabase Storage (bucket 'quotes', público).
  // URL Supabase NÃO passa pelo nosso Cloudflare — a Evolution consegue baixar.
  // Descoberta em 2026-05-08: URL via 21go.site (Cloudflare) era bloqueada
  // pra Evolution como bot, retornando "Failed to fetch stream".
  //
  // Fallbacks: MinIO/R2 → endpoint /api/pdfs/[leadId] → base64.
  let media: string
  let pdfUrl: string | null = null

  try {
    const { supabaseAdmin: getSupa } = await import('@/lib/supabase-admin')
    const supa = getSupa()
    const path = `${new Date().toISOString().slice(0, 10)}/${leadId}.pdf`
    const { error: upErr } = await supa.storage
      .from('quotes')
      .upload(path, pdf, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '300',
      })
    if (upErr) throw new Error(upErr.message)
    const { data: pub } = supa.storage.from('quotes').getPublicUrl(path)
    if (!pub?.publicUrl) throw new Error('publicUrl ausente')
    media = pub.publicUrl
    pdfUrl = pub.publicUrl
  } catch (err) {
    console.warn(
      '[lead] Supabase Storage falhou, usando fallback /api/pdfs:',
      err instanceof Error ? err.message : err,
    )
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
      const PUBLIC_BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://21go.site').replace(/\/$/, '')
      media = `${PUBLIC_BASE}/api/pdfs/${leadId}`
      pdfUrl = media
    }
  }

  // ── Anti-ban: mensagem de texto variada PRIMEIRO, com "digitando…" ──
  // Cada lead recebe uma combinação diferente (Spintax por leadId), evitando
  // a impressão digital de spam de mandar sempre o mesmo texto.
  const followText = buildFollowUpMessage({
    nome: body.nome || '',
    marca: body.marca,
    modelo: body.modelo,
    placa: body.placa,
    seed: leadId,
  })
  await sendPresence(phone, 'composing', 3000)
  await sleep(randInt(2500, 4500))
  const textResult = await sendText(phone, followText)
  await registerOutboundMessage({
    result: textResult,
    jid,
    instance,
    leadId,
    message_type: 'text',
    content: followText,
  })

  // ── Delay rotativo de 20-60s antes do PDF (ritmo humano, nada depois) ──
  const pdfDelayMs = randInt(20_000, 60_000)
  console.log(`[lead] aguardando ${Math.round(pdfDelayMs / 1000)}s antes do PDF (anti-ban) lead=${leadId}`)
  await sleep(pdfDelayMs)

  const caption = buildPdfCaption({
    nome: body.nome || '',
    marca: body.marca,
    modelo: body.modelo,
    placa: body.placa,
    seed: leadId,
  })
  await sendPresence(phone, 'composing', 3000)
  await sleep(randInt(2500, 4500))
  const result = await sendPdfMedia(phone, media, caption, filename)
  await registerOutboundMessage({
    result,
    jid,
    instance,
    leadId,
    message_type: 'document',
    content: caption,
    caption,
    media_url: pdfUrl,
    media_filename: filename,
    media_mime_type: 'application/pdf',
  })

  // PDF entregue com sucesso → marca no lead pra observabilidade
  await markLeadPdfSent(leadId).catch(() => {})
}

async function markLeadPdfFailed(leadId: string, errorMsg: string): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  const supa = supabaseAdmin()
  await supa
    .from('leads')
    .update({
      pdf_enviado: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  // Loga em outbound_event_log pra trail
  await supa.from('outbound_event_log').insert({
    lead_id: leadId,
    kind: 'powerapi_get_negotiation', // reaproveita kind existente — depois posso adicionar 'pdf_generation'
    request_payload: { leadId },
    response_payload: { error: errorMsg },
    error: errorMsg,
  })
}

async function markLeadPdfSent(leadId: string): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  const supa = supabaseAdmin()
  await supa
    .from('leads')
    .update({
      pdf_enviado: true,
      pdf_enviado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
}

async function registerOutboundMessage(args: {
  result: SendResult
  jid: string | null
  instance: string
  leadId: string
  message_type: string
  content: string
  caption?: string
  media_url?: string | null
  media_filename?: string
  media_mime_type?: string
}): Promise<void> {
  const { result, jid, instance, leadId } = args
  if (!jid) return
  if (!result.whatsapp_message_id) {
    console.warn('[lead] Evolution não retornou whatsapp_message_id — não registra')
    return
  }
  try {
    const conv = await upsertConversation({
      jid,
      evolution_instance: instance,
      lead_id: leadId,
    })
    await upsertMessage({
      conversation_id: conv.id,
      whatsapp_message_id: result.whatsapp_message_id,
      evolution_instance: instance,
      jid,
      direction: 'outbound',
      status: (result.status as 'PENDING' | 'SENT') || 'PENDING',
      message_type: args.message_type,
      content: args.content,
      caption: args.caption,
      media_url: args.media_url ?? null,
      media_filename: args.media_filename,
      media_mime_type: args.media_mime_type,
      raw_payload: result.raw,
      sent_at: new Date().toISOString(),
      lead_id: leadId,
    })
  } catch (err) {
    console.warn('[lead] registerOutboundMessage falhou:', err instanceof Error ? err.message : err)
  }
}
