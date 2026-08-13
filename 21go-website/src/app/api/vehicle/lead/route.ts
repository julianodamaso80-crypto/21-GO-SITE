import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  buildExcludedMessage,
  buildFollowUpMessage,
  buildIncompleteDataMessage,
  buildPdfCaption,
  buildQuoteSummaryMessage,
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
import { generateQuotePdf } from '@/lib/pdf-quote'
import { isStorageConfigured, uploadPdf } from '@/lib/storage'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  upsertLead,
  upsertConversation,
  upsertMessage,
  phoneToJid,
  normalizePhone,
  type UpsertLeadInput,
} from '@/lib/supabase-store'
import { getRequestContext } from '@/lib/request-context'
import { estaNoAr, resolverConsultor } from '@/lib/consultor'
import { acharIndicador, marcarUso } from '@/lib/indicacao'
import { avisar, textoLeadIndicado } from '@/lib/whatsapp-avisos'

/** Pra onde vai o aviso de lead indicado quando nao ha consultor dono do site. */
const DONO_WHATSAPP = '5521992208062'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
/**
 * O dono do lead quando ninguem mais reivindica: o site da propria 21Go.
 *
 * Num site de consultor (`21go.com.br/julianodamaso`) quem manda e o PowerLink
 * DELE — e o que faz a cotacao ja nascer no nome dele la no Power, em vez de
 * nascer orfa e ser transferida depois. Ver `powerlinkDoLead` abaixo.
 */
const POWERCRM_DEFAULT_SLSMN_NW_ID = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'

/**
 * De quem e esta venda.
 *
 * Cai no default em silencio quando o slug nao existe, esta cancelado ou o banco
 * nao responde. E a escolha certa: um lead que chega e melhor que um lead que se
 * perde, e o pior caso aqui e a venda nascer na casa em vez de nascer no
 * consultor — recuperavel. O contrario (derrubar o formulario porque o lookup
 * falhou) perde o cliente pra sempre.
 */
async function powerlinkDoLead(slug: string | null | undefined): Promise<string> {
  if (!slug) return POWERCRM_DEFAULT_SLSMN_NW_ID

  const consultor = await resolverConsultor(slug)
  if (!consultor || !estaNoAr(consultor)) {
    console.warn(`[lead] slug "${slug}" sem site ativo — lead vai pro powerlink da casa`)
    return POWERCRM_DEFAULT_SLSMN_NW_ID
  }

  console.log(`[lead] powerlink de ${consultor.nome} (${slug})`)
  return consultor.powerlinkId
}
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
  /** Slug do site de consultor por onde o lead entrou (21go.com.br/<slug>). */
  consultorSlug?: string | null
  /**
   * Codigo de quem indicou (Member Get Member).
   *
   * Independente do `consultorSlug` de proposito: o slug decide em qual Power o
   * lead nasce, este decide quem ganha o desconto de 10%. A Maria indicar pelo
   * site do consultor dela nao tira o lead dele.
   */
  indicadoPor?: string | null
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
  // de cotacao. Salva lead parcial pro atendimento ver no Supabase, manda
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

  // Veículo que a 21Go não faz: registro silencioso e ponto final.
  // Ordem do dono (31/07/2026) — não pode virar lead pra ninguém atender, então
  // NÃO vai pro PowerCRM e NÃO dispara WhatsApp. Fica só no nosso banco, com
  // status `excluido`, pra podermos avisar essas pessoas se a 21Go voltar a
  // aceitar o veículo. Defesa em profundidade: mesmo que outra tela chame este
  // endpoint com plano EXCLUIDO, o caminho de atendimento não é acionado.
  if ((body.plano || '').toUpperCase() === 'EXCLUIDO') {
    console.log(`[lead] veiculo excluido — sem PowerCRM e sem WhatsApp lead=${leadId}`)
    const supaExcluido = await persistLeadInSupabase({ body, trk, leadId, ctx }).catch((err) => {
      console.error('[lead] excluido: falha persistir Supabase:', err instanceof Error ? err.message : err)
      return { ok: false, lead_id: leadId }
    })
    return NextResponse.json({ success: true, leadId: supaExcluido.lead_id || leadId, trk, excluded: true })
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

  // 3) Inbound-first (decisão 2026-07): por padrão NÃO disparamos WhatsApp
  //    automático. O cliente inicia a conversa clicando no botão da tela de
  //    planos (wa.me com a mensagem já pronta), o que zera o cold outbound e
  //    reduz drasticamente o risco de queda/ban do chip. O lead continua salvo
  //    no PowerCRM + Supabase pra atendimento. Pra religar o disparo automático,
  //    defina WHATSAPP_AUTO_DISPATCH=true no ambiente.
  if (process.env.WHATSAPP_AUTO_DISPATCH === 'true') {
    ;(async () => {
      try {
        await sendQuotePdfWhatsApp(body, leadId)
      } catch (err) {
        console.error('[lead] Falha envio WhatsApp:', err instanceof Error ? err.message : err)
      }
    })()
  } else if (isByd(body.marca) && process.env.BYD_AUTO_DISPATCH !== 'false') {
    // Exceção BYD, LIGADA por padrão (ordem do dono, reconfirmada em
    // 07/08/2026): carro BYD recebe o texto + o PDF da simulação SEM depender do
    // clique em "Quero contratar". É a única marca que dispara sozinha — todas
    // as outras seguem inbound-first, o cliente é quem inicia. Desliga com
    // BYD_AUTO_DISPATCH=false.
    ;(async () => {
      try {
        await sendBydQuoteWithPdf(body, supaResult.lead_id || leadId, supaResult.ok)
      } catch (err) {
        console.error('[lead] BYD: falha envio WhatsApp:', err instanceof Error ? err.message : err)
      }
    })()
  }

  // ─── Lead indicado: avisa quem vai atender ────────────────────────────────
  // O Power NAO carrega essa informacao (testado 12/08/2026: `noteContract` nao
  // volta na leitura e os `utm*` sao ignorados no /quotation/add). Sem este
  // aviso, quem indicou some entre o clique e o atendimento.
  //
  // Fora do await de proposito: o cliente ja esperou o Power: nao deve esperar
  // tambem o WhatsApp de um aviso que nao e pra ele.
  if (body.indicadoPor) {
    void avisarIndicacao({
      codigo: body.indicadoPor,
      leadNome: body.nome,
      leadWhatsapp: body.whatsapp,
      consultorSlug: body.consultorSlug ?? null,
    }).catch((err) => console.error('[lead] aviso de indicação falhou:', err))
  }

  return NextResponse.json({
    success: true,
    leadId: supaResult.lead_id || leadId,
    trk,
    powercrm,
  })
}

