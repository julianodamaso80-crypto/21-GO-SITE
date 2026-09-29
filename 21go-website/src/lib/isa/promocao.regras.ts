/**
 * Promocao "40% na ativacao" (dono, 29/09/2026). Quem entrou em contato de 01 a 24/09 recebe o
 * template `ativacao_atualizada_v18` com a ativacao antes e depois, validade e dois botoes.
 *
 * - "Quero seguir": a Isa pede CNH, documento do veiculo e comprovante, continua ligada e o contato
 *   vai pra aba URGENTE.
 * - "Agora nao": ninguem responde e o contato nao aparece no painel.
 * - Escreveu outra coisa: a Isa responde sabendo da promocao e o contato vai pra URGENTE.
 *
 * Logica pura.
 */

export const TEMPLATE_PROMO = 'ativacao_atualizada_v18'
export const CAMPANHA_PROMO = 'ativacao40_set26'
export const PAYLOAD_PROMO_SEGUIR = 'promo40:seguir'
export const PAYLOAD_PROMO_AGORA_NAO = 'promo40:agora_nao'
/** Na ordem dos botoes do template: [Quero seguir, Agora nao]. */
export const PAYLOADS_PROMO = [PAYLOAD_PROMO_SEGUIR, PAYLOAD_PROMO_AGORA_NAO]
/** So na ativacao. A mensalidade nao tem desconto (dono, 29/09/2026). */
export const DESCONTO_PROMO = 0.4

export interface Promocao {
  veiculo: string
  valorAnterior: number
  valorNovo: number
  /** AAAA-MM-DD */
  validade: string
}

export function comDesconto(valor: number): number {
  return Math.round(valor * (1 - DESCONTO_PROMO) * 100) / 100
}

const valorBr = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** "LUÃ DA SILVA" -> "Luã". Primeiro nome de uma letra so ("A SOUZA") pula pro seguinte. */
export function primeiroNomePromo(nome: string | null | undefined): string | null {
  const partes = (nome || '').trim().split(/\s+/).filter((p) => p.length > 1)
  const p = partes[0]
  if (!p) return null
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')
}

/** {{1}} nome, {{2}} veiculo, {{3}} valor anterior, {{4}} valor atualizado, {{5}} validade. */
export function variaveisDaPromocao(nome: string, p: Promocao): string[] {
  return [nome, p.veiculo, valorBr(p.valorAnterior), valorBr(p.valorNovo), dataBr(p.validade)]
}

/** O texto que o cliente viu, pra gravar na conversa (a Isa le o historico). */
export function textoDaPromocao(nome: string, p: Promocao): string {
  const [n, v, de, para, ate] = variaveisDaPromocao(nome, p)
  return (
    `Olá, ${n}. Você fez uma cotação com a 21Go e estamos enviando uma nova proposta com o valor da ativação atualizado.\n\n` +
    `Veículo: ${v}\nValor anterior: R$ ${de}\nValor atualizado: R$ ${para}\nVálido até: ${ate}\n\n` +
    'A mensalidade e as coberturas não mudaram. Ficou alguma dúvida sobre essa atualização?'
  )
}

/**
 * Qual botao ele tocou. O payload e o que vale; o texto do botao so conta se vier sozinho, do jeito
 * que o botao escreve (o WhatsApp Web as vezes manda so o texto).
 */
export function botaoDaPromocao(payloads: string[], textos: string[]): 'seguir' | 'agora_nao' | null {
  if (payloads.includes(PAYLOAD_PROMO_SEGUIR)) return 'seguir'
  if (payloads.includes(PAYLOAD_PROMO_AGORA_NAO)) return 'agora_nao'
  const t = textos.map((x) => (x || '').trim().toLocaleLowerCase('pt-BR'))
  if (t.length === 1 && t[0] === 'quero seguir') return 'seguir'
  if (t.length === 1 && (t[0] === 'agora não' || t[0] === 'agora nao')) return 'agora_nao'
  return null
}

export function mensagemPedirDocumentos(primeiroNome: string | null, p: Promocao): string {
  return (
    `Perfeito${primeiroNome ? `, ${primeiroNome}` : ''}! Para darmos sequência na ativação com o valor de R$ ${valorBr(p.valorNovo)}, ` +
    'me envie por aqui a foto da sua CNH, o documento do veículo e um comprovante de residência.'
  )
}

/** Bloco do prompt: a Isa sabe da promocao mesmo quando o lead do site ja foi apagado. */
export function blocoPromocao(p: Promocao): string {
  const de = `R$ ${valorBr(p.valorAnterior)}`
  const para = `R$ ${valorBr(p.valorNovo)}`
  const ate = dataBr(p.validade)
  return [
    '## PROMOÇÃO deste cliente (vale acima de qualquer outro valor de ativação)',
    `ele recebeu da 21Go uma nova proposta: ativação do ${p.veiculo} de ${de} por ${para} (40% de desconto), válida até ${ate}.`,
    `- a ativação dele é ${para}. nunca cite outro valor de ativação`,
    '- a mensalidade e as coberturas NÃO mudaram com a promoção; o desconto é só na ativação',
    `- esse já é o desconto máximo: se ele pedir mais desconto na ativação, diga que ${para} já é o valor promocional, válido até ${ate}. NÃO marque o gatilho "desconto"`,
    '- pra seguir com a ativação: CNH, documento do veículo e comprovante de residência',
  ].join('\n')
}
