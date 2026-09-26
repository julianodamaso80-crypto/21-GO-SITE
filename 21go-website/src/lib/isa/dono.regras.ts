/**
 * O protocolo do dono e as frases de desconto e transferencia — logica pura.
 *
 * Desconto (dono, 10/09/2026): R$ 50 na ativacao sao automaticos SO nas duas entradas (popup de
 * saida e mensagem dos 5 min), uma vez por telefone. Qualquer outro pedido de desconto: a Isa diz
 * "vou confirmar com meu supervisor", manda o alerta com botoes pro 4240, e volta ao cliente com o
 * que o dono autorizar — "consegui um desconto bem legal pra gente fechar hoje: de X por Y".
 *
 * O botao do alerta carrega o telefone do cliente no payload: e assim que o "Autorizar" do dono
 * sabe de qual cliente e, mesmo com varios pedidos abertos.
 */

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PREFIXO = 'isa-desc'
const NUMERO_4824 = '5521969454824'
// Dono (13/09/2026): "manda so o numero, que ele consegue clicar; nao precisa esse link feio gigante".
// O WhatsApp deixa o numero clicavel sozinho; o resumo pro time vai pelo aviso, nao pelo link.
const NUMERO_4824_BONITO = '+55 21 96945-4824'

export function payloadDesconto(telefone: string, decisao: 'sim' | 'nao'): string {
  return `${PREFIXO}:${telefone}:${decisao}`
}

export type RespostaDono =
  | { acao: 'autorizar'; telefone: string }
  | { acao: 'recusar'; telefone?: string }
  | { acao: 'valor'; valor: number }
  | { acao: 'nada' }

export function interpretarDono(m: { texto: string | null; payload: string | null }): RespostaDono {
  const p = (m.payload || '').split(':')
  if (p[0] === PREFIXO && p[1]) {
    return p[2] === 'sim' ? { acao: 'autorizar', telefone: p[1] } : { acao: 'recusar', telefone: p[1] }
  }
  const t = (m.texto || '').trim().toLowerCase()
  if (/^(n[aã]o|recus|nega)/.test(t)) return { acao: 'recusar' }
  const num = t.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/)
  if (num) {
    const v = Number(num[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(v) && v > 0) return { acao: 'valor', valor: Math.round(v * 100) / 100 }
  }
  return { acao: 'nada' }
}

/** O dono so pode autorizar um valor MENOR que a ativacao atual (e maior que zero). */
export function valorAutorizadoValido(valor: number, ativacaoAtual: number): boolean {
  return valor > 0 && valor < ativacaoAtual
}

export function mensagemDesconto50(d: { de: number; para: number }, o: { perguntaSeFecha?: boolean } = {}): string {
  const base = `você acaba de ganhar um desconto na sua ativação 🎉\n\nem vez de pagar ${brl(d.de)}, você vai pagar ${brl(d.para)}`
  // Depois de "qual e a sua duvida?", perguntar se fecha atropela o cliente. Dono (12/09/2026):
  // nao ser direto demais — abrir espaco pra duvida sobre o plano antes de puxar a ativacao.
  return o.perguntaSeFecha === false ? base : `${base}\n\nficou alguma dúvida sobre o plano que eu possa esclarecer, ou quer que eu já siga com a sua ativação?`
}

/**
 * Protocolo do desconto na ativacao (dono, 12/09/2026): ele diz que a ativacao esta cara → a Isa
 * oferece tentar com o supervisor e pergunta quando ele fecha → ele responde → ela avisa o dono
 * (com a resposta) → o dono manda o valor → ela volta empolgada "consegui um bom desconto pra voce,
 * de X por Y, o que acha?" → pediu mais → "vou tentar de novo".
 */
export const AGUARDANDO_FECHA_QUANDO = 'fecha_quando'

export function mensagemTentarDesconto(): string {
  return 'posso tentar conseguir um desconto na ativação com meu supervisor 🙏🏼\n\nse eu conseguir, você pretende fechar quando?'
}

export function mensagemVouFalarComSupervisor(): string {
  return 'deixa comigo, vou falar com ele agora e já te retorno 🙏🏼'
}

