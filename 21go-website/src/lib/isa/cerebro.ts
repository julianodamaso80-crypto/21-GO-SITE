import 'server-only'
import { montarPrompt, comporResposta, abertura, tirarCumprimento, tirarNomeRepetido, ehRepeticao, vazaInterno, ehPergunta, semInformacaoValido, type Genero } from '@/lib/isa/prompt.regras'
import { validarNumeros, extrairNumeros, type Permitidos } from '@/lib/isa/validador.regras'
import { tirarFrasesDeRobo, comparacaoComHoje } from '@/lib/isa/venda.regras'
import { lerJsonTolerante } from '@/lib/isa/json.regras'
import { cumprimento } from '@/lib/isa/hora.regras'
import { NUMEROS_FIXOS, type Fatos } from '@/lib/isa/fatos.regras'
import type { MensagemHistorico } from '@/lib/isa/banco'

/**
 * Pensa a resposta da Isa: prompt (persona + gabarito + fatos) → Gemini 3.1 Pro (OpenRouter, raciocinio
 * baixo; 2.5 Flash de reserva se ele falhar) → validador de numeros.
 *
 * Eval de 12/09/2026 (scripts/isa-eval, 45 perguntas reais): Flash 38/45 — ignorava o 70% do
 * para-brisa, os 20 km do retorno a domicilio, os R$ 50 mil do adicional e respondia vago em
 * "seguro x protecao"; Pro 43/45 (as 2 que faltaram eram regex do eval). Mesma escolha do audio. Numero fora dos fatos: pede UMA reescrita dizendo quais; se errar de
 * novo, devolve gatilho "validador" e a Isa nao envia — pausa e o time assume.
 */

// Trocavel por env pra comparar modelos no eval (scripts/isa-eval) sem mexer no codigo.
const MODELO = process.env.ISA_MODELO || 'google/gemini-3.1-pro-preview'
const RESERVA = 'google/gemini-2.5-flash'
const raciocina = (modelo: string) => /pro|thinking/i.test(modelo)

export type Gatilho = 'desconto' | 'robo' | 'hostil' | 'associado' | 'sem_informacao' | 'sem_comprovante' | 'avaria' | 'validador' | null

export interface SaidaCerebro {
  resposta: string
  gatilho: Gatilho
  genero: Genero
  placa: string | null
  semPlaca: { marca: string | null; modelo: string; ano: number | null } | null
  leilao: boolean | null
  app: boolean | null
  reprovados: string[]
}

// Sem simulacao a Isa nao tem preco nenhum: so os valores fixos do gabarito (uma lista so, em fatos.regras).
const PERMITIDOS_SEM_FATOS: Permitidos = NUMEROS_FIXOS

const GATILHOS = new Set(['desconto', 'robo', 'hostil', 'associado', 'sem_informacao', 'sem_comprovante', 'avaria'])

function primeiroNome(nome: string | null): string | null {
  const n = (nome || '').trim().split(/\s+/)[0]
  if (!n || n.length < 2) return null
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

type MsgIA = { role: 'system' | 'user' | 'assistant'; content: string }

function paraMensagensIA(historico: MensagemHistorico[]): MsgIA[] {
  const out: MsgIA[] = []
  // Mensagens novas (depois da ultima resposta da Isa) vao numeradas quando sao mais de uma: a IA
  // marca cada parte com [n] e o envio cita a pergunta certa (dono, 11/09/2026).
  const iUltimaNossa = historico.map((m) => m.direction).lastIndexOf('outbound')
  const novas = historico.slice(iUltimaNossa + 1).filter((m) => m.direction === 'inbound' && (m.content || '').trim())
  const numero = new Map(novas.length > 1 ? novas.map((m, i) => [m.id, i + 1]) : [])
  for (const m of historico) {
    const texto = (m.content || '').trim()
    if (!texto) continue
    if (m.direction === 'inbound') out.push({ role: 'user', content: numero.has(m.id) ? `[${numero.get(m.id)}] ${texto}` : texto })
    else if (m.sender && m.sender !== 'isa') out.push({ role: 'assistant', content: `(mensagem da equipe, ${m.sender}): ${texto}` })
    else out.push({ role: 'assistant', content: texto })
  }
  return out
}

async function chamarModelo(chave: string, modelo: string, mensagens: MsgIA[]): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.5,
      // Modelo com raciocinio (Pro): o pensamento conta no limite — com 900 a resposta vinha so "{".
      max_tokens: raciocina(modelo) ? 4000 : 900,
      response_format: { type: 'json_object' },
      // Raciocinio baixo: senao demora 15 s+ por resposta.
      ...(raciocina(modelo) ? { reasoning: { effort: 'low' } } : {}),
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}

