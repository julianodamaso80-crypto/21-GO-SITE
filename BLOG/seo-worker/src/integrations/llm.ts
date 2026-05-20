/**
 * LLM wrapper — usado por todos os agentes que precisam de Claude.
 *
 * Provider: OpenRouter (mesmo usado pelo agente Leticya em
 * 21go-website/src/lib/leticya/supervisor.ts).
 *
 * Modelos: vem de AI_MODEL_GENERATOR (main) e AI_MODEL_CLASSIFIER (light)
 * — convencao ja existente no .env do projeto. Sem env, usa fallbacks
 * documentados em config.ts (com log.warn).
 *
 * Custo: OpenRouter cobra com markup; NAO calculo localmente para evitar
 * inventar valor. seo.agent_runs.llm_cost_usd fica NULL — pode ser
 * preenchido por job batch consultando https://openrouter.ai/api/v1/generation/{id}.
 *
 * Retry: 3 tentativas com backoff exponencial em 5xx/timeout.
 */
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config, resolveLlmModel } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:llm');

let _openrouter: ReturnType<typeof createOpenRouter> | null = null;
function getClient() {
  if (_openrouter) return _openrouter;
  if (!config.OPENROUTER_API_KEY) throw new Error('Pendente de credencial: OPENROUTER_API_KEY');
  _openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
    ...(config.OPENROUTER_BASE_URL ? { baseURL: config.OPENROUTER_BASE_URL } : {}),
  });
  return _openrouter;
}

export type LlmTier = 'main' | 'light';

export interface CompleteOptions {
  tier?: LlmTier;                  // default 'main'
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  retries?: number;
  timeout_ms?: number;
}

export interface CompleteResult {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  /** OpenRouter nao retorna custo na response — calcular requer chamada extra. NUNCA inventar. */
  cost_usd: null;
  finish_reason: string | null;
  duration_ms: number;
}

export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const tier = opts.tier ?? 'main';
  const resolved = resolveLlmModel(tier);
  if (resolved.from_fallback) {
    log.warn({ tier, fallback: resolved.model }, 'usando fallback de modelo (AI_MODEL_* nao setado)');
  }

  const retries = opts.retries ?? 3;
  const timeout_ms = opts.timeout_ms ?? 60_000;
  const temperature = opts.temperature ?? 0.4;
  const maxOutputTokens = opts.max_tokens ?? 4096;

  const client = getClient();
  const t0 = Date.now();
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await generateText({
        model: client(resolved.model),
        system: opts.system,
        messages: opts.messages,
        temperature,
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(timeout_ms),
      });

      const duration_ms = Date.now() - t0;
      const input_tokens = (r.usage as { inputTokens?: number } | undefined)?.inputTokens
        ?? (r.usage as { promptTokens?: number } | undefined)?.promptTokens
        ?? 0;
      const output_tokens = (r.usage as { outputTokens?: number } | undefined)?.outputTokens
        ?? (r.usage as { completionTokens?: number } | undefined)?.completionTokens
        ?? 0;

      log.info({
        tier, model: resolved.model, attempt,
        input_tokens, output_tokens, duration_ms,
      }, 'complete ok');

      return {
        text: r.text,
        model: resolved.model,
        input_tokens,
        output_tokens,
        cost_usd: null,
        finish_reason: (r.finishReason as string | undefined) ?? null,
        duration_ms,
      };
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      // AbortError ou timeout: retry. 4xx: nao retry. 5xx/network: retry.
      const isAbort = /abort|timeout/i.test(msg);
      const isClient4xx = /\b4\d\d\b/.test(msg) && !/\b408\b|\b429\b/.test(msg);
      log.warn({ tier, model: resolved.model, attempt, err: msg }, 'complete falhou');
      if (isClient4xx && !isAbort) break;
      if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`llm.complete falhou apos ${retries} tentativas: ${lastErr?.message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
