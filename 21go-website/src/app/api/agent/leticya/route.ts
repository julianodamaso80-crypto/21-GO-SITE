// @ts-nocheck — modulo Leticya v2 em shadow mode (nao dispara WhatsApp). Validacao TS desativada ate refactor da tipagem do AI SDK.
import { NextRequest, NextResponse } from 'next/server'
import { generateText, stepCountIs, hasToolCall } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { leticyaDb } from '@/lib/leticya/db'
import { leticyaTools } from '@/lib/leticya/tools'
import { supervisorCheck } from '@/lib/leticya/supervisor'
import { planHumanizedSend } from '@/lib/leticya/humanizer'
import { extractFacts, recallFacts } from '@/lib/leticya/memory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Leticya — agente Pré-Venda 21Go (Shadow Mode)
 *
 * Stack:
 *  - Vercel AI SDK 5 (generateText + tools + stopWhen + prepareStep)
 *  - OpenRouter (Claude Haiku/Sonnet/Opus em constelação)
 *  - 7 tools: classify, searchKnowledge, searchConversations, recallMemory,
 *    lookupFipe, getPlanPrice, escalateHuman
 *  - Persona, glossario SUSEP e knowledge: lidos em runtime de ai.agents
 *  - Logging completo em ai.agent_runs + ai.agent_actions
 *
 * IMPORTANTE: shadow mode. NÃO envia WhatsApp. Retorna JSON debug.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!

const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY })

interface LeticyaInput {
  message: string
  contact_id?: string | null
  conversation_id?: string | null
  contact_name?: string | null
  contact_phone?: string | null
}