export function mensagemTentarDeNovo(): string {
  return 'vou tentar de novo com meu supervisor 🙏🏼 já te retorno'
}

export function mensagemDescontoDoDono(d: { de: number; para: number }): string {
  return `consegui um bom desconto pra você 🎉\n\nde ${brl(d.de)} por ${brl(d.para)}\n\no que acha?`
}

/**
 * Texto do "recusar" — redacao minha, a confirmar com o dono antes da liberacao. Adesivo so pra
 * DDD 21 (dono, 11/09/2026: ele so e colado na sede, em Campo Grande).
 */
export function mensagemDonoRecusou(ativacao: number, comAdesivo = true): string {
  const desconto = comAdesivo ? 'o do adesivo e pagando 5 dias antes' : 'pagando 5 dias antes do vencimento'
  return `conversei com meu supervisor e infelizmente não consegui um desconto a mais dessa vez 🙏🏼\n\na ativação continua ${brl(ativacao)}, e o desconto que dá pra ter na mensalidade é ${desconto}`
}

const TEXTO_TRANSFERENCIA: Record<string, string> = {
  avaria: 'vou passar as fotos pra Leticya avaliar e ela já te responde 🙏🏼',
  documento: 'vou te passar pra Leticya, que vai finalizar com você 🙏🏼',
  associado: 'vou te passar pra Leticya, que cuida disso pra você 🙏🏼',
  sem_preco: 'vou pedir pra Leticya fazer a cotação do seu veículo com cuidado 🙏🏼',
  byd: 'quem cuida da proteção do seu BYD é a Leticya, ela vai te atender pessoalmente 🙏🏼',
}

/** O cliente toca no numero e ELE escreve pro 4824 — o 4824 nunca manda a primeira mensagem. */
export function mensagemTransferencia(p: { motivo: string; resumo?: string }): string {
  const frase = TEXTO_TRANSFERENCIA[p.motivo] ?? TEXTO_TRANSFERENCIA.documento
  return `${frase}\n\né só chamar ela nesse número 👇\n${NUMERO_4824_BONITO}`
}

/**
 * "Voce e robo?" — texto do dono (11/09/2026). Antes a Isa ficava calada e o cliente achava que a
 * conversa tinha morrido; agora ela diz o que e, oferece a Leticya (o mesmo link do 4824 da
 * transferencia) e segue atendendo.
 */
export function mensagemRobo(p: { genero: 'm' | 'f' | null; resumo?: string }): string {
  const protegido = p.genero === 'f' ? 'protegida' : 'protegido'
  return (
    `sou uma atendente virtual inteligente 😊 tô aqui pra te ajudar com mais velocidade, pra você ficar ${protegido} o mais rápido possível\n\n` +
    `mas se você quiser falar direto com a Leticya, é só chamar nesse número 👇\n${NUMERO_4824_BONITO}`
  )
}

/** A mensagem pronta do popup comeca com "Quero meu desconto" e traz o link do PDF do lead. */
export function entradaPopup(texto: string): { popup: boolean; leadId: string | null; plano: string | null } {
  const popup = /^\s*quero meu desconto/i.test(texto)
  const m = texto.match(/api\/pdfs\/(lead_[A-Za-z0-9_]+)/)
  // "Plano: Premium · R$ 612,00/mês" — a ativacao do desconto e a do plano que estava na tela.
  const pl = texto.match(/^Plano:\s*(.+?)\s*·/m)
  return { popup, leadId: popup && m ? m[1] : null, plano: popup && pl ? pl[1] : null }
}

/** "/reiniciar" sozinho na mensagem — comando de teste do dono. */
export function ehReiniciar(texto: string | null): boolean {
  return /^\s*\/reiniciar\s*$/i.test(texto || '')
}

/**
 * Numeros de teste do dono (a allowlist e o de alertas). So eles reiniciam a conversa: um cliente
 * que reiniciasse ganharia outro desconto de R$ 50.
 */
export function numeroDeTeste(telefone: string, p: { allowlist: string | undefined; alerta: string | null }): boolean {
  return numerosDeTeste(p).includes(telefone)
}

