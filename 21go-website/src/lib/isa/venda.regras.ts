/**
 * O que faz a Isa VENDER, e nao so responder — logica pura, sem rede.
 *
 * Auditoria de 12/09/2026 (dono: "foco dela e atender bem e fazer vendas"): nos testes ela
 * coletou "pago 650 hoje" e jogou fora, resumiu 5 de 17 beneficios, fechou resposta com "posso
 * te ajudar com mais alguma duvida?" e retomou o cliente repetindo a pergunta que ele ja tinha
 * respondido. Cada funcao aqui fecha um desses buracos com FATO CALCULADO, nunca com a IA.
 */

import type { Fatos, PlanoFatos } from './fatos.regras'

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (v: number) => Math.round(v * 100) / 100
const norm = (t: string | null | undefined) =>
  (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/* ───────────────────────── frases de robo ───────────────────────── */

/**
 * Linha que e SO um filler de atendimento automatico sai da resposta (o resto fica). Vistas nos
 * testes: "entendi", "que legal", "otima escolha", "posso te ajudar com mais alguma duvida?".
 * A Leticya nao escreve nada disso — ela responde e pergunta a proxima coisa.
 */
const FRASE_DE_ROBO =
  /^(entendi|entendido|compreendo|compreendi|perfeito|perfeitamente|otimo|otima|que legal|que bom|legal|claro|com certeza|certo|ok|beleza|otima escolha|boa escolha|excelente( escolha)?|maravilha|show|fico feliz em ajudar|fico a disposicao|estou a disposicao|qualquer (coisa|duvida)[, ]*(e so|so) (me )?(chamar|falar)|(posso|consigo) (te )?ajudar (com|em) (mais )?alguma (coisa|duvida)|(tem|ficou) (mais )?alguma (duvida|pergunta)|mais alguma (coisa|duvida)|espero ter ajudado|estou aqui (pra|para) (te )?ajudar|conte comigo|nao hesite em (perguntar|me chamar))[\s!.?]*$/

export function ehFraseDeRobo(linha: string): boolean {
  // "entendi, Leticya": o nome no fim nao muda o que a frase e.
  const t = norm(linha).replace(/,\s*[a-z]+\s*$/, '').replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu, '').trim()
  return !!t && FRASE_DE_ROBO.test(t)
}

