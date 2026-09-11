/**
 * Etiquetas dos contatos da Isa — pra organizar e filtrar no painel e no CRM (dono, 11/09/2026:
 * "falta enviar doc, mandei pra vistoria, quente, frio, vai fechar, algumas coisas assim").
 * Lista fechada: etiqueta digitada solta vira bagunca no filtro. Logica pura.
 */

export interface Etiqueta {
  id: string
  nome: string
  /** Cor do chip (fundo). Texto sempre escuro ou branco conforme `claro`. */
  cor: string
  claro: boolean
}

export const ETIQUETAS: Etiqueta[] = [
  { id: 'quente', nome: 'Quente', cor: '#F2911D', claro: false },
  { id: 'vai_fechar', nome: 'Vai fechar', cor: '#C7D301', claro: true },
  { id: 'falta_doc', nome: 'Falta documento', cor: '#FDE68A', claro: true },
  { id: 'vistoria', nome: 'Vistoria', cor: '#93C5FD', claro: true },
  { id: 'fechou', nome: 'Fechou', cor: '#22C55E', claro: false },
  { id: 'frio', nome: 'Frio', cor: '#64748B', claro: false },
  { id: 'sem_retorno', nome: 'Sem retorno', cor: '#CBD5E1', claro: true },
]

const IDS = new Set(ETIQUETAS.map((e) => e.id))

/** So ids conhecidos, sem repetir, na ordem da lista oficial. */
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const pedidas = new Set(lista.filter((x): x is string => typeof x === 'string' && IDS.has(x)))
  return ETIQUETAS.map((e) => e.id).filter((id) => pedidas.has(id))
}

export function etiquetaValida(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}
