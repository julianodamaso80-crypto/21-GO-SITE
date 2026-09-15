/**
 * Funil (kanban) do atendimento — dono, 11/09/2026: "quero algo bem organizado tipo um CRM, onde
 * posso colocar em kanban", e "posso mover ele pros funis que eu quiser".
 *
 * Dono (15/09/2026): a coluna "Novo" saiu, o funil COMECA no Simulou e as colunas seguintes sao
 * as etiquetas (`etiquetas.regras.ts`), com os mesmos ids e rotulos, sendo Frio a ultima.
 *
 * A etapa que a pessoa ARRASTOU manda sempre. Sem arrastar, a etapa sai sozinha do que já
 * aconteceu na conversa (escolheu plano, mandou documento) — assim ninguém precisa organizar na
 * mão pra ver o funil cheio.
 */

export interface Etapa {
  id: string
  rotulo: string
  /** Cor da coluna. Da 2a em diante e a cor da etiqueta de mesmo id, pra tag e coluna combinarem. */
  cor: string
}

export const ETAPAS: readonly Etapa[] = [
  { id: 'simulou', rotulo: 'Simulou', cor: '#293C82' },
  { id: 'leticya', rotulo: 'Falando com Leticya', cor: '#F2911D' },
  { id: 'documento', rotulo: 'Enviou documento', cor: '#93C5FD' },
  { id: 'fechou', rotulo: 'Fechou', cor: '#22C55E' },
  { id: 'frio', rotulo: 'Frio', cor: '#64748B' },
]

const IDS = new Set(ETAPAS.map((e) => e.id))

export function ehEtapa(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}

/**
 * Etapa antiga ainda gravada em `isa_contatos.etapa` -> a coluna nova. Sem isso, todo card que
 * alguem arrastou antes de 15/09/2026 voltava pra etapa automatica e a organizacao feita a mao
 * se perdia. "Vistoria" vinha depois do documento e nao tem mais coluna: fica no documento.
 */
const EQUIVALENTE: Record<string, string> = {
  novo: 'simulou',
  escolheu: 'leticya',
  documentos: 'documento',
  vistoria: 'documento',
  fechado: 'fechou',
  perdido: 'frio',
}

/** A coluna atual de uma etapa gravada, ou null se for lixo/vazia (cai na automatica). */
export function etapaCompativel(id: string | null | undefined): string | null {
  if (!id) return null
  const atual = EQUIVALENTE[id] ?? id
  return IDS.has(atual) ? atual : null
}

export function etapaDoCard(c: {
  etapa: string | null
  escolheuPlano: boolean
  mandouDocumento: boolean
}): string {
  const arrastada = etapaCompativel(c.etapa)
  if (arrastada) return arrastada
  if (c.mandouDocumento) return 'documento'
  if (c.escolheuPlano) return 'leticya'
  // Sem "Novo": quem ainda nao simulou tambem aparece na primeira coluna (dono, 15/09/2026).
  return 'simulou'
}