export function tirarFrasesDeRobo(resposta: string): string {
  return resposta
    .split('\n')
    .filter((l) => !ehFraseDeRobo(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ───────────────────────── beneficios pelo codigo ───────────────────────── */

const PERGUNTA_BENEFICIO =
  /\b(benef[ií]?c[ií]?os?|cobertura|coberturas|o que (ele |ela |o plano |esse plano |esse |este )?(cobre|inclui|tem|da|oferece)|o que\b.{0,25}\b(cobre|inclui|oferece)|o que (ta|tá|esta|está|vem) (incluso|incluido|inclu[ií]do)|quais (as |os )?(cobertura|beneficio|vantagen|itens)|inclui o que|tem o que|cobre o que|vantagens|o que (eu )?ganho|o que (eu )?tenho direito)\b/

// Nome do plano que o cliente citou ("do vip", "o basico", "premium", "suv", "especiais").
const PLANO_CITADO: [RegExp, string[]][] = [
  [/\bvip suv\b|\bsuv\b/, ['suv']],
  [/\bvip\b/, ['vip']],
  [/\bpremium\b/, ['premium']],
  [/\bbasico\b/, ['basico']],
  [/\bdo seu jeito\b|\bseu jeito\b/, ['do-seu-jeito']],
  [/\bespecia(l|is)\b/, ['especial']],
  [/\bmoto\b/, ['moto-400', 'moto-1000']],
]

/**
 * O cliente perguntou o que um plano cobre? Entao a lista sai INTEIRA pelo codigo (o prompt dizia
 * "liste TODOS" e a IA listou 5 de 17 em 11/09/2026 18:08). So entra aqui pergunta curta e
 * sozinha — junto com outra coisa, a IA responde tudo e cita a regra do gabarito.
 */
export function perguntaDeBeneficios(textoNovas: string, mensagens: number): { pergunta: boolean; planoIds: string[] | null } {
  const t = norm(textoNovas)
  // Varias perguntas na mesma mensagem (mais de um "?") vao pra IA, que responde todas.
  if (mensagens !== 1 || t.length > 90 || (t.match(/\?/g) || []).length > 1 || !PERGUNTA_BENEFICIO.test(t)) return { pergunta: false, planoIds: null }
  const citado = PLANO_CITADO.find(([re]) => re.test(t))
  return { pergunta: true, planoIds: citado ? citado[1] : null }
}

/** Qual plano dos FATOS listar: o citado; senao, se so ha um; senao null (pergunta qual). */
export function planoParaListar(planos: PlanoFatos[], planoIds: string[] | null): PlanoFatos | null {
  const citado = planoIds ? planos.find((p) => planoIds.includes(p.id)) : null
  if (citado) return citado
  return planos.length === 1 ? planos[0] : null
}

export function mensagemBeneficios(p: { abertura: string | null; plano: PlanoFatos; pdfUrl: string; temOutros: boolean }): string {
  const linhas: string[] = []
  if (p.abertura) linhas.push(p.abertura, '')
  linhas.push(`o plano ${p.plano.nome} (${brl(p.plano.mensal)}/mês) cobre:`, '')
  for (const b of p.plano.cobre) linhas.push(`✅ ${b}`)
  if (p.plano.naoCobre.length) {
    linhas.push('', `não entra nesse plano: ${p.plano.naoCobre.join(', ').toLowerCase()}`)
  }
  linhas.push('', `tá tudo detalhado no seu PDF 👇\n${p.pdfUrl}`)
  linhas.push('', p.temOutros ? 'esse é o que faz mais sentido pra você, ou quer que eu compare com outro?' : 'quer que eu já siga com a sua ativação nesse plano?')
  return linhas.join('\n')
}

export function mensagemQualPlano(planos: PlanoFatos[]): string {
  const nomes = planos.map((p) => p.nome)
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}` : nomes[0]
  return `de qual plano você quer ver a cobertura completa: ${lista}?`
}

/* ───────────────────────── quanto paga hoje ───────────────────────── */

const PERGUNTOU_QUANTO_PAGA = /quanto (voce |você |vc )?paga/
const DIZ_QUE_PAGA = /\b(pago|pagando|paga|custa|fica|ta pagando|tô pagando|to pagando)\b[^\d]{0,25}(\d{2,5}(?:[.,]\d{1,2})?)/
const SO_NUMERO = /^(?:r\$\s*)?(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:reais|por m[eê]s|\/m[eê]s|mensal|mensais)?[\s.!]*$/

/**
 * O valor que o cliente disse pagar hoje em outra protecao/seguro. Vem de "pago 650", "tá 650
 * por mês", ou de um numero solto respondendo "quanto você paga hoje?". Nunca da IA.
 */
export function valorQuePagaHoje(historico: { direction: 'inbound' | 'outbound'; content: string }[]): number | null {
  let achado: number | null = null
  for (let i = 0; i < historico.length; i++) {
    const m = historico[i]
    if (m.direction !== 'inbound') continue
    const t = norm(m.content).replace(/\./g, '').replace(/r\$/g, 'r$')
    let v: string | null = null
    const diz = t.match(DIZ_QUE_PAGA)
    if (diz) v = diz[2]
    else {
      const anterior = [...historico.slice(0, i)].reverse().find((x) => x.direction === 'outbound')
      const so = t.match(SO_NUMERO)
      if (so && anterior && PERGUNTOU_QUANTO_PAGA.test(norm(anterior.content))) v = so[1]
    }
    if (!v) continue
    const n = Number(v.replace(',', '.'))
    if (Number.isFinite(n) && n >= 30 && n <= 5000) achado = r2(n)
  }
  return achado
}

export interface ComparacaoHoje {
  /** Linhas pro bloco de FATOS. */
  linhas: string[]
  /** Numeros que a IA pode escrever por causa disso (o valor dele e cada diferenca). */
  dinheiro: number[]
}

/** Compara o que ele paga com cada plano dos FATOS — a IA so pode citar estes numeros. */
export function comparacaoComHoje(fatos: Fatos, pagaHoje: number): ComparacaoHoje {
  const linhas = [
    `⚠️ ele acabou de dizer quanto paga hoje em outra proteção/seguro: ${brl(pagaHoje)} por mês. sua resposta COMEÇA pela comparação com o número exato abaixo (não liste os planos de novo) e termina perguntando se pode seguir. comparação, plano a plano:`,
  ]
  const dinheiro = [pagaHoje]
  for (const p of fatos.planos) {
    const d = r2(Math.abs(pagaHoje - p.mensal))
    dinheiro.push(d)
    if (p.mensal < pagaHoje) linhas.push(`  - ${p.nome}: ${brl(d)} a MENOS por mês que ele paga hoje`)
    else if (p.mensal > pagaHoje) linhas.push(`  - ${p.nome}: ${brl(d)} a mais por mês — não esconda; mostre o que ele ganha a mais (o que o plano cobre)`)
    else linhas.push(`  - ${p.nome}: o mesmo valor que ele paga hoje`)
  }
  return { linhas, dinheiro }
}

/* ───────────────────────── retomada por estado ───────────────────────── */

// Uma ou mais dessas, e nada alem delas ("ok obrigado", "ta bom, valeu").
const PALAVRA_DE_DESPEDIDA =
  '(ok|okay|beleza|blz|ta bom|ta|certo|entendi|show|top|valeu|vlw|obrigad[oa]+|brigad[oa]+|obg|grat[oa]|perfeito|fechou|combinado|ate mais|ate logo|falou|tchau|boa noite|boa tarde|bom dia|vou pensar|vou ver|vou analisar|depois (eu )?(te )?(falo|chamo|vejo|respondo)|qualquer coisa (te )?(chamo|falo)|te aviso|aviso (voce|vc)|(vou )?ver com (minha|meu) (esposa|marido|mulher|pai|mae|familia|socio))'
const DESPEDIDA = new RegExp(`^(?:${PALAVRA_DE_DESPEDIDA}[\\s,!.?]*)+$`)

/** "ok obrigado", "vou pensar", "depois te falo": o cliente encerrou por hoje. */
export function ehDespedida(texto: string | null | undefined): boolean {
  const t = norm(texto).replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu, '').trim()
  return !!t && DESPEDIDA.test(t)
}

export const PERGUNTA_TEM_PROTECAO = 'hoje você tem alguma proteção pro seu veículo?'

export interface EstadoRetomada {
  /** Ja pediu os documentos (escolheu plano). */
  escolheuPlano: boolean
  /** A Isa ja perguntou "tem alguma proteção?" nesta conversa. */
  jaPerguntouProtecao: boolean
  /** Um plano so nos FATOS (Especiais, moto). */
  planoUnico: string | null
  /** A ultima mensagem dele foi despedida ("ok obrigado", "vou pensar"): retomada leve, no dia seguinte. */
  despediuSe?: boolean
}

/**
 * A mensagem de retomada certa pro momento do cliente. Antes era uma so, e ela repetia "hoje voce
 * possui alguma protecao?" pra quem tinha respondido "nao" no dia anterior (12/09/2026 13:43).
 * Sem nome aqui: quem chama pelo nome e a abertura, quando precisa — evita "Leticya 😃 / Leticya,".
 */
export function mensagemRetomada(e: EstadoRetomada): string {
  if (e.escolheuPlano) return 'conseguiu separar os documentos? é só a foto da CNH, o documento do veículo e um comprovante de residência 🙏🏼'
  if (e.jaPerguntouProtecao || e.despediuSe) {
    return e.planoUnico
      ? `conseguiu dar uma olhada na simulação? se o ${e.planoUnico} fizer sentido pra você, eu já sigo com a ativação`
      : 'conseguiu dar uma olhada na simulação? qualquer dúvida sobre os planos é só me chamar aqui'
  }
  return PERGUNTA_TEM_PROTECAO
}

export function jaPerguntouProtecao(historico: { direction: 'inbound' | 'outbound'; content: string }[]): boolean {
  return historico.some((m) => m.direction === 'outbound' && /alguma prote[cç][aã]o pro seu ve[ií]culo/i.test(m.content))
}
