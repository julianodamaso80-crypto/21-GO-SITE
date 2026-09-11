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
  // Depois de "qual e a sua duvida?", perguntar se fecha atropela o cliente.
  return o.perguntaSeFecha === false ? base : `${base}\n\nquer que eu já siga com a sua proteção?`
}

export function mensagemDescontoDoDono(d: { de: number; para: number }): string {
  return `consegui um desconto bem legal pra gente fechar hoje: de ${brl(d.de)} por ${brl(d.para)} 🎉\n\nbora seguir?`
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
  documento: 'vou te passar pra Leticya, que vai finalizar com você 🙏🏼',
  associado: 'vou te passar pra Leticya, que cuida disso pra você 🙏🏼',
  sem_preco: 'vou pedir pra Leticya fazer a cotação do seu veículo com cuidado 🙏🏼',
}

/** O cliente toca no link e ELE escreve pro 4824 — o 4824 nunca manda a primeira mensagem. */
export function mensagemTransferencia(p: { motivo: string; resumo: string }): string {
  const frase = TEXTO_TRANSFERENCIA[p.motivo] ?? TEXTO_TRANSFERENCIA.documento
  const texto = `Oi Leticya! Vim do atendimento da Isa. ${p.resumo}`
  return `${frase}\n\né só tocar aqui que já cai com ela 👇\nhttps://wa.me/${NUMERO_4824}?text=${encodeURIComponent(texto)}`
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
  return /^(desconto|valor):\d+$/.test(p.aguardandoDono || '') || p.payloads.some((x) => x.startsWith(`${PREFIXO}:`))
}
