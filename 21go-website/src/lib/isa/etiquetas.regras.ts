/**
 * Etiquetas dos contatos da Isa — pra organizar e filtrar no painel e no CRM.
 *
 * Dono (15/09/2026): "falando com leticya, enviou documento, frio, fechou"; em 16/09 entraram
 * Quente e Vistoria. As
 * colunas do funil sao estas mesmas etiquetas (ver `funil.regras.ts`), com os mesmos ids, e por
 * isso a ordem aqui e a do funil: Frio por ultimo.
 *
 * Lista fechada: etiqueta digitada solta vira bagunca no filtro. Logica pura.
 */

import type { IdentidadeBot } from './identidade.regras'

export interface Etiqueta {
  id: string
  nome: string
  /** Cor do chip (fundo). Texto sempre escuro ou branco conforme `claro`. */
  cor: string
  claro: boolean
}

export const ETIQUETAS: Etiqueta[] = [
  // Dono, 01/10/2026: "cria uma etiqueta urgente, caso eu seleciono ela ele vai pra urgente" —
  // marcar esta etiqueta joga a conversa na aba URGENTE, mesmo sem motivo automatico.
  { id: 'urgente', nome: 'Urgente', cor: '#DC2626', claro: false },
  // Dono, 16/09/2026: "faz uma tag quente tbm e funil tbm"
  { id: 'quente', nome: 'Quente', cor: '#EF4444', claro: false },
  { id: 'leticya', nome: 'Falando com Leticya', cor: '#F2911D', claro: false },
  // Dono, 29/09/2026: "crie uma etiqueta com nome falando com Guilherme"
  { id: 'guilherme', nome: 'Falando com Guilherme', cor: '#F472B6', claro: false },
  // Dono, 29/09/2026: "criar uma etiqueta com nome pensando"
  { id: 'pensando', nome: 'Pensando', cor: '#FACC15', claro: true },
  { id: 'documento', nome: 'Enviou documento', cor: '#93C5FD', claro: true },
  // Dono, 16/09/2026: "faz uma tag vistoria e coloca no funil tbm"
  { id: 'vistoria', nome: 'Vistoria', cor: '#C4B5FD', claro: true },
  { id: 'fechou', nome: 'Fechou', cor: '#22C55E', claro: false },
  // Dono, 21/09/2026: quem veio pelo "Quero Ser Consultor" vai so pra esta coluna/aba. O worker
  // da Isa marca sozinho (recrutamentoNaIsa); nao aparece em Todos nem em Precisa de voce.
  { id: 'consultor', nome: 'Consultores', cor: '#2DD4BF', claro: true },
  { id: 'frio', nome: 'Frio', cor: '#64748B', claro: false },
]

/**
 * A lista de um bot: a da Isa, com "Falando com <humano>" no lugar de "Falando com Leticya" (mesma
 * posicao e cor) e sem as etiquetas que ele nao usa. Mariana (dono, 01/10/2026): Gabriel no lugar
 * da Leticya e sem Guilherme. Na Isa devolve a lista de sempre.
 */
export function etiquetasDoBot(bot: { humano: Pick<IdentidadeBot['humano'], 'id' | 'nome'>; semEtiquetas: readonly string[] }): Etiqueta[] {
  return ETIQUETAS.filter((e) => !bot.semEtiquetas.includes(e.id)).map((e) =>
    e.id === 'leticya' ? { ...e, id: bot.humano.id, nome: `Falando com ${bot.humano.nome}` } : e,
  )
}

/**
 * So ids conhecidos, sem repetir, na ordem da lista oficial.
 *
 * As etiquetas que o dono cortou em 15/09/2026 (quente, vai_fechar, falta_doc, vistoria, avaria,
 * sem_retorno) continuam gravadas em `isa_contatos.etiquetas` e simplesmente param de aparecer —
 * `ChipEtiqueta` ignora id desconhecido. Nada e apagado do banco: basta devolver a etiqueta a
 * lista pra marcacao antiga voltar a tela.
 */
export function normalizarEtiquetas(lista: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  if (!Array.isArray(lista)) return []
  const ids = new Set(etiquetas.map((e) => e.id))
  const pedidas = new Set(lista.filter((x): x is string => typeof x === 'string' && ids.has(x)))
  return etiquetas.map((e) => e.id).filter((id) => pedidas.has(id))
}

/**
 * Etiquetas que tiram o contato da fila "precisa de voce": ja tem gente cuidando (Leticya) ou nao
 * vale mais a pena correr atras (Frio). Dono, 16/09/2026: "se eu coloquei tag falando com leticya
 * vc tira do precisa de vc" (o Frio ja saia desde a manha). E "se fechou sai de preciso de vc".
 */
// Dono, 29/09/2026: "qd eu colocar qq etiqueta vc tira de urgente, so quente que continua".
export function etiquetasForaDaFila(etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  return etiquetas.map((e) => e.id).filter((id) => id !== 'quente' && id !== 'urgente')
}

export const ETIQUETAS_FORA_DA_FILA: readonly string[] = etiquetasForaDaFila()

export function etiquetaValida(id: string | null | undefined, etiquetas: readonly Etiqueta[] = ETIQUETAS): boolean {
  return !!id && etiquetas.some((e) => e.id === id)
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
export function etiquetasParaGravar(pedidas: unknown, gravadas: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  const escolhidas = normalizarEtiquetas(pedidas, etiquetas)
  const manter = Array.isArray(gravadas)
    ? ETIQUETAS_DE_SISTEMA.filter((id) => gravadas.includes(id) && !escolhidas.includes(id))
    : []
  return [...escolhidas, ...manter]
}
