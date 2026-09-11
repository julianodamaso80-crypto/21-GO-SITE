/**
 * As duas mensagens que a Isa manda depois de simular (desenho do dono, 10/09/2026):
 *   1) organizada com emoji, chamando pelo nome: veiculo, ano, FIPE, ativacao e os planos;
 *   2) o PDF com todos os beneficios (o mesmo do site, com os valores do veiculo dele).
 *
 * Montadas pelo CODIGO a partir dos fatos — a IA nao escreve preco de plano. Lista exatamente os
 * planos que vieram do Power (ou da tabela, no Power mudo), nem mais nem menos.
 */

import type { Fatos } from './fatos.regras'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EMOJI_PLANO: Record<string, string> = {
  basico: '🛡️',
  'do-seu-jeito': '✨',
  vip: '⭐',
  premium: '👑',
  suv: '⭐',
  'moto-400': '🏍️',
  'moto-1000': '🏍️',
  especial: '🚙',
}

export function mensagensDaSimulacao(p: {
  abertura: string | null
  nome: string | null
  fatos: Fatos
  pdfUrl: string
  /** O cliente nao disse se e de leilao nem se e de aplicativo — a Isa cotou como "nao". */
  leilaoOuAppAssumido: boolean
}): [string, string] {
  const f = p.fatos
  const v = f.veiculo
  const linhas: string[] = []
  if (p.abertura) linhas.push(p.abertura, '')
  linhas.push(`segue a sua simulação${p.nome ? `, ${p.nome}` : ''} 😃`, '')
  linhas.push(`🚗 ${v.descricao}`)
  if (v.ano) linhas.push(`📅 ${v.ano}`)
  if (v.fipe) linhas.push(`💰 FIPE: ${brl(v.fipe)}`)
  if (f.ativacaoReferencia) linhas.push(`🔑 Ativação: ${brl(f.ativacaoReferencia)}`)
  linhas.push('', f.planos.length === 1 ? 'temos esse plano pra você:' : 'temos esses planos pra você:')
  for (const pl of f.planos) {
    const extra = pl.ativacao && pl.ativacao !== f.ativacaoReferencia ? ` · ativação ${brl(pl.ativacao)}` : ''
    linhas.push(`${EMOJI_PLANO[pl.id] ?? '•'} ${pl.nome}: ${brl(pl.mensal)}/mês${extra}`)
  }
  if (p.leilaoOuAppAssumido) {
    linhas.push('', 'considerei que não é de leilão nem de aplicativo — se for, me avisa que eu ajusto 👍')
  }
  const pdf = `aqui tá o PDF com todos os benefícios de cada plano 👇\n${p.pdfUrl}\n\nficou alguma dúvida?`
  return [linhas.join('\n'), pdf]
}

/** Mesmo texto da tela do site quando a 21Go nao faz o veiculo. */
export function mensagemNaoFazemos(motivo: string): string {
  if (motivo === 'ano') {
    return 'infelizmente no momento não estamos aceitando veículos com ano anterior a 2006 🙏🏼'
  }
  return 'infelizmente no momento não estamos aceitando esse veículo 🙏🏼'
}
