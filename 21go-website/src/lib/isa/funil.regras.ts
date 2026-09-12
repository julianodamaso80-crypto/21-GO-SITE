/**
 * Funil (kanban) do atendimento — dono, 11/09/2026: "quero algo bem organizado tipo um CRM, onde
 * posso colocar em kanban", e "posso mover ele pros funis que eu quiser".
 *
 * A etapa que a pessoa ARRASTOU manda sempre. Sem arrastar, a etapa sai sozinha do que já
 * aconteceu na conversa (simulou, escolheu plano, mandou documento) — assim ninguém precisa
 * organizar na mão pra ver o funil cheio.
 */

export interface Etapa {
  id: string
  rotulo: string
  /** Cor da coluna (paleta da marca: azul #293C82, laranja #F2911D, verde #C7D301). */
  cor: string
}

export const ETAPAS: readonly Etapa[] = [
  { id: 'novo', rotulo: 'Novo', cor: '#7B87B8' },
  { id: 'simulou', rotulo: 'Simulou', cor: '#293C82' },
  { id: 'escolheu', rotulo: 'Escolheu plano', cor: '#F2911D' },
  { id: 'documentos', rotulo: 'Documentos', cor: '#F2911D' },
  { id: 'vistoria', rotulo: 'Vistoria', cor: '#C7D301' },
  { id: 'fechado', rotulo: 'Fechado', cor: '#C7D301' },
  { id: 'perdido', rotulo: 'Perdido', cor: '#8A94B0' },
]

const IDS = new Set(ETAPAS.map((e) => e.id))

export function ehEtapa(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}

export function etapaDoCard(c: {
  etapa: string | null
  temSimulacao: boolean
  escolheuPlano: boolean
  mandouDocumento: boolean
}): string {
  if (ehEtapa(c.etapa)) return c.etapa as string
  if (c.mandouDocumento) return 'documentos'
  if (c.escolheuPlano) return 'escolheu'
  if (c.temSimulacao) return 'simulou'
  return 'novo'
}