/**
 * Manda o aviso pra quem vai atender o lead indicado.
 *
 * Vai pro consultor dono do site; se o lead entrou pelo site da casa, vai pro
 * dono. Quem recebe e sempre quem tem a conversa na mao.
 */
async function avisarIndicacao(dados: {
  codigo: string
  leadNome: string
  leadWhatsapp: string
  consultorSlug: string | null
}): Promise<void> {
  const indicador = await acharIndicador(dados.codigo)
  if (!indicador) {
    // Codigo que nao existe: alguem editou a URL, ou o link e de antes da
    // tabela. Nao e erro do cliente, entao nao vira falha — so registro.
    console.warn(`[lead] indicação "${dados.codigo}" não existe`)
    return
  }

  let destino = DONO_WHATSAPP
  if (dados.consultorSlug) {
    const consultor = await resolverConsultor(dados.consultorSlug)
    if (consultor && estaNoAr(consultor)) destino = consultor.whatsapp
  }

  await avisar(
    destino,
    textoLeadIndicado({
      leadNome: dados.leadNome,
      leadWhatsapp: dados.leadWhatsapp,
      indicadorNome: indicador.nome,
      indicadorWhatsapp: indicador.whatsapp,
    }),
  )

  await marcarUso(dados.codigo)
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

    // Quem indicou. Guardado como veio (codigo cru): se um dia chegar um codigo
    // que nao existe, da pra ver o valor errado em vez de perder a pista.
    indicado_por: body.indicadoPor?.trim().toLowerCase() || null,

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
    slsmnNwId: await powerlinkDoLead(body.consultorSlug),
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
      seed: leadId,
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

  // ── Resumo da cotação em TEXTO (sem PDF) ──
  // Decisão 2026-07-12: paramos de enviar o PDF pra reduzir o peso do disparo —
  // documento em contato frio pesa mais no anti-spam do WhatsApp e vinha
  // derrubando o chip. Enviamos UMA mensagem curta e variada com a mensalidade
  // personalizada do plano de referência (VIP pra carro) e a taxa de ativação,
  // calculadas pela tabela oficial (buildQuoteSummaryMessage). Nada depois.
  const text = buildQuoteSummaryMessage({
    nome: body.nome || '',
    marca: body.marca,
    modelo: body.modelo,
    placa: body.placa,
    fipe: body.valorFipe ?? 0,
    categoria: body.categoria,
    combustivel: body.combustivel,
    cilindrada: body.cilindrada,
    leilao: body.leilao,
    seed: leadId,
  })
  await sendPresence(phone, 'composing', 3000)
  await sleep(randInt(2500, 4500))
  const result = await sendText(phone, text)
  await registerOutboundMessage({
    result,
    jid,
    instance,
    leadId,
    message_type: 'text',
    content: text,
  })
}

/* ───────────────── BYD: cotação com PDF sem esperar o clique ───────────────── */

