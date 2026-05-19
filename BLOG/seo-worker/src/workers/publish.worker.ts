/**
 * Worker: seo:publish
 * Agentes 09 (Publisher) -> 10 (Sitemap) -> 11 (GoogleIndexing) -> 12 (BingIndexNow).
 * Implementacao real entra na Fase 8.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';

const log = child('worker:publish');

export async function handlePublishJob(job: Job): Promise<{ stub: true }> {
  log.warn({ jobId: job.id, name: job.name, data: job.data }, 'STUB — Fase 8 ainda nao implementada');
  return { stub: true };
}
