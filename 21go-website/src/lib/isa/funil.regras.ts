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

import type { IdentidadeBot } from './identidade.regras'

export interface Etapa {
  id: string
  rotulo: string
  /** Cor da coluna. Da 2a em diante e a cor da etiqueta de mesmo id, pra tag e coluna combinarem. */
  cor: string
}

export const ETAPAS: readonly Etapa[] = [
  { id: 'simulou', rotulo: 'Simulou', cor: '#293C82' },
  // Dono, 01/10/2026: a etiqueta Urgente tambem e coluna, como todas as outras
  { id: 'urgente', rotulo: 'Urgente', cor: '#DC2626' },
  { id: 'quente', rotulo: 'Quente', cor: '#EF4444' },
  { id: 'leticya', rotulo: 'Falando com Leticya', cor: '#F2911D' },
  { id: 'guilherme', rotulo: 'Falando com Guilherme', cor: '#F472B6' },
  { id: 'pensando', rotulo: 'Pensando', cor: '#FACC15' },
  { id: 'documento', rotulo: 'Enviou documento', cor: '#93C5FD' },
  { id: 'vistoria', rotulo: 'Vistoria', cor: '#C4B5FD' },
  { id: 'fechou', rotulo: 'Fechou', cor: '#22C55E' },
  { id: 'consultor', rotulo: 'Consultores', cor: '#2DD4BF' },
  { id: 'frio', rotulo: 'Frio', cor: '#64748B' },
]

/** As colunas de um bot e a coluna de quem escolheu plano (a do humano dele). */
export interface FunilDoBot {
  etapas: readonly Etapa[]
  humanoId: string
}

export const FUNIL_PADRAO: FunilDoBot = { etapas: ETAPAS, humanoId: 'leticya' }

/** Mesma troca de etiquetasDoBot: Gabriel no lugar da Leticya, sem as etiquetas que o bot nao usa. */
export function funilDoBot(bot: { humano: Pick<IdentidadeBot['humano'], 'id' | 'nome'>; semEtiquetas: readonly string[] }): FunilDoBot {
  return {
    etapas: ETAPAS.filter((e) => !bot.semEtiquetas.includes(e.id)).map((e) =>
      e.id === 'leticya' ? { ...e, id: bot.humano.id, rotulo: `Falando com ${bot.humano.nome}` } : e,
    ),
    humanoId: bot.humano.id,
  }
}

export function ehEtapa(id: string | null | undefined, f: FunilDoBot = FUNIL_PADRAO): boolean {
  return !!id && f.etapas.some((e) => e.id === id)
}

/**
 * Etapa antiga ainda gravada em `isa_contatos.etapa` -> a coluna nova. Sem isso, todo card que
 * alguem arrastou antes de 15/09/2026 voltava pra etapa automatica e a organizacao feita a mao
 * se perdia. "Vistoria" voltou a ser coluna em 16/09/2026.
 */
const EQUIVALENTE: Record<string, string> = {
  novo: 'simulou',
  // escolheu: a coluna do humano do bot (etapaCompativel)
  documentos: 'documento',
  fechado: 'fechou',
  perdido: 'frio',
}

/** A coluna atual de uma etapa gravada, ou null se for lixo/vazia (cai na automatica). */
export function etapaCompativel(id: string | null | undefined, f: FunilDoBot = FUNIL_PADRAO): string | null {
  if (!id) return null
  const atual = id === 'escolheu' ? f.humanoId : (EQUIVALENTE[id] ?? id)
  return ehEtapa(atual, f) ? atual : null
}

/**
 * A coluna que as etiquetas dizem: a mais adiantada no funil. Dono, 16/09/2026: "botei tag fechou
 * e nao ta indo, a tag tem q andar com funil". Etiqueta que nao e coluna (avaria) nao conta.
 */
function etapaDasEtiquetas(etiquetas: readonly string[] | null | undefined, f: FunilDoBot): string | null {
  const ordem = f.etapas.map((e) => e.id)
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
export function etiquetasAoMover(atuais: readonly string[] | null | undefined, destino: string, f: FunilDoBot = FUNIL_PADRAO): string[] {
  const ordem = f.etapas.map((e) => e.id)
  const alvo = ordem.indexOf(destino)
  const fica = (atuais || []).filter((t) => {
    const i = ordem.indexOf(t)
    return i <= 0 || i < alvo
  })
  if (alvo > 0 && !fica.includes(destino)) fica.push(destino)
  return fica
}

export function etapaDoCard(
  c: {
    etapa: string | null
    escolheuPlano: boolean
    mandouDocumento: boolean
    etiquetas?: readonly string[] | null
  },
  f: FunilDoBot = FUNIL_PADRAO,
): string {
  // Etiqueta manda: pos a tag, o card esta naquela coluna (e mover o card acerta as tags).
  const pelaTag = etapaDasEtiquetas(c.etiquetas, f)
  if (pelaTag) return pelaTag
  const arrastada = etapaCompativel(c.etapa, f)
  if (arrastada) return arrastada
  if (c.mandouDocumento) return 'documento'
  if (c.escolheuPlano) return f.humanoId
  // Sem "Novo": quem ainda nao simulou tambem aparece na primeira coluna (dono, 15/09/2026).
  return 'simulou'
}

/**
 * A conversa sai de "Precisa de voce" quando alguem do time clica em "ja cuidei" (dono, 25/09/2026:
 * "quero tirar ele ali e deixar ele normal em todos") — e VOLTA sozinha quando aparece sinal novo:
 * a Isa ficou devendo uma resposta, pediu decisao de desconto, ou pausou. Sem isto, tirar da aba
 * esconderia tambem o proximo pedido do mesmo cliente.
 */
export function voltaPraPrecisaDeVoce(campos: Record<string, unknown>): boolean {
  if (campos.pergunta_pendente) return true
  if (campos.aguardando_dono) return true
  // So a pausa da PROPRIA Isa (gatilho) chama o time. Desligar a chave no painel nao poe na aba,
  // e religar nao tira (dono, 25/09/2026: "o fato de eu ligar ou desligar a isa nao tira ele do
  // precisa de vc").
  return campos.ligada === false && campos.pausa_por === 'isa'
}
