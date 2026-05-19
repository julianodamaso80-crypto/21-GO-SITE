/**
 * Wrapper Anthropic — usado por todos os agentes que precisam de LLM.
 *
 * - Modelo via env (ANTHROPIC_MODEL_MAIN, ANTHROPIC_MODEL_LIGHT). NUNCA hardcode.
 * - Calcula custo usando tabela de precos (atualizavel).
 * - Suporta prompt caching pra reduzir custo em system prompts grandes (persona, regras).
 * - Retry com backoff em erros 5xx / overloaded.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:anthropic');

/**
 * Precos (USD por 1M tokens). Atualizar quando Anthropic publicar novos.
 * Fonte: https://docs.anthropic.com/en/docs/about-claude/pricing
 * Valores conservadores — se modelo desconhecido, retorna null e nao loga custo.
 */
const PRICING: Record<string, { input: number; output: number; cache_write: number; cache_read: number }> = {
  // Sonnet 4.6 (em uso pelo projeto Leticya v2)
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.3 },
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cache_write: 1.25, cache_read: 0.1 },
  // Opus 4.7
  'claude-opus-4-7': { input: 15.0, output: 75.0, cache_write: 18.75, cache_read: 1.5 },
};

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  if (!config.ANTHROPIC_API_KEY) throw new Error('Pendente de credencial: ANTHROPIC_API_KEY');
  _client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 0 /* fazemos nosso retry */ });
  return _client;
}

export type AnthropicTier = 'main' | 'light';
function resolveModel(tier: AnthropicTier): string {
  const m = tier === 'main' ? config.ANTHROPIC_MODEL_MAIN : config.ANTHROPIC_MODEL_LIGHT;
  if (!m) throw new Error(`Pendente de credencial: ANTHROPIC_MODEL_${tier.toUpperCase()} nao configurado`);
  return m;
}

export interface CompleteOptions {
  tier?: AnthropicTier;                  // default: 'main'
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stop_sequences?: string[];
  retries?: number;                      // default: 3
  timeout_ms?: number;                   // default: 60000
}

export interface CompleteResult {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number | null;
  stop_reason: string | null;
  duration_ms: number;
}

export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const tier = opts.tier ?? 'main';
  const model = resolveModel(tier);
  const max_tokens = opts.max_tokens ?? 4096;
  const temperature = opts.temperature ?? 0.4;
  const retries = opts.retries ?? 3;
  const timeout_ms = opts.timeout_ms ?? 60000;

  const t0 = Date.now();
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await client().messages.create(
        {
          model,
          max_tokens,
          temperature,
          system: opts.system,
          messages: opts.messages,
          stop_sequences: opts.stop_sequences,
        },
        { timeout: timeout_ms },
      );

      const text = resp.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('');

      const u = resp.usage;
      const cache_creation = (u as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;
      const cache_read = (u as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
      const cost = computeCost(model, u.input_tokens, u.output_tokens, cache_creation, cache_read);

      const duration_ms = Date.now() - t0;
      log.info({ model, tier, attempt, in: u.input_tokens, out: u.output_tokens, cost, duration_ms }, 'complete ok');

      return {
        text,
        model,
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_creation_input_tokens: cache_creation,
        cache_read_input_tokens: cache_read,
        cost_usd: cost,
        stop_reason: resp.stop_reason,
        duration_ms,
      };
    } catch (e) {
      lastErr = e as Error;
      const status = (e as { status?: number }).status;
      log.warn({ attempt, status, err: lastErr.message }, 'complete falhou — vou tentar de novo');
      if (status && status < 500 && status !== 408 && status !== 429) break; // 4xx nao-retentavel
      if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`anthropic.complete falhou apos ${retries} tentativas: ${lastErr?.message}`);
}

function computeCost(
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_creation: number,
  cache_read: number,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (
    (input_tokens / 1_000_000) * p.input +
    (output_tokens / 1_000_000) * p.output +
    (cache_creation / 1_000_000) * p.cache_write +
    (cache_read / 1_000_000) * p.cache_read
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
