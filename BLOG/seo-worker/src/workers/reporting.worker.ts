/**
 * Worker: seo-reporting
 * Agente 15 — snapshot diario GSC + GA4.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { agent15 } from '../agents/15-reporting.js';

const log = child('worker:reporting');

interface JobData {
  triggered_by?: string;
  days?: number;
  dry_run?: boolean;
}

interface WorkerResult {
  rows_gsc: number;
  rows_ga4: number;
  rows_events: number;
  errors: string[];
}

export async function handleReportingJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'cron:metrics';
  const dry_run = !!job.data.dry_run;
  const days = job.data.days ?? 7;
  const ctx = { triggered_by, dry_run };

  const r = await withRun(
    { agent_id: '15-reporting', triggered_by, input: { days } },
    async () => {
      const res = await agent15.run({ days }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  );

  const result: WorkerResult = {
    rows_gsc: r.output.rows_inserted.gsc,
    rows_ga4: r.output.rows_inserted.ga4,
    rows_events: r.output.rows_inserted.events,
    errors: r.output.errors,
  };
  log.info(result, 'reporting concluido');
  return result;
}
