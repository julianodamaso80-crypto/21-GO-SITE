/**
 * Sites de parceiro (hoje so o 21go.app, do consultor Gabriel Juliano): quem pode bater em
 * /api/parceiro/lead e como o lead que eles mandam vira uma linha de `leads` igual a do site da
 * casa (spec da Mariana, secao 5).
 *
 * Logica pura, sem process.env: os testes importam este arquivo direto. So `import type` aqui.
 */
import { createHash } from 'node:crypto'
import type { UpsertLeadInput } from './supabase-store'
import type { PlateErrorResponse, PlateResponse } from './plate-lookup'

export interface Parceiro {
  chave: string
  nome: string
  /** slsmnNwId no Power: e ele que atribui a cotacao ao consultor */
  powerlink: string
  /** leads.dominio: por ele a Mariana acha o lead (fonte5min) e a Isa o deixa de fora (LEADS_DE_PARCEIRO) */
  dominio: string
  /**
   * leads.origem. Fica FORA da fila do Power da casa (power-fila.regras): ela recadastraria um
   * lead sem codigo no Power da Leticya.
   */
  origem: string
}

/**
 * Quem pode usar esta porta. A chave fica no codigo (dos dois lados) de
 * proposito: o parceiro nao sabe mexer em variavel de ambiente da hospedagem
 * dele, e exigir isso trocaria uma barreira de verdade por um site que nunca
 * entra no ar. O que a chave protege e pequeno — permite criar cotacao no funil
 * do proprio parceiro, nada alem — e some com um deploy nosso.
 */
export const PARCEIROS: Record<string, Parceiro> = {
  '21goapp': {
    chave: '1f31905505bc033c80c4361c0dda6ae7',
    nome: 'Gabriel Juliano',
    powerlink: 'XDmAbx6D',
    dominio: '21go.app',
    origem: 'parceiro_21goapp',
  },
}

/** Parceiro cadastrado (nunca chave herdada do Object, como 'toString') e com a chave dele. */
export function parceiroAutorizado(id: unknown, chave: unknown): Parceiro | null {
  if (typeof id !== 'string' || typeof chave !== 'string' || !Object.hasOwn(PARCEIROS, id)) return null
  const p = PARCEIROS[id]
  return p.chave === chave ? p : null
}

export function placaDoCorpo(v: unknown): string | null {
  const p = typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  return p.length === 7 ? p : null
}

export function fipeInformado(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/** O que a tela do site manda em `planos` (cotacao/page.tsx): o que o Power deu, sem mais nada. */
export interface PlanoDaTela {
  id: string
  name: string
  monthly: number
  popular: boolean
}

/** O plano que a tela abre selecionado: o popular, senao o primeiro (cotacao/page.tsx). */
export function planoDeReferencia(planos: readonly PlanoDaTela[]): PlanoDaTela | null {
  return planos.find((p) => p.popular) ?? planos[0] ?? null
}

export type ConsultaDaPlaca =
  | {
      tipo: 'cotado'
      veiculo: { marca: string; modelo: string; ano: string; fipeValue: number; fipeCode: string }
      planos: PlanoDaTela[]
    }
  | { tipo: 'nao_fazemos'; motivo: string }
  | { tipo: 'humano' }

/** Resultado do lookupPlate (a consulta do site) no que importa pro lead. */
export function consultaDaPlaca(r: PlateResponse | PlateErrorResponse | null): ConsultaDaPlaca {
  if (!r) return { tipo: 'humano' }
  if (!r.success) return r.excluded ? { tipo: 'nao_fazemos', motivo: r.reason ?? 'model' } : { tipo: 'humano' }
  if (r.plans.length === 0) return { tipo: 'humano' }
  const v = r.vehicle
  return {
    tipo: 'cotado',
    veiculo: { marca: v.marca, modelo: v.modelo, ano: v.ano, fipeValue: v.fipeValue, fipeCode: v.fipeCode },
    planos: r.plans.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly, popular: !!p.popular })),
  }
}

export interface DadosDoLeadDoParceiro {
  parceiro: Parceiro
  trk: string
  nome: string
  telefone: string
  placa: string | null
  valorFipeInformado: number | null
  consulta: ConsultaDaPlaca
  quotationCode: string | null
  negotiationCode: string | null
  powerResponsavel: string | null
  ip: string | null
  userAgent: string | null
  referer: string | null
}

