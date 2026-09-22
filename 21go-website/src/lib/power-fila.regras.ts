/**
 * Fila de quem ficou sem cadastro no Power — regra do dono (21/09/2026): "o associado nunca
 * pode ficar sem ser cadastrado no Power". A criacao acontece na hora (formulario e Isa); esta
 * fila so pega o que falhou nas duas tentativas (pipeline e PowerLink).
 *
 * Medido em 22/09/2026: 50 leads normais do site sem codigo do Power, todos em 15/09 entre
 * 20:00 e 20:48 — o Power fora do ar e ninguem tentando de novo.
 */

/** So o que passa pelo formulario do site e pela Isa. O resto nasce no Power por outro caminho. */
const ORIGENS_DA_FILA = new Set(['site_organico', 'isa_whatsapp'])
const ESPERA_MS = 10 * 60 * 1000
const DESISTE_MS = 30 * 24 * 60 * 60 * 1000

export interface LeadDaFila {
  origem?: string | null
  status?: string | null
  quotation_code?: string | null
  negotiation_code?: string | null
  created_at?: string | null
}

export function leadPrecisaDoPower(l: LeadDaFila, agora: Date): boolean {
  if (!ORIGENS_DA_FILA.has(l.origem ?? '')) return false
  // EXCLUIDO nao vai ao Power, de proposito (ordem do dono, 31/07/2026).
  if (l.status === 'excluido') return false
  if (l.quotation_code || l.negotiation_code) return false
  const idade = agora.getTime() - new Date(l.created_at ?? 0).getTime()
  return idade >= ESPERA_MS && idade <= DESISTE_MS
}

function digitos(tel: string | null | undefined): string {
  let d = String(tel ?? '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d
}

/**
 * Como achar esse cliente no funil antes de criar de novo. O telefone vai nos dois formatos:
 * o painel casa pelo texto gravado (cru nos cards antigos, com mascara nos regravados).
 */
export function buscasDoLead(l: {
  whatsapp?: string | null
  telefone?: string | null
  email?: string | null
  placa_interesse?: string | null
}): { texto: string; seletor: 11 | 24 | 25 | 26 }[] {
  const d = digitos(l.whatsapp || l.telefone)
  const buscas: { texto: string; seletor: 11 | 24 | 25 | 26 }[] = []
  if (d.length === 11) buscas.push({ texto: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`, seletor: 26 })
  else if (d.length === 10) buscas.push({ texto: `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`, seletor: 26 })
  if (d.length >= 10) buscas.push({ texto: d, seletor: 26 })
  if (l.email?.trim()) buscas.push({ texto: l.email.trim(), seletor: 25 })
  const placa = (l.placa_interesse ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (placa.length === 7) buscas.push({ texto: placa, seletor: 11 })
  return buscas
}
