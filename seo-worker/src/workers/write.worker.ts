/**
 * Worker: seo:write
 * Encadeia agentes 05 (Writer) -> 06 (LegalReviewer) -> 07 (OnPageSEO) -> 08 (Repurpose).
 * Implementacao real entra na Fase 5.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';

const log = child('worker:write');

export async function handleWriteJob(job: Job): Promise<{ stub: true }> {
  log.warn({ jobId: job.id, name: job.name, data: job.data }, 'STUB — Fase 5 ainda nao implementada');
  return { stub: true };
}
