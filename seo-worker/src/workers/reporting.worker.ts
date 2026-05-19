/**
 * Worker: seo:reporting
 * Agente 15 (Reporting) — snapshot diario de GSC + GA4 -> seo.metrics_daily.
 * Implementacao real entra na Fase 9.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';

const log = child('worker:reporting');

export async function handleReportingJob(job: Job): Promise<{ stub: true }> {
  log.warn({ jobId: job.id, name: job.name, data: job.data }, 'STUB — Fase 9 ainda nao implementada');
  return { stub: true };
}
