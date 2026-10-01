import 'server-only'
import { lookupPlate } from '@/lib/plate-lookup'
import { upsertLead } from '@/lib/supabase-store'
import { responsavelNoPower } from '@/lib/power-responsavel'
import type { RequestContext } from '@/lib/request-context'
import {
  consultaDaPlaca,
  fipeInformado,
  leadDoParceiro,
  placaDoCorpo,
  trkDoLeadDoParceiro,
  type ConsultaDaPlaca,
  type Parceiro,
} from '@/lib/parceiro.regras'

/**
 * Grava no nosso banco o lead que o site do parceiro mandou, como o site da casa grava (spec da
 * Mariana, secao 5): a placa passa pela MESMA consulta do site (lookupPlate: Power /plates/ ->
 * FIPE -> planos e precos do Power, sem as opcoes da Isa) e o lead nasce com o dominio do
 * parceiro. E por ele que a Mariana acha o cliente (5 min e retomada) e a Isa o deixa de fora.
 *
 * NAO cria cotacao no Power: a rota ja criou a do parceiro e passa os codigos dela.
 */
export async function gravarLeadDoParceiro(a: {
  parceiro: Parceiro
  nome: string
  telefone: string
  placa: unknown
  valorFipe: unknown
  quotationCode: string | null
  negotiationCode: string | null
  ctx: RequestContext
}): Promise<{ leadId: string; consulta: ConsultaDaPlaca['tipo'] }> {
  const placa = placaDoCorpo(a.placa)
  const trk = trkDoLeadDoParceiro(a.parceiro, a.telefone, placa)
  const r = placa ? await lookupPlate(placa).catch(() => null) : null
  const consulta = consultaDaPlaca(r)
  // Placa presa com outro consultor: a negociacao nasce no nome dele e a Mariana nao aborda.
  const powerResponsavel = await responsavelNoPower(a.negotiationCode ?? undefined, `lead_${trk}`)
  const { id } = await upsertLead(
    leadDoParceiro({
      parceiro: a.parceiro,
      trk,
      nome: a.nome,
      telefone: a.telefone,
      placa,
      valorFipeInformado: fipeInformado(a.valorFipe),
      consulta,
      quotationCode: a.quotationCode,
      negotiationCode: a.negotiationCode,
      powerResponsavel,
      ip: a.ctx.ip,
      userAgent: a.ctx.userAgent,
      referer: a.ctx.referer,
    }),
  )
  return { leadId: id, consulta: consulta.tipo }
}