/** O modelo principal e, se ele falhar ou demorar, a reserva — o cliente nunca fica sem resposta por causa do provedor. */
async function chamarIA(mensagens: MsgIA[]): Promise<string> {
  const chave = process.env.OPENROUTER_API_KEY
  if (!chave) throw new Error('OPENROUTER_API_KEY ausente')
  try {
    return await chamarModelo(chave, MODELO, mensagens)
  } catch (err) {
    if (MODELO === RESERVA) throw err
    console.warn('[isa] modelo principal falhou, indo pra reserva:', err instanceof Error ? err.message : err)
    return chamarModelo(chave, RESERVA, mensagens)
  }
}

export class JsonInvalido extends Error {}

function lerSaida(bruto: string, aberturaDoCodigo: string | null, primeiroNome: string | null): Omit<SaidaCerebro, 'reprovados'> {
  // Quebra de linha crua dentro do JSON derrubava a resposta inteira (eval de 12/09/2026).
  const j = lerJsonTolerante(bruto)
  if (!j) throw new JsonInvalido(`JSON da IA ilegível: ${bruto.slice(0, 120)}`)
  const gat = typeof j.gatilho === 'string' && GATILHOS.has(j.gatilho) ? (j.gatilho as Gatilho) : null
  const gen = j.genero === 'm' || j.genero === 'f' ? j.genero : null
  const placa = typeof j.placa === 'string' ? j.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null
  const sp = j.sem_placa as { marca?: unknown; modelo?: unknown; ano?: unknown } | null | undefined
  const pronta = typeof j.pronta === 'string' ? j.pronta : null
  return {
    // Resposta pronta: a IA so aponta a chave; o texto do dono entra aqui, exato.
    // O cumprimento e do codigo (hora certa do Rio), nunca da IA.
    // O nome so aparece no cumprimento do codigo (dono, 11/09/2026: nada de "Juliano" toda hora).
    // Filler de robo ("entendi", "posso te ajudar com mais alguma duvida?") sai no codigo — auditoria 12/09/2026.
    resposta: comporResposta(pronta, tirarFrasesDeRobo(tirarNomeRepetido(tirarCumprimento(typeof j.resposta === 'string' ? j.resposta : ''), primeiroNome)), aberturaDoCodigo),
    gatilho: gat,
    genero: gen,
    placa: placa && /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) ? placa : null,
    semPlaca:
      sp && typeof sp.modelo === 'string' && sp.modelo.trim()
        ? { marca: typeof sp.marca === 'string' ? sp.marca.trim() : null, modelo: sp.modelo.trim(), ano: Number(sp.ano) || null }
        : null,
    leilao: typeof j.leilao === 'boolean' ? j.leilao : null,
    app: typeof j.app === 'boolean' ? j.app : null,
  }
}

export interface EntradaCerebro {
  nome: string | null
  genero: Genero
  fatos: Fatos | null
  jaGanhouDesconto: boolean
  /** DDD 21: so entao a Isa fala de adesivo (prompt.regras falaDeAdesivo). */
  falaDeAdesivo: boolean
  historico: MensagemHistorico[]
  agora: Date
  /** Comeco da conversa, primeiro contato do dia ou 4 h sem falar (precisaCumprimentar). */
  cumprimentar: boolean
  /** O que ele disse pagar hoje em outra protecao (venda.regras valorQuePagaHoje) — vira comparacao nos FATOS. */
  pagaHoje?: number | null
}

