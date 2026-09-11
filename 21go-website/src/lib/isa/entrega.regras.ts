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

/**
 * Placa que nenhuma fonte achou (Power sem dado, API Brasil fora). Quem simula e a Isa — NUNCA
 * manda pro 4824 (dono, 11/09/2026: "quem faz a cotacao e voce"). Pede pra conferir e oferece
 * fazer pelo modelo e ano.
 */
export function mensagemPlacaNaoAchada(): string {
  return 'não consegui achar essa placa aqui 🤔\n\nconfere pra mim se tá certinha? se preferir, me fala o modelo e o ano do veículo que eu faço a simulação por eles'
}

/** Modelo escolhido que nao deu preco: pede pra confirmar, nunca transfere. */
export function mensagemModeloSemPreco(): string {
  return 'não consegui simular esse veículo aqui 🤔\n\nme confirma o modelo e o ano? se tiver a placa, pode me mandar também'
}

/** Mesmo texto da tela do site quando a 21Go nao faz o veiculo. */
export function mensagemNaoFazemos(motivo: string): string {
  if (motivo === 'ano') {
    return 'infelizmente no momento não estamos aceitando veículos com ano anterior a 2006 🙏🏼'
  }
  return 'infelizmente no momento não estamos aceitando esse veículo 🙏🏼'
}

/**
 * O cliente escolheu um plano ("gostei do vip", "quero o basico", "vou fechar com o premium")?
 * Entao o proximo passo e pedir os documentos (dono, 11/09/2026) — no teste, a IA respondeu as
 * outras perguntas e esqueceu desse passo, por isso ele e do codigo.
 */
const ESCOLHA =
  /\b(gostei|quero|vou (de|fechar|ficar|querer)|fechar com|fecho com|prefiro|pode ser o|vamos de|bora de|escolho|fico com)\b[^.?!\n]{0,25}\b(b[aá]sico|vip|premium|do seu jeito|especia(l|is)|suv|moto)\b/i

export function escolheuPlano(texto: string | null | undefined): boolean {
  return ESCOLHA.test(texto || '')
}

export function mensagemPedidoDocumentos(): string {
  return 'que ótimo! 🥳\n\npra darmos sequência na sua ativação, me manda por aqui: foto da CNH, o documento do veículo e um comprovante de residência'
}