interface AgentRow {
  id: string
  name: string
  display_name: string
  persona_description: string
  persona_version: string | null
  default_model: string
  supervisor_model: string | null
  classifier_model: string | null
  temperature: number
  max_tokens: number
  glossary_required: string[] | null
  glossary_forbidden: string[] | null
  greetings: string[] | null
  closings: string[] | null
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY ausente' }, { status: 500 })
  }

  let body: LeticyaInput
  try {
    body = (await req.json()) as LeticyaInput
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const userMessage = body.message?.trim()
  if (!userMessage) {
    return NextResponse.json({ error: 'message obrigatorio' }, { status: 400 })
  }

  const t0 = Date.now()
  const db = leticyaDb()

  // ─── 1. Carrega persona da Leticya do banco (ai.agents) ───
  const { data: agentRaw, error: agentErr } = await db
    .from('agents')
    .select(
      'id, name, display_name, persona_description, persona_version, default_model, supervisor_model, classifier_model, temperature, max_tokens, glossary_required, glossary_forbidden, greetings, closings',
    )
    .eq('id', 'pre-venda')
    .single()
  const agent = agentRaw as AgentRow | null
  if (agentErr || !agent) {
    return NextResponse.json(
      { error: 'agente nao encontrado', detail: agentErr?.message },
      { status: 500 },
    )
  }

  // ─── 2. Cria run (audit trail) — persona_version pra A/B test ───
  const { data: runRow } = await db
    .from('agent_runs')
    .insert({
      agent_id: 'pre-venda',
      persona_version: agent.persona_version ?? 'v2',
      conversation_id: body.conversation_id ?? null,
      contact_id: body.contact_id ?? null,
      generator_model: agent.default_model,
      classifier_model: agent.classifier_model,
      supervisor_model: agent.supervisor_model,
      status: 'PENDING',
      input_messages: [{ role: 'user', content: userMessage }],
      latency_ms: 0,
    })
    .select('id')
    .single()
  const runId = (runRow as { id: string } | null)?.id ?? null

  // ─── 3. Recall memória do contato (Mem0) — se houver contact_id ───
  let memorySnippet = ''
  let recalledFactsCount = 0
  if (body.contact_id) {
    try {
      const { facts } = await recallFacts(body.contact_id, 8)
      recalledFactsCount = facts.length
      if (facts.length > 0) {
        memorySnippet = '\n═══ O QUE VOCÊ JÁ SABE SOBRE ESSE CLIENTE ═══\n'
          + facts.map((f) => `- [${f.category}] ${f.fact}`).join('\n')
      }
    } catch {
      // memória opcional — falha silenciosa
    }
  }

  // ─── 4. Monta system prompt enriquecido ───
  const required = (agent.glossary_required ?? []).join(', ')
  const forbidden = (agent.glossary_forbidden ?? []).join(', ')

  const systemPrompt = [
    agent.persona_description,
    '',
    '═══ COMPLIANCE SUSEP (HARD CONSTRAINT — NEGOCIAVEL ZERO) ═══',
    `USAR sempre: ${required}`,
    `NUNCA usar: ${forbidden}`,
    '',
    '═══ TOOLS DISPONIVEIS — REGRAS DE USO ═══',
    '1. SEMPRE chamar `classify` PRIMEIRO em qualquer mensagem nova.',
    '2. Se tier=high OU needs_escalation=true => chamar `escalateHuman` e parar.',
    '3. Se cliente perguntou de plano/cobertura/empresa => `searchKnowledge`.',
    '4. Se cliente passou marca/modelo/ano => `lookupFipe`. SE FALHAR 2 VEZES seguidas com nomes diferentes, PARE de tentar — peça pro cliente passar a placa do veículo (deixa a placa puxar tudo automatico depois).',
    '5. Se precisa cota mensal => `getPlanPrice` (NUNCA invente).',
    '6. Em situacao parecida com casos passados, consulte `searchConversations` (memoria do vendedor).',
    '7. Se contact_id existir, considere chamar `recallMemory` no inicio.',
    '8. Apos chamar tools e ter dados suficientes (FIPE OU concluiu que precisa pedir mais info), GERE A RESPOSTA EM TEXTO e pare. Nao fique chamando tools indefinidamente.',
    '',
    '═══ FORMATO DE RESPOSTA (anti-robo) ═══',
    '- Maximo 3 bolhas curtas separadas por uma linha em branco',
    '- Cada bolha 1-3 linhas, max 280 caracteres',
    '- Sem bullets, sem markdown bold',
    '- Tom carioca informal-profissional',
    '- Emoji raramente, so se cliente usar primeiro',
    '- No primeiro contato se identifica como atendente VIRTUAL (LGPD)',
    '',
    body.contact_name ? `═══ CONTEXTO ═══\nNome do cliente: ${body.contact_name}` : '',
    body.contact_id ? `Contact ID: ${body.contact_id}` : '',
    memorySnippet,
  ]
    .filter(Boolean)
    .join('\n')

  // ─── 4. streamText com tools + constelação via prepareStep ───
  const toolCallsLog: Array<{ name: string; input: unknown; output: unknown; ms: number }> = []
  const stepLog: Array<{ step: number; model: string; finishReason?: string }> = []

  type ClassifierResult = { intent?: string; sentiment?: string; tier?: string; needs_escalation?: boolean }
  let classifierResult: ClassifierResult | null = null

  const result = await generateText({
    model: openrouter(agent.classifier_model || 'anthropic/claude-haiku-4.5'),
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    tools: leticyaTools,
    temperature: agent.temperature ?? 0.78,
    stopWhen: [stepCountIs(15), hasToolCall('escalateHuman')],
    prepareStep: async ({ stepNumber, steps }) => {
      // Step 0: Haiku barato pra classificar
      if (stepNumber === 0) {
        return {
          model: openrouter(agent.classifier_model || 'anthropic/claude-haiku-4.5'),
          activeTools: ['classify' as const],
          toolChoice: { type: 'tool' as const, toolName: 'classify' as const },
        }
      }

      // Captura classificação se foi feita
      if (!classifierResult && steps.length > 0) {
        const lastStep = steps[steps.length - 1]
        const cls = lastStep.toolResults?.find((t) => t.toolName === 'classify')
        if (cls?.output) {
          classifierResult = cls.output as unknown as ClassifierResult
        }
      }

      // Step 1+: roteia conforme tier
      const tier = classifierResult?.tier
      if (tier === 'high' || classifierResult?.needs_escalation) {
        return {
          model: openrouter(agent.supervisor_model || 'anthropic/claude-opus-4.7'),
        }
      }
      if (tier === 'mid') {
        return {
          model: openrouter(agent.default_model || 'anthropic/claude-sonnet-4.6'),
        }
      }
      // tier=low → mantém Haiku (default)
      return {}
    },
    onStepFinish: async ({ text, toolCalls, toolResults, finishReason, response }) => {
      const stepIdx = stepLog.length
      stepLog.push({
        step: stepIdx,
        model: response.modelId ?? 'unknown',
        finishReason,
      })
      if (toolCalls && toolResults) {
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i]
          const tr = toolResults[i]
          toolCallsLog.push({
            name: tc.toolName,
            input: tc.input,
            output: tr?.output ?? null,
            ms: 0,
          })
          // Persiste em ai.agent_actions
          if (runId) {
            await db
              .from('agent_actions')
              .insert({
                run_id: runId,
                step: stepIdx,
                tool_name: tc.toolName,
                input: tc.input as object,
                output: (tr?.output ?? null) as object,
                status: 'SUCCESS',
              })
              .then(
                () => {},
                () => {},
              )
          }
        }
      }
    },
  })

  const draftText = result.text?.trim() || ''

  // ─── 4.5. Supervisor de output (compliance SUSEP) ───
  const supervisor = await supervisorCheck(draftText, OPENROUTER_API_KEY)
  const finalText = supervisor.ok ? draftText : supervisor.rewritten ?? draftText

  // ─── 4.6. Humanizer: chunking em bolhas + delays simulados ───
  const humanized = planHumanizedSend(finalText)

  const latencyMs = Date.now() - t0

  // ─── 5. Atualiza run com resultado ───
  const usage = result.usage
  if (runId) {
    await db
      .from('agent_runs')
      .update({
        status: supervisor.ok ? 'SUCCESS' : 'BLOCKED_BY_SUPERVISOR',
        classified_intent: (classifierResult as ClassifierResult | null)?.intent ?? null,
        classified_sentiment: (classifierResult as ClassifierResult | null)?.sentiment ?? null,
        classified_urgency: (classifierResult as ClassifierResult | null)?.tier ?? null,
        total_tokens_input: usage?.inputTokens ?? 0,
        total_tokens_output: usage?.outputTokens ?? 0,
        latency_ms: latencyMs,
        output_message: finalText,
        supervisor_verdict: supervisor.ok ? 'APROVADO' : 'BLOQUEADO_REESCRITO',
        supervisor_reason: supervisor.reason,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }

  // ─── 6. Extrai fatos da conversa em background (Mem0) ───
  // Não bloqueia resposta — fire-and-forget
  let factsExtracted: { inserted: number; preview: string[] } | null = null
  if (body.contact_id && supervisor.ok) {
    try {
      const r = await extractFacts(
        { user_message: userMessage, agent_response: finalText },
        body.contact_id,
        OPENROUTER_API_KEY,
        runId,
      )
      factsExtracted = {
        inserted: r.inserted,
        preview: r.facts.map((f) => `[${f.category}] ${f.fact}`),
      }
    } catch {
      // memória opcional
    }
  }

  // ─── 7. Resposta JSON rica (shadow mode) ───
  return NextResponse.json({
    success: true,
    shadow_mode: true,
    agent: agent.name,
    persona_version: agent.persona_version ?? 'v2',
    run_id: runId,
    classification: classifierResult,
    steps: stepLog,
    tool_calls: toolCallsLog,
    input: userMessage,
    memory_recalled_facts: recalledFactsCount,
    draft_response: draftText,
    supervisor: {
      ok: supervisor.ok,
      reason: supervisor.reason,
      matched_term: supervisor.matched_term ?? null,
      judge_explanation: supervisor.judge_explanation ?? null,
      latency_ms: supervisor.latency_ms,
      was_rewritten: !supervisor.ok,
    },
    final_response: finalText,
    bubbles: humanized.bubbles,
    initial_delay_ms: humanized.initial_delay_ms,
    estimated_total_send_ms: humanized.total_ms,
    facts_extracted: factsExtracted,
    usage: {
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
    },
    latency_ms: latencyMs,
  })
}