export async function pensar(e: EntradaCerebro): Promise<SaidaCerebro> {
  const nome = primeiroNome(e.nome)
  const aberturaDoCodigo = e.cumprimentar ? abertura(cumprimento(e.agora), nome) : null
  const comparacao = e.fatos && e.pagaHoje ? comparacaoComHoje(e.fatos, e.pagaHoje) : null
  const sistema = montarPrompt({
    cumprimento: cumprimento(e.agora),
    primeiroNome: nome,
    genero: e.genero,
    fatos: e.fatos,
    jaGanhouDesconto: e.jaGanhouDesconto,
    falaDeAdesivo: e.falaDeAdesivo,
    comparacaoHoje: comparacao?.linhas,
  })
  const base = e.fatos?.numerosPermitidos ?? PERMITIDOS_SEM_FATOS
  // O valor que ele paga hoje e as diferencas sao fatos calculados: a IA pode cita-los.
  const permitidos: Permitidos = { dinheiro: [...base.dinheiro, ...(comparacao?.dinheiro ?? (e.pagaHoje ? [e.pagaHoje] : []))], pct: base.pct }
  const conversa: MsgIA[] = [{ role: 'system', content: sistema }, ...paraMensagensIA(e.historico)]

  // O que o cliente mandou desde a ultima resposta da Isa.
  const iUltimaNossa = e.historico.map((m) => m.direction).lastIndexOf('outbound')
  const doCliente = e.historico.slice(iUltimaNossa + 1).filter((m) => m.direction === 'inbound').map((m) => m.content).join('\n')

  let bruto = await chamarIA(conversa)
  let saida: Omit<SaidaCerebro, 'reprovados'>
  try {
    saida = lerSaida(bruto, aberturaDoCodigo, nome)
  } catch (err) {
    if (!(err instanceof JsonInvalido)) throw err
    // JSON ilegivel de verdade: pede de novo uma vez; se repetir, resposta segura e o dono recebe a
    // pergunta pelo protocolo do "vou confirmar" — o cliente nunca fica sem resposta.
    console.warn('[isa] JSON ilegível, pedindo de novo:', bruto.slice(0, 160))
    conversa.push({ role: 'assistant', content: bruto })
    conversa.push({ role: 'user', content: '(instrução interna, não é o cliente) sua saída não era JSON válido. responda de novo SÓ com o JSON, numa linha, com \\n escapado dentro das strings.' })
    bruto = await chamarIA(conversa)
    try {
      saida = lerSaida(bruto, aberturaDoCodigo, nome)
    } catch {
      console.warn('[isa] JSON ilegível de novo — resposta segura')
      return {
        resposta: comporResposta(null, 'deixa eu confirmar aqui e já te retorno 🙏🏼', aberturaDoCodigo),
        gatilho: 'sem_informacao', genero: null, placa: null, semPlaca: null, leilao: null, app: null, reprovados: [],
      }
    }
  }

  // Resposta vazia SEM gatilho = a Isa ficaria calada sem ninguem saber (aconteceu no teste de
  // 10/09/2026: "Como está o processo?" ficou sem resposta e sem evento). Pede de novo uma vez;
  // vazia outra vez vira "sem_informacao": resposta segura e o dono e avisado.
  if (!saida.resposta && !saida.gatilho) {
    console.warn('[isa] resposta vazia sem gatilho — bruto:', bruto.slice(0, 400))
    conversa.push({ role: 'assistant', content: bruto })
    conversa.push({
      role: 'user',
      content: '(instrução interna, não é o cliente) sua "resposta" veio vazia. responda o cliente em "resposta". se a pergunta for vaga, pergunte de forma curta o que ele quer saber. mesmo formato JSON.',
    })
    bruto = await chamarIA(conversa)
    saida = lerSaida(bruto, aberturaDoCodigo, nome)
    if (!saida.resposta && !saida.gatilho) {
      console.warn('[isa] vazia de novo — bruto:', bruto.slice(0, 400))
      // Sem pergunta (um "oie"), "vou confirmar" nao faz sentido e nao gera alerta.
      if (!ehPergunta(doCliente)) {
        return { ...saida, resposta: comporResposta(null, 'me diz, como posso te ajudar? 🙏🏼', aberturaDoCodigo), gatilho: null, reprovados: [] }
      }
      return {
        ...saida,
        resposta: comporResposta(null, 'deixa eu confirmar aqui e já te retorno 🙏🏼', aberturaDoCodigo),
        gatilho: 'sem_informacao',
        reprovados: [],
      }
    }
  }

  // Ia repetir o que acabou de mandar (11/09/2026: "roubo, furto e PT nao pagam cota" 3x enquanto
  // o cliente perguntava o VALOR da cota). Refaz uma vez, respondendo a pergunta nova.
  const ultimaNossa = [...e.historico].reverse().find((m) => m.direction === 'outbound')?.content
  if (saida.resposta && ehRepeticao(saida.resposta, ultimaNossa)) {
    console.warn('[isa] resposta repetida — refazendo')
    conversa.push({ role: 'assistant', content: bruto })
    conversa.push({
      role: 'user',
      content: '(instrução interna, não é o cliente) você acabou de mandar essa mesma resposta. o cliente perguntou OUTRA coisa: responda exatamente o que ele perguntou agora (se for valor, dê o número dos FATOS), sem repetir. mesmo formato JSON.',
    })
    bruto = await chamarIA(conversa)
    saida = lerSaida(bruto, aberturaDoCodigo, nome)
  }

  // "Nao soube" so vale se ele perguntou e a Isa disse que vai confirmar (11/09/2026: um "oie"
  // virou "deixa eu confirmar aqui" e alerta a toa). Sem pergunta: refaz a resposta uma vez.
  if (saida.gatilho === 'sem_informacao' && !semInformacaoValido(doCliente, saida.resposta)) {
    if (!ehPergunta(doCliente)) {
      conversa.push({ role: 'assistant', content: bruto })
      conversa.push({
        role: 'user',
        content: '(instrução interna, não é o cliente) a última mensagem do cliente não é uma pergunta (é cumprimento ou confirmação). responda normalmente e curto, sem dizer que vai confirmar e sem gatilho. mesmo formato JSON.',
      })
      bruto = await chamarIA(conversa)
      saida = lerSaida(bruto, aberturaDoCodigo, nome)
    }
    if (saida.gatilho === 'sem_informacao' && !semInformacaoValido(doCliente, saida.resposta)) saida = { ...saida, gatilho: null }
  }

  // Trava de assunto no codigo: falou do que existe por tras da Isa → sai a resposta de fora do assunto.
  if (vazaInterno(saida.resposta)) {
    console.warn('[isa] resposta barrada (vazamento/fora do assunto):', saida.resposta.slice(0, 200))
    saida = { ...saida, resposta: comporResposta('fora_do_assunto', '', aberturaDoCodigo), gatilho: null }
  }

  let v = validarNumeros(saida.resposta, permitidos)
  if (v.ok) return { ...saida, reprovados: [] }

  const primeiraReprovacao = v.invalidos
  conversa.push({ role: 'assistant', content: JSON.stringify(saida) })
  conversa.push({
    role: 'user',
    content:
      `(instrução interna, não é o cliente) sua resposta tinha números que NÃO estão nos FATOS: ${v.invalidos.join(', ')}. ` +
      'reescreva a resposta usando só números dos FATOS. se não tiver o número, diga que vai confirmar e marque "gatilho": "sem_informacao". mesmo formato JSON.',
  })
  saida = lerSaida(await chamarIA(conversa), aberturaDoCodigo, nome)
  v = validarNumeros(saida.resposta, permitidos)
  if (v.ok) return { ...saida, reprovados: primeiraReprovacao }

  return { ...saida, resposta: '', gatilho: 'validador', reprovados: [...primeiraReprovacao, ...v.invalidos] }
}

