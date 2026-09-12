import 'server-only'
import { sql } from '@/lib/isa/banco'
import { calcActivation, isLeilaoOrigin, PLAN_INFO, type PlanId } from '@/data/pricing'
import { montarFatos, planosQueAparecem, planoDosBeneficios, type Fatos, type PlanoEntrada } from '@/lib/isa/fatos.regras'
import { extrairNumeros } from '@/lib/isa/validador.regras'

/**
 * Liga o cliente do WhatsApp a simulacao que ele fez (lead) e monta os fatos com as MESMAS
 * funcoes da tela: calcActivation (pricing.ts) com o plano de referencia na ordem oficial, e o
 * texto de beneficios de PLAN_INFO. Lead de consultor nunca entra (REGRA 0.1).
 */

// Mesma ordem da tela e do pdf-quote: o "VIP" de cada tipo de veiculo e a base da ativacao.
const ORDEM_REFERENCIA = ['vip', 'suv', 'moto-1000', 'moto-400', 'especial', 'premium', 'do-seu-jeito', 'basico']

export interface LeadIsa {
  id: string
  nome: string | null
  marca_interesse: string | null
  modelo_interesse: string | null
  ano_interesse: number | null
  valor_fipe_consultado: number | null
  cotacao_planos: { id: string; name: string; monthly: number }[] | null
  carro_app: boolean | null
  leilao: string | null
  estado: string | null
  placa_interesse: string | null
  /** Plano que estava selecionado na tela quando o lead salvou (so o site grava). */
  cotacao_plano?: string | null
  /** So vem da consulta de placa da Isa (o lead do site nao grava) — ajuda a achar eletrico. */
  combustivel?: string | null
}

const COLUNAS = `id, nome, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado,
  cotacao_planos, carro_app, leilao, estado, placa_interesse, cotacao_plano`

/**
 * A simulacao mais recente do telefone (ou a do lead_id que a propria Isa gravou). `desde` =
 * reiniciada_em do contato: depois de um /reiniciar, simulacao antiga nao conta.
 */
export async function leadDoCliente(telefone: string, leadId: string | null, desde: string | null = null): Promise<LeadIsa | null> {
  if (leadId) {
    // Lead de consultor nunca entra, nem pelo link do popup (REGRA 0.1).
    const r = await sql<LeadIsa>(`SELECT ${COLUNAS} FROM public.leads WHERE id = $1 AND consultor_slug IS NULL LIMIT 1`, [leadId])
    if (r[0]?.cotacao_planos?.length) return r[0]
  }
  const r = await sql<LeadIsa>(
    `SELECT ${COLUNAS} FROM public.leads
     WHERE (telefone = $1 OR whatsapp = $1)
       AND consultor_slug IS NULL
       AND cotacao_planos IS NOT NULL
       AND created_at > (now() AT TIME ZONE 'UTC') - interval '30 days'
       AND created_at > COALESCE($2::timestamptz AT TIME ZONE 'UTC', '-infinity'::timestamp)
     ORDER BY created_at DESC LIMIT 1`,
    [telefone, desde],
  )
  return r[0] ?? null
}

export function ativacoesDoLead(
  lead: LeadIsa,
  o: { todosOsPlanos?: boolean } = {},
): { referencia: number | null; porPlano: Record<string, number> } {
  const planos = o.todosOsPlanos ? lead.cotacao_planos || [] : planosQueAparecem(lead.cotacao_planos || [])
  const moto = planos.some((p) => p.id === 'moto-400' || p.id === 'moto-1000')
  const extraApp = lead.carro_app && !moto ? 20 : 0
  const ref = ORDEM_REFERENCIA.map((id) => planos.find((p) => p.id === id)).find(Boolean) || planos[0]
  if (!ref) return { referencia: null, porPlano: {} }
  const isBYD = (lead.marca_interesse || '').trim().toUpperCase().startsWith('BYD')
  const base = ref.monthly + extraApp
  const porPlano: Record<string, number> = {}
  for (const p of planos) porPlano[p.id] = calcActivation(base, isBYD, p.monthly + extraApp)
  return { referencia: calcActivation(base, isBYD), porPlano }
}

/**
 * `todosOsPlanos`: a lista inteira que o SITE mostrou (pro desconto do popup/5 min partir da
 * ativacao que o cliente viu). Sem ele, so os planos que a Isa oferece (planosQueAparecem).
 */
export function fatosDoLead(
  lead: LeadIsa,
  desconto50: { de: number; para: number } | null,
  o: { todosOsPlanos?: boolean } = {},
): Fatos {
  const lista = lead.cotacao_planos || []
  const planos: PlanoEntrada[] = (o.todosOsPlanos ? lista : planosQueAparecem(lista)).map((p) => ({
    id: p.id,
    nome: p.name,
    mensal: Number(p.monthly),
    // "Parabrisa" no site; pra Isa o item ja carrega os 70% (eval de 12/09/2026: ela lia o item e
    // esquecia a regra do gabarito).
    beneficios: PLAN_INFO[planoDosBeneficios(p.id) as PlanId]?.features.map((b) => (/^parabrisa$/i.test(b.text) ? { ...b, text: 'Parabrisa (70% do valor)' } : b)),
  }))
  const numerosDosBeneficios = planos.flatMap((p) =>
    (p.beneficios || []).flatMap((b) => extrairNumeros(b.text).dinheiro),
  )
  const at = ativacoesDoLead(lead, o)
  return montarFatos({
    marca: lead.marca_interesse,
    modelo: lead.modelo_interesse,
    ano: lead.ano_interesse,
    fipe: lead.valor_fipe_consultado,
    combustivel: lead.combustivel ?? null,
    leilao: isLeilaoOrigin(lead.leilao),
    carroApp: !!lead.carro_app,
    estado: lead.estado || null,
    planos,
    ativacaoReferencia: at.referencia,
    ativacaoPorPlano: at.porPlano,
    desconto50,
    numerosDosBeneficios,
  })
}
