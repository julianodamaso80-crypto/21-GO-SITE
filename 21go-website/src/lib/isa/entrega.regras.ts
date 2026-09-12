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
  // Leilao, remarcado, taxi ou sinistrado: o preco cai e a indenizacao tambem — dizer junto com o
  // valor, nao deixar o cliente descobrir no sinistro (auditoria de 12/09/2026).
  if (f.indenizacaoPct === 80) partes.push('como o veículo é de leilão (a mesma regra vale pra remarcado, táxi e sinistrado), a indenização em roubo, furto ou perda total é 80% da FIPE')
  if (p.leilaoOuAppAssumido) partes.push('ah, considerei que não é de leilão nem de aplicativo — se for, me avisa que eu ajusto 👍')
  return partes
}

/**
 * Placa que nenhuma fonte achou (Power sem dado, API Brasil fora). Quem simula e a Isa — NUNCA
 * manda pro 4824 (dono, 11/09/2026: "quem faz a cotacao e voce"). Pede pra conferir e oferece
 * fazer pelo modelo e ano.
 */
export function mensagemPlacaNaoAchada(comoApareceNoDenatran: string | null = null): string {
  // A placa existe mas nao deu preco (ex.: RKW7J62 e uma carreta): dizer o que o DENATRAN mostra
  // faz o cliente perceber se digitou errado — "nao achei" parecia que a placa nao existia.
  if (comoApareceNoDenatran) {
    return `essa placa aparece registrada como ${comoApareceNoDenatran} 🤔\n\nconfere pra mim se é essa mesmo? se for outro veículo, me manda a placa certinha ou o modelo e o ano que eu faço a simulação`
  }
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
  if (motivo === 'moto_leilao') return 'infelizmente não aceitamos moto de leilão 🙏🏼'
  return 'infelizmente no momento não estamos aceitando esse veículo 🙏🏼'
}

/**
 * Placa chegou: antes dos valores a Isa pergunta leilao e aplicativo JUNTOS (dono, 11/09/2026 —
 * antes ela cotava assumindo "nao" e avisava depois, e o preco podia mudar na frente do cliente).
 */
export function mensagemPerguntaLeilaoApp(abertura: string | null): string {
  const t = 'antes de te passar os valores, me confirma: o veículo é de leilão? e roda em aplicativo (uber, 99)?'
  return abertura ? `${abertura}\n\n${t}` : t
}

const APP = /\b(uber|99|99pop|indriver|aplicativo|app)\b/
const NAO_APP = /\b(nao|nem|nunca)\s+(\w+\s+){0,3}(uber|99|99pop|indriver|aplicativo|app)\b|\b(uber|99|aplicativo|app)\s+nao\b/
const NAO_LEILAO = /\b(nao|nem|nunca)\s+(e\s+)?(de\s+)?leil|leil\w*\s+nao\b/

/**
 * Resposta a pergunta de leilao/aplicativo. `null` = o cliente nao disse (ai a IA le a conversa).
 * Resposta curta segue a ordem da pergunta: "nao e sim" = nao e leilao, roda em app.
 */
export function lerLeilaoApp(texto: string | null | undefined): { leilao: boolean | null; app: boolean | null } {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const curto = t.replace(/[.!,;]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^(n|nao|nop|negativo|nao e nao|nao nao|os dois nao|nenhum( dos (dois|2))?|nenhuma( das duas)?|nem um nem outro)$/.test(curto)) {
    return { leilao: false, app: false }
  }
  if (/^sim (e )?nao$/.test(curto)) return { leilao: true, app: false }
  if (/^nao (e )?sim$/.test(curto)) return { leilao: false, app: true }
  if (/^(sim (e )?sim|ambos|os dois sim|sim (os|as|pros|pras) (dois|duas|2))$/.test(curto)) return { leilao: true, app: true }

  const r: { leilao: boolean | null; app: boolean | null } = { leilao: null, app: null }
  if (/leil/.test(t)) r.leilao = !NAO_LEILAO.test(t)
  if (APP.test(t)) r.app = !NAO_APP.test(t)
  else if (/\bparticular\b/.test(t)) r.app = false
  // "nao, trabalho no 99" / "nao. uso particular": o "nao" do comeco responde a 1a pergunta.
  if (r.leilao === null && (r.app !== null) && /^nao\b/.test(t)) r.leilao = false
  return r
}

/** Dono, 11/09/2026: a 21Go nao aceita moto de leilao (carro de leilao aceita). */
export function recusaMotoDeLeilao(categoria: string | null | undefined, leilao: boolean): boolean {
  return leilao && categoria === 'MOTOCICLETA'
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

/** `comemorar` = false quando a IA acabou de responder (ela ja comemorou; duas vezes soa robo). */
export function mensagemPedidoDocumentos(comemorar = true): string {
  const pedido = 'pra darmos sequência na sua ativação, me manda por aqui: foto da CNH, o documento do veículo e um comprovante de residência'
  return comemorar ? `que ótimo! 🥳\n\n${pedido}` : pedido
}