/**
 * "Vou confirmar e ja te retorno" — o dono respondeu no WhatsApp e a Isa escreve pro cliente no
 * tom dela, SEM mudar fato nenhum. Numeros conferidos contra o gabarito + os que o dono escreveu.
 * Qualquer duvida devolve null e a resposta do dono vai como esta (dono.regras).
 */
export async function reescreverRespostaDoDono(p: { pergunta: string; respostaDoDono: string; genero: Genero; nome: string | null }): Promise<string | null> {
  const tratamento = p.genero === 'm' ? 'trate por "o senhor"' : p.genero === 'f' ? 'trate por "a senhora"' : 'escreva sem gênero ("você")'
  const sistema =
    'você é a Isa, atendente da 21Go Proteção Patrimonial Veicular, no WhatsApp. o cliente perguntou algo que você não sabia, você disse "vou confirmar e já te retorno", e o seu supervisor acabou de te passar a resposta. escreva a mensagem pro cliente.\n' +
    'regras: minúsculas, frases curtas, sem ponto final, no máximo 2 partes separadas por uma linha em branco, sem cumprimento, sem chamar pelo nome. comece com "consegui confirmar aqui 🙏🏼". ' +
    'NÃO mude nenhum fato, número, valor, prazo ou condição da resposta do supervisor; NÃO acrescente informação; NÃO explique o que ele não disse. ' +
    tratamento +
    '. termine com um próximo passo curto ligado à proteção (ex.: "quer que eu siga com a sua simulação?" ou "posso seguir com a ativação?").\n' +
    'responda SÓ com JSON: {"resposta": "..."}'
  const bruto = await chamarIA([
    { role: 'system', content: sistema },
    { role: 'user', content: `pergunta do cliente: "${p.pergunta}"\nresposta do supervisor: "${p.respostaDoDono}"` },
  ])
  const j = lerJsonTolerante(bruto) as { resposta?: unknown } | null
  if (!j) return null
  const texto = tirarFrasesDeRobo(tirarNomeRepetido(tirarCumprimento(typeof j.resposta === 'string' ? j.resposta : ''), primeiroNome(p.nome)))
  if (!texto || vazaInterno(texto)) return null
  const doDono = extrairNumeros(p.respostaDoDono)
  const v = validarNumeros(texto, { dinheiro: [...NUMEROS_FIXOS.dinheiro, ...doDono.dinheiro], pct: [...NUMEROS_FIXOS.pct, ...doDono.pct] })
  return v.ok ? texto : null
}
