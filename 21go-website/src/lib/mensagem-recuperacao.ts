/**
 * A mensagem que vai pra quem simulou e não clicou em "Quero contratar".
 *
 * ─── Ela não calcula nada ────────────────────────────────────────────────────
 *
 * Os valores saem de `cotacao_planos` / `cotacao_valor` — o que o cliente viu
 * na tela, gravado no lead. Recalcular aqui é o erro que já aconteceu duas
 * vezes neste projeto (o PDF que devolvia um preço diferente do da tela). Se o
 * lead não tem valor gravado, não há mensagem: sem preço na mão, a abordagem
 * não sai.
 *
 * ─── Texto, nunca anexo ──────────────────────────────────────────────────────
 *
 * O PDF vai como LINK, igual ao que o "Quero contratar" já manda hoje. Anexo de
 * número desconhecido parece golpe, e bloqueio é justamente o sinal que derruba
 * chip.
 *
 * ─── Sem nome de pessoa ──────────────────────────────────────────────────────
 *
 * A mensagem é sempre em nome da 21Go. Nome próprio fixo vaza pra quem não é
 * daquele número — foi assim que o nome da consultora acabou no site de outro
 * consultor.
 */

import crypto from 'crypto'

export interface PlanoDaTela {
  id: string
  name: string
  monthly: number
  popular?: boolean
}

export interface DadosRecuperacao {
  nome: string
  marca?: string | null
  modelo?: string | null
  placa?: string | null
  planoEscolhido?: string | null
  valorEscolhido?: number | null
  planos?: PlanoDaTela[] | null
  /** Semente da variação — use o leadId, pra retry mandar o mesmo texto. */
  seed: string
  /** Link da simulação em PDF (o mesmo que o "Quero contratar" manda). */
  linkPdf?: string | null
}

function pick<T>(arr: T[], seed: string, salt: string): T {
  const h = crypto.createHash('md5').update(`${seed}|${salt}`).digest()
  return arr[h[0] % arr.length]
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const SAUDACOES: ((n: string) => string)[] = [
  (n) => `Oi *${n}*, tudo bem? 🙂`,
  (n) => `Olá *${n}*! Como você está?`,
  (n) => `Oi *${n}*, tudo certo por aí?`,
  (n) => `Olá, *${n}*! Espero que esteja tudo bem 🙂`,
  (n) => `Oi *${n}*! Tudo joia?`,
]

const INTROS: ((v: string, p: string) => string)[] = [
  (v, p) => `Aqui é da 21Go. Vi que você fez uma simulação ${p} *${v}* no nosso site.`,
  (v, p) => `Quem fala é do time da 21Go — você simulou ${p} *${v}* aqui com a gente.`,
  (v, p) => `Aqui é da 21Go 🙂 Sua simulação ${p} *${v}* ficou registrada com a gente.`,
  (v, p) => `Sou do time da 21Go. Você deixou uma cotação ${p} *${v}* no nosso site.`,
  (v, p) => `Aqui quem fala é da 21Go. Passou pelo site e simulou ${p} *${v}*, né?`,
]

const VALORES: ((n: string, m: string) => string)[] = [
  (n, m) => `🛡️ No plano *${n}* ficou em *R$ ${m}/mês*.`,
  (n, m) => `💙 *${n}* — *R$ ${m}/mês*, do jeitinho que apareceu na tela.`,
  (n, m) => `📌 O valor que apareceu pra você: *${n}*, *R$ ${m}/mês*.`,
  (n, m) => `Sua mensalidade no *${n}* deu *R$ ${m}*.`,
]

const FECHOS: string[] = [
  `Quer que eu te explique as coberturas? Respondo por aqui 🙂`,
  `Ficou alguma dúvida sobre o que entra no plano? É só me chamar.`,
  `Posso te mostrar os outros planos também, se preferir 😉`,
  `Se quiser seguir ou tirar dúvida, me responde aqui que eu te ajudo 🙂`,
  `Quer entender como funciona na prática? Me chama que eu explico.`,
  `Te interessou? Me diz por aqui que eu sigo com você 🙂`,
]

function resolveVeiculo(marca?: string | null, modelo?: string | null): {
  texto: string
  prep: 'da' | 'do'
} {
  const cru = `${marca || ''} ${modelo || ''}`.trim()
  const eMoto = cru.toLowerCase().includes('moto')
  const manual = !modelo || modelo === '(manual)' || modelo === '(informado manualmente)'
  if (manual) return { texto: eMoto ? 'sua moto' : 'seu veículo', prep: eMoto ? 'da' : 'do' }
  return { texto: cru, prep: eMoto ? 'da' : 'do' }
}

/** O plano que aparece na mensagem: o escolhido; senão o destacado da tela. */
function planoDeReferencia(d: DadosRecuperacao): { nome: string; valor: number } | null {
  if (d.planoEscolhido && d.valorEscolhido && d.valorEscolhido > 0) {
    return { nome: d.planoEscolhido, valor: d.valorEscolhido }
  }
  const lista = d.planos || []
  const escolhido = lista.find((p) => p.popular) || lista.find((p) => p.monthly > 0)
  if (escolhido && escolhido.monthly > 0) {
    return { nome: escolhido.name, valor: escolhido.monthly }
  }
  return null
}

/**
 * Monta a mensagem. Devolve `null` quando não há preço confiável pra citar —
 * nesse caso o lead não é abordado, e isso é o certo.
 */
export function montarMensagemRecuperacao(d: DadosRecuperacao): string | null {
  const plano = planoDeReferencia(d)
  if (!plano) return null

  const primeiroNome = d.nome.trim().split(/\s+/)[0] || 'tudo bem'
  const { texto, prep } = resolveVeiculo(d.marca, d.modelo)

  const linhas = [
    pick(SAUDACOES, d.seed, 'saud')(primeiroNome),
    ``,
    pick(INTROS, d.seed, 'intro')(texto, prep),
  ]

  if (d.placa) linhas.push(``, `Placa *${d.placa}*.`)

  linhas.push(``, pick(VALORES, d.seed, 'valor')(plano.nome, brl(plano.valor)))

  if (d.linkPdf) {
    linhas.push(``, `Sua simulação completa: ${d.linkPdf}`)
  }

  linhas.push(``, pick(FECHOS, d.seed, 'fecho'))

  return linhas.join('\n')
}