/** Os numeros de teste do dono — tambem os unicos que a Isa atende fora do horario (24 h de teste). */
export function numerosDeTeste(p: { allowlist: string | undefined; alerta: string | null }): string[] {
  const lista = (p.allowlist ?? '').split(',').map((n) => n.trim()).filter(Boolean)
  return p.alerta && !lista.includes(p.alerta) ? [...lista, p.alerta] : lista
}

/**
 * O numero de alertas (4240) tambem testa como cliente. Ele so fala como SUPERVISOR quando ha um
 * pedido de desconto esperando resposta ("desconto:<tel>" / "valor:<tel>") ou quando toca num botao
 * do alerta. "desconto" sozinho e o estado dele como cliente, esperando o supervisor.
 */
export function respostaDeSupervisor(p: { aguardandoDono: string | null; payloads: string[] }): boolean {
  return /^(desconto|valor|pergunta):\d+$/.test(p.aguardandoDono || '') || p.payloads.some((x) => x.startsWith(`${PREFIXO}:`))
}

/** O dono respondeu a uma pergunta que a Isa nao soube: "nao"/"ignora"/"depois" = deixa pra la. */
export function donoPulouPergunta(texto: string | null): boolean {
  // So a mensagem INTEIRA sendo "nao"/"ignora": "nao aceitamos motorhome" e resposta, nao pulo.
  return /^\s*(n[aã]o|nao sei|não sei|ignora|ignorar|pula|pular|depois|deixa( pra l[aá])?)[\s!.]*$/i.test(texto || '')
}

/** Mensagem pro cliente com a resposta do dono, quando a IA nao reescreveu (rede). */
export function mensagemRespostaConfirmada(resposta: string): string {
  return `consegui confirmar aqui 🙏🏼\n\n${resposta.trim()}`
}

/**
 * Desconto automatico na ativacao (dono, 16/09/2026): o cliente diz que nao consegue a ativacao →
 * a Isa diz que vai falar com o supervisor → 6 minutos depois volta sozinha com R$ 70 de desconto,
 * ou R$ 100 se a ativacao passar de R$ 300. Uma vez so: pediu de novo, pausa e avisa o time.
 */
export const ESPERA_DESCONTO_MIN = 6

export function valorDoDescontoAutomatico(ativacao: number): number {
  const valor = ativacao > 300 ? 100 : 70
  // Ativacao pequena demais: nao da desconto que zere ou inverta o valor.
  return valor < ativacao ? valor : 0
}

export function descontoAutomaticoNaHora(pediuEm: Date, agora: Date): boolean {
  return agora.getTime() - pediuEm.getTime() >= ESPERA_DESCONTO_MIN * 60_000
}

/**
 * Ele pediu a ativacao DE GRACA (e nao so um desconto)? So entao a Isa diz "nao pagar a ativacao eu
 * nao consigo" — pra quem so pediu desconto essa frase responde algo que ele nao pediu (dono, 26/09/2026).
 */
export function pediuAtivacaoGratis(texto: string | null): boolean {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return (
    /\b(sem|isent\w*|isencao|zer\w*|tirar|tira|retirar|nao (quero |queria |vou |posso |consigo )?pagar)\b.{0,25}\bativa/.test(t) ||
    /\bativa\w*.{0,25}\b(gratis|gratuit\w*|de graca|free|zerad\w*|isent\w*)/.test(t) ||
    /\b(gratis|de graca)\b.{0,25}\bativa/.test(t)
  )
}

export function mensagemDescontoAutomatico(d: { de: number; para: number }, pediuGratis = false): string {
  const valor = Math.round((d.de - d.para) * 100) / 100
  const oferta = pediuGratis
    ? 'falei com meu supervisor aqui 🙏🏼\n\n' +
      `não pagar a ativação eu não consigo, mas o que eu consegui foi ${brl(valor)} de desconto\n\n`
    : `olha, conversei com meu supervisor aqui e consegui um super desconto de ${brl(valor)} na ativação 🙏🏼\n\n`
  return oferta + `de ${brl(d.de)} por ${brl(d.para)}, o que acha?`
}
