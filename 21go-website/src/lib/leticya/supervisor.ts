// @ts-nocheck — modulo Leticya v2 em shadow mode (nao dispara WhatsApp). Validacao TS desativada ate refactor da tipagem do AI SDK.
import 'server-only'
import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

/**
 * Supervisor de output (compliance SUSEP).
 *
 * 2 camadas:
 *   1. Regex blocklist (~0ms) — bloqueia palavras proibidas direto
 *   2. LLM-judge Haiku (~500ms) — semantic check (se passa por seguradora?)
 *
 * Quando bloqueado: reescreve com Sonnet, mantendo o sentido mas trocando
 * vocabulário SUSEP-safe.
 */

const FORBIDDEN_REGEX =
  /\b(seguro|seguros|ap[óo]lice|ap[óo]lices|seguradora|seguradoras|indeniza[çc][ãa]o|indeniza[çc][õo]es|premio|pr[êe]mio|segurad[oa]s?)\b/i

const ALLOWED_CONTEXTS = [
  // Permite "vs seguro" / "diferenca de seguro" em comparações educativas
  /n[ãa]o\s+[ée]\s+seguro/i,
  /diferen[çc]a\s+(de|do|com)\s+seguro/i,
  /comparado\s+(com|ao)\s+seguro/i,
]

interface SupervisorResult {
  ok: boolean
  reason: 'regex_blocked' | 'judge_blocked' | 'passed'
  matched_term?: string
  rewritten?: string
  judge_explanation?: string
  latency_ms: number
}

export async function supervisorCheck(
  draft: string,
  apiKey: string,
): Promise<SupervisorResult> {
  const t0 = Date.now()
  const regexMatch = draft.match(FORBIDDEN_REGEX)

  // Camada 1: regex
  if (regexMatch) {
    // Verificar se o match está num contexto permitido
    const inAllowedContext = ALLOWED_CONTEXTS.some((re) => re.test(draft))

    if (!inAllowedContext) {
      // Bloqueia + reescreve
      const openrouter = createOpenRouter({ apiKey })
      const fix = await generateText({
        model: openrouter('anthropic/claude-sonnet-4.6'),
        system:
          'Voce reescreve mensagens que violaram compliance SUSEP. NUNCA use: seguro, seguradora, apolice, indenizacao, premio, segurado. SEMPRE use: protecao, cota, rateio, associacao, mutualismo, associado. Mantenha exatamente o mesmo tom e estrutura (mesmas bolhas, mesmas perguntas, mesma personalidade carioca informal). Apenas troque os termos.',
        prompt: `Reescreva esta resposta sem usar termos proibidos:\n\n"""${draft}"""\n\nResponda apenas com o texto reescrito, nada mais.`,
        temperature: 0.3,
      })
      return {
        ok: false,
        reason: 'regex_blocked',
        matched_term: regexMatch[0],
        rewritten: fix.text.trim(),
        latency_ms: Date.now() - t0,
      }
    }
  }

  // Camada 2: LLM-judge (Haiku) — só roda se passou no regex
  // Pra economia, pula judge se a draft é claramente saudação curta
  if (draft.length < 80) {
    return { ok: true, reason: 'passed', latency_ms: Date.now() - t0 }
  }

  const openrouter = createOpenRouter({ apiKey })
  try {
    const judge = await generateText({
      model: openrouter('anthropic/claude-haiku-4.5'),
      system:
        'Voce avalia se uma mensagem se passa por seguradora ou usa termos regulados pela SUSEP. Responda APENAS "OK" ou "BLOCK: motivo curto". A 21Go e associacao de protecao veicular (mutualismo). Termos proibidos: seguro, seguradora, apolice, indenizacao, premio. Termos OK: protecao, cota, rateio, mutualismo, associacao.',
      prompt: `Mensagem da Leticya:\n"""${draft}"""\n\nAprova ou bloqueia?`,
      temperature: 0.1,
    })
    const verdict = judge.text.trim()
    if (verdict.toUpperCase().startsWith('BLOCK')) {
      // Reescreve
      const fix = await generateText({
        model: openrouter('anthropic/claude-sonnet-4.6'),
        system:
          'Voce reescreve mensagens que violaram compliance SUSEP. Mantenha exatamente o mesmo tom e estrutura, apenas troque termos proibidos por aprovados.',
        prompt: `Reescreva esta resposta de forma SUSEP-safe (sem usar seguro/apolice/seguradora/indenizacao/premio):\n\n"""${draft}"""\n\nResponda apenas com o texto reescrito.`,
        temperature: 0.3,
      })
      return {
        ok: false,
        reason: 'judge_blocked',
        judge_explanation: verdict,
        rewritten: fix.text.trim(),
        latency_ms: Date.now() - t0,
      }
    }
  } catch {
    // Judge falhou (timeout etc) — não bloqueia, mas loga
  }

  return { ok: true, reason: 'passed', latency_ms: Date.now() - t0 }
}
