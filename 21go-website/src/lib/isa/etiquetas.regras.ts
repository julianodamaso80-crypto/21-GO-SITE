/**
 * Etiquetas dos contatos da Isa — pra organizar e filtrar no painel e no CRM.
 *
 * Dono (15/09/2026): so estas 4 — "falando com leticya, enviou documento, frio, fechou". As
 * colunas do funil sao estas mesmas etiquetas (ver `funil.regras.ts`), com os mesmos ids, e por
 * isso a ordem aqui e a do funil: Frio por ultimo.
 *
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
  { id: 'leticya', nome: 'Falando com Leticya', cor: '#F2911D', claro: false },
  { id: 'documento', nome: 'Enviou documento', cor: '#93C5FD', claro: true },
  { id: 'fechou', nome: 'Fechou', cor: '#22C55E', claro: false },
  { id: 'frio', nome: 'Frio', cor: '#64748B', claro: false },
]

const IDS = new Set(ETIQUETAS.map((e) => e.id))

/**
 * So ids conhecidos, sem repetir, na ordem da lista oficial.
 *
 * As etiquetas que o dono cortou em 15/09/2026 (quente, vai_fechar, falta_doc, vistoria, avaria,
 * sem_retorno) continuam gravadas em `isa_contatos.etiquetas` e simplesmente param de aparecer —
 * `ChipEtiqueta` ignora id desconhecido. Nada e apagado do banco: basta devolver a etiqueta a
 * lista pra marcacao antiga voltar a tela.
 */
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const pedidas = new Set(lista.filter((x): x is string => typeof x === 'string' && IDS.has(x)))
  return ETIQUETAS.map((e) => e.id).filter((id) => pedidas.has(id))
}

/**
 * Etiquetas que tiram o contato da fila "precisa de voce": ja tem gente cuidando (Leticya) ou nao
 * vale mais a pena correr atras (Frio). Dono, 16/09/2026: "se eu coloquei tag falando com leticya
 * vc tira do precisa de vc" (o Frio ja saia desde a manha).
 */
export const ETIQUETAS_FORA_DA_FILA: readonly string[] = ['frio', 'leticya']

export function etiquetaValida(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}

/**
 * Etiquetas que a Isa usa como ESTADO, nao como rotulo: ficam gravadas no contato mas nao
 * aparecem na tela nem no filtro. Hoje so 'avaria' — ela e a memoria de que a Isa pediu as fotos
 * do amassado, e e o que faz a proxima foto ir pra Leticya (`worker.ts`). Saiu da tela em
 * 15/09/2026 junto com as outras, mas apagar do banco desligaria essa transferencia.
 */
export const ETIQUETAS_DE_SISTEMA: readonly string[] = ['avaria']

/**
 * O que gravar quando alguem mexe nas etiquetas pelo painel: as escolhidas na tela, mantendo o
 * estado interno que o contato ja tinha. Sem isso, o primeiro clique numa etiqueta zerava o
 * 'avaria' e a foto do amassado deixava de ser transferida.
 */
export function etiquetasParaGravar(pedidas: unknown, gravadas: unknown): string[] {
  const escolhidas = normalizarEtiquetas(pedidas)
  const manter = Array.isArray(gravadas)
    ? ETIQUETAS_DE_SISTEMA.filter((id) => gravadas.includes(id) && !escolhidas.includes(id))
    : []
  return [...escolhidas, ...manter]
}
