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
  { id: 'quente', rotulo: 'Quente', cor: '#EF4444' },
  { id: 'leticya', rotulo: 'Falando com Leticya', cor: '#F2911D' },
  { id: 'documento', rotulo: 'Enviou documento', cor: '#93C5FD' },
  { id: 'vistoria', rotulo: 'Vistoria', cor: '#C4B5FD' },
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
 * se perdia. "Vistoria" voltou a ser coluna em 16/09/2026.
 */
const EQUIVALENTE: Record<string, string> = {
  novo: 'simulou',
  escolheu: 'leticya',
  documentos: 'documento',
  fechado: 'fechou',
  perdido: 'frio',
}

/** A coluna atual de uma etapa gravada, ou null se for lixo/vazia (cai na automatica). */
export function etapaCompativel(id: string | null | undefined): string | null {
  if (!id) return null
  const atual = EQUIVALENTE[id] ?? id
  return IDS.has(atual) ? atual : null
}

/**
 * A coluna que as etiquetas dizem: a mais adiantada no funil. Dono, 16/09/2026: "botei tag fechou
 * e nao ta indo, a tag tem q andar com funil". Etiqueta que nao e coluna (avaria) nao conta.
 */
function etapaDasEtiquetas(etiquetas: readonly string[] | null | undefined): string | null {
  const ordem = ETAPAS.map((e) => e.id)
  let melhor = -1
  for (const t of etiquetas || []) {
    const i = ordem.indexOf(t)
    if (i > 0 && i > melhor) melhor = i
  }
  return melhor > 0 ? ordem[melhor] : null
}

/**
 * Etiquetas depois de mover o card pra `destino`: ganha a tag da coluna, perde as das colunas que
 * ficaram A FRENTE (senao a tag puxava o card de volta) e guarda o resto (as de antes e as de sistema).
 */
export function etiquetasAoMover(atuais: readonly string[] | null | undefined, destino: string): string[] {
  const ordem = ETAPAS.map((e) => e.id)
  const alvo = ordem.indexOf(destino)
  const fica = (atuais || []).filter((t) => {
    const i = ordem.indexOf(t)
    return i <= 0 || i < alvo
  })
  if (alvo > 0 && !fica.includes(destino)) fica.push(destino)
  return fica
}

export function etapaDoCard(c: {
  etapa: string | null
  escolheuPlano: boolean
  mandouDocumento: boolean
  etiquetas?: readonly string[] | null
}): string {
  // Etiqueta manda: pos a tag, o card esta naquela coluna (e mover o card acerta as tags).
  const pelaTag = etapaDasEtiquetas(c.etiquetas)
  if (pelaTag) return pelaTag
  const arrastada = etapaCompativel(c.etapa)
  if (arrastada) return arrastada
  if (c.mandouDocumento) return 'documento'
  if (c.escolheuPlano) return 'leticya'
  // Sem "Novo": quem ainda nao simulou tambem aparece na primeira coluna (dono, 15/09/2026).
  return 'simulou'
}
