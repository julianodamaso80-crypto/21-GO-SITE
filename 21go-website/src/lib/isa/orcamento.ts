import 'server-only'
import { lookupPlate } from '@/lib/plate-lookup'
import { upsertLead } from '@/lib/supabase-store'
import { sql } from '@/lib/isa/banco'
import type { LeadIsa } from '@/lib/isa/fatos'

/**
 * Orcamento pela placa, feito pela Isa. Placa e primordial (dono, 10/09/2026).
 *
 * Usa a MESMA consulta do site (lookupPlate: Power /plates/ → FIPE → planos do Power), com as
 * opcoes que so a Isa liga: tabela local no Power mudo (decisao B do dono) e leilao.
 *
 * NUNCA chama /api/vehicle/lead: aquela rota dispara texto + PDF pelo 4824 pra BYD, e o cliente
 * que conversa com a Isa receberia mensagem de outro numero. Aqui o lead e gravado direto e a
 * cotacao nasce no Power no nome da Leticya (powerlink da casa), igual ao site — sem disparo.
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERCRM_DEFAULT_SLSMN_NW_ID = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
const POWERCRM_DEFAULT_LEAD_SOURCE = process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584'

export type ResultadoOrcamento =
  | { tipo: 'ok'; lead: LeadIsa & { combustivel: string | null }; tabela: boolean }
  | { tipo: 'nao_fazemos'; motivo: string }
  | { tipo: 'humano'; motivo: string }
  | { tipo: 'placa_invalida' }

// Mesma ordem da tela: o plano de referencia vira cotacao_plano/cotacao_valor do lead.
const ORDEM_REFERENCIA = ['vip', 'suv', 'moto-1000', 'moto-400', 'especial', 'premium', 'do-seu-jeito', 'basico']

export async function orcarPorPlaca(p: {
  telefone: string
  nome: string | null
  placa: string
  leilao: boolean
  carroApp: boolean
}): Promise<ResultadoOrcamento> {
  const placa = p.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) return { tipo: 'placa_invalida' }

  const r = await lookupPlate(placa, { tabelaSePowerMudo: true, isLeilao: p.leilao })
  if (!r.success) {
    if (r.excluded) return { tipo: 'nao_fazemos', motivo: r.reason ?? 'model' }
    return { tipo: 'humano', motivo: r.error }
  }

  const v = r.vehicle
  const ref = ORDEM_REFERENCIA.map((id) => r.plans.find((pl) => pl.id === id)).find(Boolean) || r.plans[0]
  // trk estavel por telefone+placa: se o cliente corrigir leilao/aplicativo, a Isa atualiza a
  // MESMA simulacao (e o PDF acompanha), em vez de criar outra.
  const trk = `isa${p.telefone}${placa}`.toLowerCase()
  const nome = (p.nome || 'Cliente WhatsApp').trim()

  const { id: leadId } = await upsertLead({
    trk,
    nome,
    telefone: p.telefone,
    placa,
    marca: v.marca,
    modelo: v.modelo,
    ano_modelo: Number(v.ano) || null,
    fipe_codigo: v.fipeCode || null,
    valor_fipe: v.fipeValue,
    plano: ref?.name ?? null,
    valor_mensal: ref?.monthly ?? null,
    planos: r.plans,
    carro_app: p.carroApp,
    leilao: p.leilao ? 'leilao' : 'nao',
    origem: 'isa_whatsapp',
  })

  // Cotacao no Power da Leticya. Falhar aqui nao impede a Isa de responder o cliente.
  criarCotacaoPower({ nome, telefone: p.telefone, placa, fipe: v.fipeValue, carroApp: p.carroApp, leilao: p.leilao, interno: r._internal })
    .then(async (c) => {
      if (c?.quotationCode) {
        await sql(`UPDATE public.leads SET quotation_code = $2, negotiation_code = $3 WHERE id = $1`, [
          leadId,
          c.quotationCode,
          c.negotiationCode ?? null,
        ])
      }
    })
    .catch((err) => console.error('[isa] cotacao no Power falhou:', err instanceof Error ? err.message : err))

  return {
    tipo: 'ok',
    tabela: !!('planos_da_tabela' in r && r.planos_da_tabela),
    lead: {
      id: leadId,
      nome,
      marca_interesse: v.marca,
      modelo_interesse: v.modelo,
      ano_interesse: Number(v.ano) || null,
      valor_fipe_consultado: v.fipeValue,
      cotacao_planos: r.plans.map((pl) => ({ id: pl.id, name: pl.name, monthly: pl.monthly })),
      carro_app: p.carroApp,
      leilao: p.leilao ? 'leilao' : 'nao',
      estado: null,
      placa_interesse: placa,
      combustivel: v.combustivel || null,
    },
  }
}

async function criarCotacaoPower(p: {
  nome: string
  telefone: string
  placa: string
  fipe: number
  carroApp: boolean
  leilao: boolean
  interno?: { mdl?: number; mdlYr?: number; cityId?: number; pcVehicle?: unknown }
}): Promise<{ quotationCode?: string; negotiationCode?: string } | null> {
  const token = process.env.POWERAPI_TOKEN
  if (!token) return null
  const headers = { accept: 'application/json', Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const chassi = (p.interno?.pcVehicle as { chassi?: string } | undefined)?.chassi

  const payload: Record<string, unknown> = {
    name: p.nome,
    phone: p.telefone.replace(/\D/g, ''),
    plts: p.placa,
    leadSource: Number(POWERCRM_DEFAULT_LEAD_SOURCE),
    slsmnNwId: POWERCRM_DEFAULT_SLSMN_NW_ID,
    protectedValue: p.fipe,
  }
  if (chassi) payload.chassi = chassi
  if (p.interno?.mdl) payload.mdl = p.interno.mdl
  if (p.interno?.mdlYr) payload.mdlYr = p.interno.mdlYr
  if (p.interno?.cityId) payload.city = p.interno.cityId
  if (p.carroApp) payload.workVehicle = true

  const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await res.json().catch(() => null)) as { quotationCode?: string; negotiationCode?: string } | null
  if (!res.ok || !j?.quotationCode) {
    console.warn('[isa] Power /quotation/add sem codigo', res.status)
    return null
  }

  // Mesmas anotacoes que o site deixa pro consultor ver na negociacao.
  const notas = ['Origem: Isa (WhatsApp 98004-0964)']
  if (p.leilao) notas.push('Veículo de leilão')
  if (p.carroApp) notas.push('Carro de aplicativo (Uber/99)')
  await fetch(`${POWERCRM_BASE_URL}/api/quotation/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: j.quotationCode, noteContractInternal: notas.join(' | ') }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {})

  return j
}