const anoDe = (s: string): number | null => {
  const m = s.match(/(\d{4})/)
  return m ? Number(m[1]) : null
}

/**
 * A linha de `leads`, campo a campo como o persistLeadInSupabase do site grava (vehicle/lead):
 * cotado = planos do Power + o de referencia; nao fazemos = EXCLUIDO; consulta falhou = sem planos,
 * como o atendimento humano do site. O que o 21go.app nao pergunta (leilao, aplicativo, e-mail)
 * fica vazio. Sem consultor_slug: o dono do lead e o dominio do parceiro.
 */
export function leadDoParceiro(d: DadosDoLeadDoParceiro): UpsertLeadInput {
  const cotado = d.consulta.tipo === 'cotado' ? d.consulta : null
  const excluido = d.consulta.tipo === 'nao_fazemos'
  const ref = cotado ? planoDeReferencia(cotado.planos) : null
  const ano = cotado ? anoDe(cotado.veiculo.ano) : null
  return {
    trk: d.trk,
    nome: d.nome,
    telefone: d.telefone,
    email: null,
    cpf: null,
    placa: d.placa,
    marca: cotado?.veiculo.marca ?? null,
    modelo: cotado?.veiculo.modelo ?? null,
    ano_modelo: ano,
    ano_fabricacao: ano,
    fipe_codigo: cotado?.veiculo.fipeCode || null,
    valor_fipe: cotado?.veiculo.fipeValue ?? d.valorFipeInformado,
    plano: excluido ? 'EXCLUIDO' : (ref?.name ?? null),
    valor_mensal: ref?.monthly ?? null,
    planos: cotado ? cotado.planos : null,
    carro_app: false,
    leilao: null,
    origem: d.parceiro.origem,
    consultor_slug: null,
    vendedor_slug: null,
    dominio: d.parceiro.dominio,
    power_responsavel: d.powerResponsavel,
    quotation_code: d.quotationCode,
    negotiation_code: d.negotiationCode,
    powercrm_payload: {
      ok: Boolean(d.quotationCode),
      quotationCode: d.quotationCode,
      negotiationCode: d.negotiationCode,
      parceiro: d.parceiro.nome,
    },
    referrer: d.referer,
    ip_address: d.ip,
    user_agent: d.userAgent,
    etapa_funil: excluido ? 'excluido' : 'cotacao_enviada',
    status: excluido ? 'excluido' : 'lead',
  }
}

/**
 * Lead de parceiro (21go.app): as contas de anuncio e os eventos de conversao sao da casa, entao
 * o webhook do Power da casa nao dispara Lead/Purchase pra ele.
 */
/** Origem dos leads que o robo de um parceiro cria (Mariana, do Gabriel). Mesmo valor de BOT_LEAD_ORIGEM no .env-mariana. */
export const ORIGENS_DE_BOT_DE_PARCEIRO: readonly string[] = ['mariana_whatsapp']

export function leadEhDeParceiro(lead: { dominio?: string | null; origem?: string | null } | null | undefined): boolean {
  if (!lead) return false
  const porDominio = Object.values(PARCEIROS).some((p) => p.dominio === lead.dominio)
  const porOrigem = Object.values(PARCEIROS).some((p) => p.origem === lead.origem)
  // Lead que a propria Mariana cria na conversa tambem e do Gabriel (vai pro Power dele).
  return porDominio || porOrigem || ORIGENS_DE_BOT_DE_PARCEIRO.includes(lead.origem ?? '')
}

/**
 * trk deterministico (16 hex, como o aleatorio de antes): o mesmo cliente reenviado no mesmo dia
 * de Sao Paulo cai na mesma linha do upsert em vez de criar outra.
 */
export function trkDoLeadDoParceiro(parceiro: Parceiro, telefone: string, placa: string | null, agora: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
  const fone = telefone.replace(/\D/g, '')
  const pl = placaDoCorpo(placa) ?? 'semplaca'
  return createHash('sha256').update(`${parceiro.dominio}|${fone}|${pl}|${dia}`).digest('hex').slice(0, 16)
}
