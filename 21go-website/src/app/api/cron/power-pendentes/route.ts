import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { estaNoAr, resolverConsultor } from '@/lib/consultor'
import { acharNoFunil, criarPelaPipeline } from '@/lib/power-pipeline'
import { POWERLINK_LETICYA, anoDoModelo, cidadeDoDdd, criaPelaPipeline } from '@/lib/power-pipeline.regras'
import { buscasDoLead, leadPrecisaDoPower } from '@/lib/power-fila.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Quem ficou sem cadastro no Power — de 15 em 15 minutos (/opt/power-pendentes-cron.sh).
 *
 * Regra do dono (21/09/2026): "nunca mais, nunca mesmo, o associado fica sem cadastro".
 * O formulario e a Isa ja tentam pipeline e PowerLink na hora; isto pega o que falhou nas
 * duas — o caso de 15/09, quando 50 clientes normais ficaram fora do Power e ninguem soube.
 *
 * Antes de criar, procura o cliente no funil (telefone, e-mail, placa): se ele ja esta la,
 * so liga o lead ao card. Criar de novo duplicaria o cliente e, com a placa, gravaria
 * "tentou criar uma cotacao" no card que ja existe.
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const ORIGEM = Number(process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584')
const POR_RODADA = 25

interface Lead {
  id: string
  nome: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  placa_interesse: string | null
  marca_interesse: string | null
  ano_interesse: number | string | null
  fipe_codigo: string | null
  cotacao_plano: string | null
  carro_app: boolean | null
  consultor_slug: string | null
  origem: string | null
  status: string | null
  quotation_code: string | null
  negotiation_code: string | null
  created_at: string
}

function apiHeaders(): Record<string, string> {
  return { accept: 'application/json', Authorization: `Bearer ${process.env.POWERAPI_TOKEN}` }
}

async function getJson<T>(caminho: string): Promise<T | null> {
  try {
    const r = await fetch(`${POWERCRM_BASE_URL}${caminho}`, { headers: apiHeaders(), signal: AbortSignal.timeout(15_000) })
    return (await r.json()) as T
  } catch {
    return null
  }
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

/** Modelo no catalogo do Power pela marca + codigo FIPE + ano — a mesma cascata do formulario. */
async function modeloDoPower(marca: string, fipe: string, ano: number, tipo: number): Promise<number | undefined> {
  const marcas = await getJson<{ id: number; text: string }[]>(`/api/quotation/cb?type=${tipo}`)
  const tokens = semAcento(marca).split(/\s+/).filter((t) => t.length >= 2)
  const cb =
    tokens.map((t) => marcas?.find((m) => semAcento(m.text || '') === t)).find(Boolean) ??
    tokens.map((t) => marcas?.find((m) => semAcento(m.text || '').includes(t))).find(Boolean)
  if (!cb) return undefined
  const modelos = await getJson<{ id: number; back: string }[]>(`/api/quotation/cmby?cb=${cb.id}&cy=${ano}`)
  return modelos?.find((m) => m.back === fipe)?.id
}

async function cadastrar(l: Lead): Promise<{ quotationCode?: string; negotiationCode: string; como: string } | { erro: string }> {
  const telefone = l.whatsapp || l.telefone || ''
  const placa = (l.placa_interesse ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const tipo = /moto/i.test(l.cotacao_plano ?? '') ? 2 : 1

  const denatran =
    placa.length === 7
      ? await getJson<{ mensagem?: string; year?: string; chassi?: string; engineNumber?: string; codFipe?: string; brand?: string }>(
          `/api/quotation/plates/${placa}`,
        )
      : null
  const ano = anoDoModelo(denatran?.mensagem === 'ok' ? denatran.year : null, l.ano_interesse)
  const fipe = (denatran?.codFipe || l.fipe_codigo || '').trim()
  const marca = (l.marca_interesse || denatran?.brand || '').trim()
  const modeloId = marca && fipe && ano ? await modeloDoPower(marca, fipe, ano, tipo) : undefined
  const cidadeId = cidadeDoDdd(telefone)?.cidadeId

  // De quem e o lead: o PowerLink do consultor do site, senao o da casa (Leticya).
  let powerlink = POWERLINK_LETICYA
  if (l.consultor_slug) {
    const c = await resolverConsultor(l.consultor_slug).catch(() => null)
    if (c && estaNoAr(c) && c.powerlinkId) powerlink = c.powerlinkId
  }

  if (criaPelaPipeline(powerlink)) {
    const c = await criarPelaPipeline({
      nome: l.nome || 'Cliente do site',
      telefone,
      email: l.email,
      placa,
      tipoVeiculo: tipo,
      modeloId,
      anoModelo: ano,
      cidadeId,
      origem: ORIGEM,
      chassi: denatran?.chassi,
      motor: denatran?.engineNumber,
      veiculoDeTrabalho: Boolean(l.carro_app),
    })
    if (c.ok) return { quotationCode: c.quotationCode, negotiationCode: c.negotiationCode, como: 'pipeline' }
    console.warn('[power-pendentes] pipeline recusou, vai pelo PowerLink:', l.id, c.motivo)
  }

  const payload: Record<string, unknown> = {
    name: l.nome || 'Cliente do site',
    phone: telefone.replace(/\D/g, ''),
    email: l.email || undefined,
    plts: placa || undefined,
    leadSource: ORIGEM,
    slsmnNwId: powerlink,
  }
  if (modeloId) payload.mdl = modeloId
  if (cidadeId) payload.city = cidadeId
  if (l.carro_app) payload.workVehicle = true
  try {
    const r = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
      method: 'POST',
      headers: { ...apiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => null)) as { quotationCode?: string; negotiationCode?: string } | null
    if (r.ok && j?.quotationCode) {
      return { quotationCode: j.quotationCode, negotiationCode: j.negotiationCode ?? j.quotationCode, como: 'powerlink' }
    }
    return { erro: `PowerLink HTTP ${r.status}` }
  } catch (err) {
    return { erro: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const agora = new Date()
  const desde = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const supa = supabaseAdmin()
  const { data, error } = await supa
    .from('leads')
    .select(
      'id, nome, telefone, whatsapp, email, placa_interesse, marca_interesse, ano_interesse, fipe_codigo, cotacao_plano, carro_app, consultor_slug, origem, status, quotation_code, negotiation_code, created_at',
    )
    .is('quotation_code', null)
    .is('negotiation_code', null)
    .in('origem', ['site_organico', 'isa_whatsapp'])
    .neq('status', 'excluido')
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[power-pendentes]', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const pendentes = ((data || []) as Lead[]).filter((l) => leadPrecisaDoPower(l, agora)).slice(0, POR_RODADA)
  const relatorio = { pendentes: pendentes.length, ja_estavam: 0, pipeline: 0, powerlink: 0, erros: 0 }

  for (const l of pendentes) {
    try {
      const existente = await acharNoFunil(buscasDoLead(l))
      if (existente) {
        await supa.from('leads').update({ negotiation_code: existente }).eq('id', l.id)
        relatorio.ja_estavam++
        continue
      }
      const r = await cadastrar(l)
      if ('erro' in r) {
        console.error('[power-pendentes] sem cadastro ainda:', l.id, r.erro)
        relatorio.erros++
        continue
      }
      await supa
        .from('leads')
        .update({ quotation_code: r.quotationCode ?? null, negotiation_code: r.negotiationCode })
        .eq('id', l.id)
      relatorio[r.como === 'pipeline' ? 'pipeline' : 'powerlink']++
    } catch (err) {
      console.error('[power-pendentes]', l.id, err instanceof Error ? err.message : err)
      relatorio.erros++
    }
  }

  return NextResponse.json(relatorio)
}
