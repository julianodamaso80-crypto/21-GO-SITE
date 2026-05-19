/**
 * Worker: seo:analyze
 * 13 (GSCAnalyst) -> 14 (ContentUpdater)
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { agent13 } from '../agents/13-gsc-analyst.js';
import { agent14 } from '../agents/14-content-updater.js';

const log = child('worker:analyze');

interface JobData {
  triggered_by?: string;
  dry_run?: boolean;
  update_limit?: number;
}

interface WorkerResult {
  recommendations_created: number;
  updates_applied: number;
  total_cost_usd: number;
  errors: string[];
}

export async function handleAnalyzeJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'cron:analyze';
  const dry_run = !!job.data.dry_run;
  const update_limit = job.data.update_limit ?? 3;
  const ctx = { triggered_by, dry_run };
  const errors: string[] = [];
  let totalCost = 0;

  // 13 — GSC Analyst
  const r13 = await withRun(
    { agent_id: '13-gsc-analyst', triggered_by, input: { window_days: 28 } },
    async () => {
      const res = await agent13.run({ window_days: 28 }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  );

  // 14 — Content Updater
  const r14 = await withRun(
    { agent_id: '14-content-updater', triggered_by: 'agent:13', input: { limit: update_limit } },
    async () => {
      const res = await agent14.run({ limit: update_limit }, ctx);
      totalCost += res.output.total_cost_usd;
      return {
        result: res,
        finish: { output: res.output, llm_provider: 'anthropic', llm_cost_usd: res.output.total_cost_usd },
      };
    },
  );

  errors.push(...r13.output.errors, ...r14.output.errors);
  const result: WorkerResult = {
    recommendations_created: r13.output.recommendations_created,
    updates_applied: r14.output.applied,
    total_cost_usd: Number(totalCost.toFixed(6)),
    errors,
  };
  log.info(result, 'analyze concluido');
  return result;
}