/** Marca é BYD? Cobre "BYD" e variações do PowerCRM/FIPE ("BYD/…"). */
function isByd(marca?: string | null): boolean {
  return (marca || '').trim().toUpperCase().startsWith('BYD')
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://21go.site'

/**
 * Envia a simulação COM PDF pro cliente BYD, sem depender do clique em "Quero
 * contratar" (ordem do dono, 04/08/2026). Duas mensagens, com ritmo humano:
 * texto anunciando o PDF e o documento em seguida.
 *
 * A mídia vai como URL sempre que possível — base64 grande faz a Evolution
 * responder 500 "Connection Closed". Ordem: storage S3/R2 → /api/pdfs/<leadId>
 * (regenera o PDF a partir do Supabase) → base64 como último recurso.
 */
async function sendBydQuoteWithPdf(
  body: LeadInput,
  leadId: string,
  leadPersisted: boolean,
): Promise<void> {
  if (!isWhatsappConfigured()) {
    console.warn('[lead] BYD: WhatsApp não configurado — pulando envio')
    return
  }

  // Sem dados completos não existe PDF pra gerar: cai no fluxo de texto, que já
  // trata o caso com uma mensagem honesta (sem prometer arquivo que não vem).
  const semDados =
    !body.marca || !body.modelo || !body.valorFipe || body.valorFipe <= 0 ||
    !body.plano || !body.valorMensal
  if (semDados) {
    console.warn(`[lead] BYD sem dados completos pra PDF lead=${leadId} — envia só texto`)
    await sendQuotePdfWhatsApp(body, leadId)
    return
  }

  const phone = formatPhone(body.whatsapp || '')
  const jid = phoneToJid(phone)
  const instance = getEvolutionInstance()
  const nome = body.nome || ''

  console.log(`[lead] BYD: disparando cotação+PDF lead=${leadId} ${body.marca} ${body.modelo}`)

  // 1) Texto que anuncia o PDF (variado por leadId — anti-ban).
  const texto = buildFollowUpMessage({
    nome,
    marca: body.marca,
    modelo: body.modelo,
    placa: body.placa,
    seed: leadId,
  })
  await sendPresence(phone, 'composing', 3000)
  await sleep(randInt(2500, 4500))
  const textResult = await sendText(phone, texto)
  await registerOutboundMessage({
    result: textResult,
    jid,
    instance,
    leadId,
    message_type: 'text',
    content: texto,
  })

  // 2) PDF da simulação.
  const filename = `simulacao-21go-${leadId}.pdf`
  // O consultor decide se a ativacao aparece no PDF. Resolvido aqui (com cache)
  // porque o PDF e montado no servidor e nao ve o contexto do navegador.
  const donoDoSite = body.consultorSlug ? await resolverConsultor(body.consultorSlug) : null

  const pdfInput = {
    consultorSlug: body.consultorSlug ?? null,
    ocultarAtivacao: donoDoSite?.ocultarAtivacao ?? false,
    nome,
    whatsapp: body.whatsapp || '',
    email: body.email ?? null,
    placa: body.placa ?? null,
    marca: body.marca!,
    modelo: body.modelo!,
    ano: body.ano ?? '',
    cor: body.cor ?? null,
    fipe: body.valorFipe!,
    planoNome: body.plano!,
    mensalidade: body.valorMensal!,
    // BYD é elétrico — categoria/combustível mudam a tabela usada no PDF.
    categoria: body.categoria ?? null,
    combustivel: body.combustivel ?? null,
    cilindrada: body.cilindrada ?? null,
    carroApp: !!body.carroApp,
    leilao: body.leilao ?? null,
    seguroAtual: body.seguroAtual ?? null,
  }

  let media: string | null = null
  let pdfUrl: string | null = null

  if (isStorageConfigured()) {
    try {
      const pdf = await generateQuotePdf(pdfInput)
      const key = `quotes/${new Date().toISOString().slice(0, 10)}/${leadId}.pdf`
      const { url } = await uploadPdf(key, pdf, filename)
      media = url
      pdfUrl = url
    } catch (err) {
      console.warn('[lead] BYD: upload do PDF falhou:', err instanceof Error ? err.message : err)
    }
  }
  if (!media && leadPersisted) {
    media = `${SITE_URL}/api/pdfs/${leadId}`
    pdfUrl = media
  }
  if (!media) {
    const pdf = await generateQuotePdf(pdfInput)
    media = pdf.toString('base64')
  }

  await sendPresence(phone, 'composing', 2000)
  await sleep(randInt(2000, 3500))
  const caption = buildPdfCaption({
    nome,
    marca: body.marca,
    modelo: body.modelo,
    placa: body.placa,
    seed: leadId,
  })
  const pdfResult = await sendPdfMedia(phone, media, caption, filename)
  await registerOutboundMessage({
    result: pdfResult,
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

  // Marca no lead pra não reenviar em reprocessamento e pra aparecer no CRM.
  if (leadPersisted) {
    try {
      await supabaseAdmin()
        .from('leads')
        .update({ pdf_enviado: true, pdf_enviado_em: new Date().toISOString() })
        .eq('id', leadId)
    } catch (err) {
      console.warn('[lead] BYD: falha marcar pdf_enviado:', err instanceof Error ? err.message : err)
    }
  }
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
