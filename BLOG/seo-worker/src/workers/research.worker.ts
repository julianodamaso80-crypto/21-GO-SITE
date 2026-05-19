/**
 * Worker: seo:research
 * Encadeia agentes 01 (KeywordResearch) -> 02 (SEOStrategist) -> 03 (AntiRepetition) -> 04 (Briefing).
 * Implementacao real entra na Fase 4. Por ora apenas registra o run.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';

const log = child('worker:research');

export async function handleResearchJob(job: Job): Promise<{ stub: true }> {
  log.warn({ jobId: job.id, name: job.name, data: job.data }, 'STUB — Fase 4 ainda nao implementada');
  // TODO Fase 4:
  //   const keywords = await agents['01-keyword-research'].run(job.data, ctx)
  //   for (const k of keywords) await agents['02-seo-strategist'].run(k, ctx)
  //   ... etc
  return { stub: true };
}
