/**
 * Repository: seo.agent_runs — rastreabilidade de execucoes de agentes.
 */
import { supabase } from '../supabase.js';
import { child } from '../../lib/logger.js';

const log = child('db:agent_runs');

export interface AgentRunStart {
  agent_id: string;                 // '01-keyword-research'
  triggered_by: string;             // 'cron:weekly' | 'manual' | 'agent:09'
  input?: unknown;
}

export interface AgentRunFinish {
  status: 'success' | 'error' | 'timeout';
  output?: unknown;
  error?: string;
  llm_provider?: string;
  llm_model?: string;
  llm_input_tokens?: number;
  llm_output_tokens?: number;
  llm_cost_usd?: number;
}

/** Inicia run. Retorna id (uuid) para chamar finish() depois. */
export async function startRun(run: AgentRunStart): Promise<string> {
  const sb = supabase();
  const { data, error } = await sb
    .from('agent_runs')
    .insert({
      agent_id: run.agent_id,
      triggered_by: run.triggered_by,
      input: run.input ?? null,
      status: 'running',
    })
    .select('id')
    .single();

  if (error || !data) {
    log.error({ err: error?.message }, 'falha ao iniciar run');
    throw new Error(`agent_runs.insert falhou: ${error?.message}`);
  }
  return data.id as string;
}

export async function finishRun(id: string, finish: AgentRunFinish, startedAtMs: number): Promise<void> {
  const sb = supabase();
  const duration_ms = Date.now() - startedAtMs;
  const { error } = await sb
    .from('agent_runs')
    .update({
      status: finish.status,
      output: finish.output ?? null,
      error: finish.error ?? null,
      llm_provider: finish.llm_provider ?? null,
      llm_model: finish.llm_model ?? null,
      llm_input_tokens: finish.llm_input_tokens ?? null,
      llm_output_tokens: finish.llm_output_tokens ?? null,
      llm_cost_usd: finish.llm_cost_usd ?? null,
      finished_at: new Date().toISOString(),
      duration_ms,
    })
    .eq('id', id);

  if (error) {
    log.error({ id, err: error.message }, 'falha ao finalizar run');
  }
}

/**
 * Wrapper: roda fn dentro de um agent_run com inicio/fim automaticos.
 * Garante que mesmo em erro, o run e fechado com status correto.
 */
export async function withRun<T>(
  start: AgentRunStart,
  fn: (runId: string) => Promise<{ result: T; finish?: Partial<AgentRunFinish> }>,
): Promise<T> {
  const t0 = Date.now();
  const id = await startRun(start);
  try {
    const out = await fn(id);
    await finishRun(id, { status: 'success', ...(out.finish ?? {}), output: out.finish?.output ?? null }, t0);
    return out.result;
  } catch (e) {
    const err = e as Error;
    await finishRun(id, { status: 'error', error: err.message }, t0);
    throw e;
  }
}
