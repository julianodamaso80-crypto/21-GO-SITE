/**
 * Worker: seo:analyze
 * Agentes 13 (GSCAnalyst) -> 14 (ContentUpdater).
 * Implementacao real entra na Fase 9.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';

const log = child('worker:analyze');

export async function handleAnalyzeJob(job: Job): Promise<{ stub: true }> {
  log.warn({ jobId: job.id, name: job.name, data: job.data }, 'STUB — Fase 9 ainda nao implementada');
  return { stub: true };
}
