/**
 * A mensagem que a Isa manda depois de simular (formato do dono, 11/09/2026 — substitui as duas
 * mensagens com emoji de 10/09): nome, veiculo, FIPE, os planos com preco, ativacao e o PDF.
 *
 * Montadas pelo CODIGO a partir dos fatos — a IA nao escreve preco de plano. Lista exatamente os
 * planos que vieram do Power (ou da tabela, no Power mudo), nem mais nem menos.
 */

import type { Fatos } from './fatos.regras'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Formato do dono (11/09/2026): nome, veiculo, FIPE, TODOS os planos que o veiculo pode ter com o
 * preco, ativacao, o link do PDF e, no fim, a pergunta. Uma mensagem so. Se a Isa cotou assumindo
 * "nao e leilao nem aplicativo", o aviso vai numa segunda mensagem curta.
 */
export function mensagensDaSimulacao(p: {
  abertura: string | null
  /** Nome como o cliente se identificou (o do lead / do WhatsApp). */
  nome: string | null
  fatos: Fatos
  pdfUrl: string
  /** O cliente nao disse se e de leilao nem se e de aplicativo — a Isa cotou como "nao". */
  leilaoOuAppAssumido: boolean
}): string[] {
  const f = p.fatos
  const v = f.veiculo
  const linhas: string[] = []
  if (p.abertura) linhas.push(p.abertura, '')
  if (p.nome?.trim()) linhas.push(`Nome: ${p.nome.trim()}`)
  linhas.push(`Veículo: ${v.descricao}${v.ano ? ` ${v.ano}` : ''}`)
  if (v.fipe) linhas.push(`FIPE: ${brl(v.fipe)}`)
  for (const pl of f.planos) {
    const extra = pl.ativacao && pl.ativacao !== f.ativacaoReferencia ? ` (ativação ${brl(pl.ativacao)})` : ''
    linhas.push(`Plano ${pl.nome} · ${brl(pl.mensal)}/mês${extra}`)
  }
  if (f.ativacaoReferencia) linhas.push(`Ativação: ${brl(f.ativacaoReferencia)}`)
  linhas.push(`Sua simulação completa (PDF): ${p.pdfUrl}`)
  linhas.push('', f.planos.length === 1 ? 'esse plano se encaixa com o que você tá buscando?' : 'qual deles se encaixa mais com o que você tá buscando?')
  const partes = [linhas.join('\n')]
  if (p.leilaoOuAppAssumido) partes.push('ah, considerei que não é de leilão nem de aplicativo — se for, me avisa que eu ajusto 👍')
  return partes
}

/** Mesmo texto da tela do site quando a 21Go nao faz o veiculo. */
export function mensagemNaoFazemos(motivo: string): string {
  if (motivo === 'ano') {
    return 'infelizmente no momento não estamos aceitando veículos com ano anterior a 2006 🙏🏼'
  }
  return 'infelizmente no momento não estamos aceitando esse veículo 🙏🏼'
}
