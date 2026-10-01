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
/** Primeira mensalidade de quem fecha pela promocao (dono, 29/09/2026). */
export const PRIMEIRA_MENSALIDADE_PROMO = '10/11'

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

/**
 * Resposta automatica do WhatsApp Business de quem recebeu ("Fulano agradece seu contato", "no
 * momento nao podemos atender"). Na primeira leva (29/09/2026) a Isa respondeu um robo desses e o
 * contato caiu em URGENTE. So vale pra primeira resposta a promocao.
 */
const AUTOMATICA = [
  /agradece (o )?seu contato/,
  /obrigad[oa] (por|pelo) (entrar em )?contato/,
  /agradecemos (o seu|seu|o) contato/,
  /(mensagem|resposta) autom[aá]tica/,
  /(no momento|agora) n[aã]o (podemos|posso|estamos|estou)/,
  /hor[aá]rio de (atendimento|funcionamento)/,
  /(retornaremos|responderemos|retornarei|responderei) (o mais breve|em breve|assim que)/,
  /como podemos (te |lhe )?ajudar\??$/,
  /seja bem[- ]vind[oa]/,
]

export function ehRespostaAutomatica(textos: string[]): boolean {
  const t = textos.join('\n').trim().toLocaleLowerCase('pt-BR')
  if (!t) return false
  return AUTOMATICA.some((r) => r.test(t))
}

/**
 * Resposta ao "Quero seguir" (dono, 29/09/2026): "que bom fulano que vc resolveu seguir e
 * aproveitar nossa promocao, seu veiculo tal, segue o link com os planos, qual vc deseja
 * contratar". Os documentos a Isa pede depois, quando ele escolher o plano.
 */
export function mensagemQueroSeguir(primeiroNome: string | null, p: Promocao, link: string | null): string {
  return (
    `que bom${primeiroNome ? `, ${primeiroNome},` : ''} que você resolveu seguir e aproveitar a nossa promoção! 😊\n\n` +
    `seu veículo: ${p.veiculo}\n\n` +
    `${linhaPagamento(p)}\n\n` +
    (link ? `aqui está o link com os planos e o valor de cada um: ${link}\n\n` : '') +
    'qual plano você deseja contratar?'
  )
}

/** "sua ativacao e R$ X pagando no ato da contratacao e a primeira mensalidade fica para 10/11" (dono). */
export function linhaPagamento(p: Promocao): string {
  return `sua ativação é R$ ${valorBr(p.valorNovo)}, paga no ato da contratação, e a primeira mensalidade fica para o dia ${PRIMEIRA_MENSALIDADE_PROMO}`
}

/** Perguntou da mensalidade ou dos planos: quem responde e o link do PDF (dono, 29/09/2026). */
export function perguntaDeMensalidade(texto: string): boolean {
  const t = (texto || '').toLocaleLowerCase('pt-BR')
  return /mensal|por m[eê]s|ao m[eê]s|presta[cç][aã]o|parcela|valor do plano|valores dos planos|quais (s[aã]o )?(os )?planos|qual (o )?valor (do plano|da prote|do seguro)|quanto (vou pagar|eu pago|fica|seria|custa|sai)/.test(t)
}

export function mensagemLinkDosPlanos(p: Promocao, link: string): string {
  return (
    'a mensalidade depende do plano que você escolher 😊\n\n' +
    `te mandei aqui o link com os planos do seu ${p.veiculo} e o valor de cada um: ${link}\n\n` +
    `${linhaPagamento(p)}\n\n` +
    'dá uma olhada e me diz qual você prefere'
  )
}

/**
 * Respondeu a promocao dizendo que nao quer: nao recebe a simulacao (dono, 01/10/2026: "a nao ser
 * que eles responderam nao, nao quero, nao tenho mais interesse, foi engano").
 */
export function semInteresse(texto: string): boolean {
  const t = (texto || '').trim().toLocaleLowerCase('pt-BR')
  if (/^n[aã]o[.!\s]*$/.test(t)) return true
  return /n[aã]o (tenho )?(mais )?interesse|sem interesse|n[aã]o quero|n[aã]o me interessa|foi engano|engano|n[aã]o fiz (nenhuma )?cota|n[aã]o (solicitei|pedi)|desisti|para(r)? de (me )?mandar|n[aã]o mand(a|e) mais|me (tira|remove)|n[aã]o, obrigad|n[aã]o obrigad/.test(t)
}

export interface PlanoPromo {
  name: string
  monthly: number
}

/**
 * A simulacao completa que vai pra quem responde a promocao (dono, 01/10/2026: "tem q enviar o link
 * com pdf para todos falando os valores dos planos, veiculo dele"). O PDF vai anexado logo depois.
 */
export function mensagemSimulacaoPromo(
  primeiroNome: string | null,
  p: Promocao,
  planos: PlanoPromo[],
  link: string,
  queroSeguir = false,
): string {
  const abre = queroSeguir
    ? `que bom${primeiroNome ? `, ${primeiroNome},` : ''} que você resolveu seguir e aproveitar a nossa promoção! 😊\n\nsegue a simulação do seu ${p.veiculo} com o valor de cada plano:`
    : `${primeiroNome ? `${primeiroNome}, ` : ''}segue a simulação do seu ${p.veiculo} com o valor de cada plano:`
  return (
    `${abre}\n\n` +
    planos.map((x) => `• ${x.name}: R$ ${valorBr(Number(x.monthly))}/mês`).join('\n') +
    `\n\n${linhaPagamento(p)}\n\n` +
    `todos os detalhes e coberturas estão no PDF: ${link}\n\n` +
    (queroSeguir ? 'qual plano você deseja contratar?' : 'qual plano faz mais sentido pra você?')
  )
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
    `- o veículo desta conversa é o que ele cotou na época: ${p.veiculo}. fale SÓ dele e SÓ com os planos e valores dos FATOS; nunca troque de veículo nem invente plano, valor ou cobertura. se não tiver o dado, diga que vai confirmar`,
    '- os valores de cada plano estão nos FATOS: responda com eles. NUNCA diga que mandou link ou PDF: quem manda a simulação é o sistema',
    '- a mensalidade e as coberturas NÃO mudaram com a promoção; o desconto é só na ativação',
    `- esse já é o desconto máximo: se ele pedir mais desconto na ativação, diga que ${para} já é o valor promocional, válido até ${ate}. NÃO marque o gatilho "desconto"`,
    `- a ativação é paga no ato da contratação e a PRIMEIRA MENSALIDADE vence dia ${PRIMEIRA_MENSALIDADE_PROMO}. perguntou quando vence a primeira mensalidade: dia ${PRIMEIRA_MENSALIDADE_PROMO}`,
    '- pra seguir com a ativação: CNH, documento do veículo e comprovante de residência',
  ].join('\n')
}
