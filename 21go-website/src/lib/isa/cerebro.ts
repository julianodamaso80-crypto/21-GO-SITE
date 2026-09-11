import 'server-only'
import { montarPrompt, comporResposta, abertura, tirarCumprimento, type Genero } from '@/lib/isa/prompt.regras'
import { validarNumeros, type Permitidos } from '@/lib/isa/validador.regras'
import { cumprimento } from '@/lib/isa/hora.regras'
import type { Fatos } from '@/lib/isa/fatos.regras'
import type { MensagemHistorico } from '@/lib/isa/banco'

/**
 * Pensa a resposta da Isa: prompt (persona + gabarito + fatos) → Gemini 2.5 Flash (OpenRouter)
 * → validador de numeros. Numero fora dos fatos: pede UMA reescrita dizendo quais; se errar de
 * novo, devolve gatilho "validador" e a Isa nao envia — pausa e o time assume.
 */

const MODELO = 'google/gemini-2.5-flash'

export type Gatilho = 'desconto' | 'robo' | 'hostil' | 'associado' | 'sem_informacao' | 'validador' | null

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

// Sem simulacao a Isa nao tem preco nenhum: so os valores fixos do gabarito.
const PERMITIDOS_SEM_FATOS: Permitidos = { dinheiro: [100, 19.9, 29.9, 22.9], pct: [6, 10, 15, 5, 100, 80] }

const GATILHOS = new Set(['desconto', 'robo', 'hostil', 'associado', 'sem_informacao'])

function primeiroNome(nome: string | null): string | null {
  const n = (nome || '').trim().split(/\s+/)[0]
  if (!n || n.length < 2) return null
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

type MsgIA = { role: 'system' | 'user' | 'assistant'; content: string }

function paraMensagensIA(historico: MensagemHistorico[]): MsgIA[] {
  const out: MsgIA[] = []
  for (const m of historico) {
    const texto = (m.content || '').trim()
    if (!texto) continue
    if (m.direction === 'inbound') out.push({ role: 'user', content: texto })
    else if (m.sender && m.sender !== 'isa') out.push({ role: 'assistant', content: `(mensagem da equipe, ${m.sender}): ${texto}` })
    else out.push({ role: 'assistant', content: texto })
  }
  return out
}

async function chamarIA(mensagens: MsgIA[]): Promise<string> {
  const chave = process.env.OPENROUTER_API_KEY
  if (!chave) throw new Error('OPENROUTER_API_KEY ausente')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.5,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}

function lerSaida(bruto: string, aberturaDoCodigo: string | null): Omit<SaidaCerebro, 'reprovados'> {
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const j = JSON.parse(limpo) as Record<string, unknown>
  const gat = typeof j.gatilho === 'string' && GATILHOS.has(j.gatilho) ? (j.gatilho as Gatilho) : null
  const gen = j.genero === 'm' || j.genero === 'f' ? j.genero : null
  const placa = typeof j.placa === 'string' ? j.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null
  const sp = j.sem_placa as { marca?: unknown; modelo?: unknown; ano?: unknown } | null | undefined
  const pronta = typeof j.pronta === 'string' ? j.pronta : null
  return {
    // Resposta pronta: a IA so aponta a chave; o texto do dono entra aqui, exato.
    // O cumprimento e do codigo (hora certa do Rio), nunca da IA.
    resposta: comporResposta(pronta, tirarCumprimento(typeof j.resposta === 'string' ? j.resposta : ''), aberturaDoCodigo),
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
  historico: MensagemHistorico[]
  agora: Date
  /** Comeco da conversa, primeiro contato do dia ou 4 h sem falar (precisaCumprimentar). */
  cumprimentar: boolean
}

export async function pensar(e: EntradaCerebro): Promise<SaidaCerebro> {
  const nome = primeiroNome(e.nome)
  const aberturaDoCodigo = e.cumprimentar ? abertura(cumprimento(e.agora), nome) : null
  const sistema = montarPrompt({
    cumprimento: cumprimento(e.agora),
    primeiroNome: nome,
    genero: e.genero,
    fatos: e.fatos,
    jaGanhouDesconto: e.jaGanhouDesconto,
  })
  const permitidos = e.fatos?.numerosPermitidos ?? PERMITIDOS_SEM_FATOS
  const conversa: MsgIA[] = [{ role: 'system', content: sistema }, ...paraMensagensIA(e.historico)]

  let bruto = await chamarIA(conversa)
  let saida = lerSaida(bruto, aberturaDoCodigo)

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
    saida = lerSaida(bruto, aberturaDoCodigo)
    if (!saida.resposta && !saida.gatilho) {
      console.warn('[isa] vazia de novo — bruto:', bruto.slice(0, 400))
      return {
        ...saida,
        resposta: comporResposta(null, 'deixa eu confirmar aqui e já te retorno 🙏🏼', aberturaDoCodigo),
        gatilho: 'sem_informacao',
        reprovados: [],
      }
    }
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
  saida = lerSaida(await chamarIA(conversa), aberturaDoCodigo)
  v = validarNumeros(saida.resposta, permitidos)
  if (v.ok) return { ...saida, reprovados: primeiraReprovacao }

  return { ...saida, resposta: '', gatilho: 'validador', reprovados: [...primeiraReprovacao, ...v.invalidos] }
}
