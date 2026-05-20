/**
 * Repository: seo.agent_runs — rastreabilidade de execucoes de agentes.
 * Usa pg direto (bypassa PostgREST que nao expoe schema 'seo').
 */
import { queryOne, exec } from '../pg.js';
import { child } from '../../lib/logger.js';

const log = child('db:agent_runs');

export interface AgentRunStart {
  agent_id: string;
  triggered_by: string;
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

export async function startRun(run: AgentRunStart): Promise<string> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO seo.agent_runs (agent_id, triggered_by, input, status)
       VALUES ($1, $2, $3::jsonb, 'running') RETURNING id`,
      [run.agent_id, run.triggered_by, run.input ? JSON.stringify(run.input) : null],
    );
    if (!row) throw new Error('insert nao retornou id');
    return row.id;
  } catch (e) {
    log.error({ err: (e as Error).message }, 'falha ao iniciar run');
    throw new Error(`agent_runs.insert falhou: ${(e as Error).message}`);
  }
}

export async function finishRun(id: string, finish: AgentRunFinish, startedAtMs: number): Promise<void> {
  const duration_ms = Date.now() - startedAtMs;
  try {
    await exec(
      `UPDATE seo.agent_runs SET
         status=$2, output=$3::jsonb, error=$4,
         llm_provider=$5, llm_model=$6,
         llm_input_tokens=$7, llm_output_tokens=$8, llm_cost_usd=$9,
         finished_at=now(), duration_ms=$10
       WHERE id=$1`,
      [
        id,
        finish.status,
        finish.output ? JSON.stringify(finish.output) : null,
        finish.error ?? null,
        finish.llm_provider ?? null,
        finish.llm_model ?? null,
        finish.llm_input_tokens ?? null,
        finish.llm_output_tokens ?? null,
        finish.llm_cost_usd ?? null,
        duration_ms,
      ],
    );
  } catch (e) {
    log.error({ id, err: (e as Error).message }, 'falha ao finalizar run');
  }
}

/**
 * Wrapper: roda fn dentro de um agent_run com inicio/fim automaticos.
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
