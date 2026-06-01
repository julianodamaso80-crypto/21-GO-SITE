/**
 * Inicializa todos os consumidores de fila. Workers reais vivem em arquivos
 * irmaos (research.worker.ts etc) e sao plugados aqui.
 */
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { child } from '../lib/logger.js';
import { handleResearchJob } from './research.worker.js';
import { handleWriteJob } from './write.worker.js';
import { handlePublishJob } from './publish.worker.js';
import { handleAnalyzeJob } from './analyze.worker.js';
import { handleReportingJob } from './reporting.worker.js';

const log = child('workers');
const workers: Worker[] = [];

/**
 * lockDuration 5min + stalledInterval 1min:
 *
 * Writer (Agente 05) faz chamada LLM (Gemini Flash) que leva 30-90s.
 * Encadeamento Writer→Reviewer→OnPage→Repurpose→Publisher por artigo
 * pode passar de 3min. E o daily processa N artigos sequencial dentro
 * de UM job — total pode chegar a 15min facil.
 *
 * Defaults BullMQ (lockDuration=30s, stalledInterval=30s) matavam jobs
 * legitimos como "stalled" e o BullMQ retentava infinitamente.
 *
 * Decisao 2026-05-30: aumentar pra que job longo possa terminar.
 */
const baseOpts = {
  connection: redis,
  concurrency: 1, // 1 job por fila — sequencial pra evitar conflito de rate-limit/DB
  removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
  removeOnFail: { count: 1000, age: 30 * 24 * 3600 },
  lockDuration: 300_000,       // 5min — job renova lock a cada movimentacao
  stalledInterval: 60_000,     // 1min — BullMQ checa stalled a cada 1min (era 30s)
  maxStalledCount: 1,          // 1 stall = fail (era 1 default mas explicito)
};

export function startAllWorkers(): void {
  workers.push(
    new Worker('seo-research', handleResearchJob, baseOpts),
    new Worker('seo-write', handleWriteJob, baseOpts),
    new Worker('seo-publish', handlePublishJob, baseOpts),
    new Worker('seo-analyze', handleAnalyzeJob, baseOpts),
    new Worker('seo-reporting', handleReportingJob, baseOpts),
  );

  for (const w of workers) {
    w.on('completed', (job) => log.info({ queue: w.name, jobId: job.id, name: job.name }, 'job ok'));
    w.on('failed', (job, err) => log.error({ queue: w.name, jobId: job?.id, name: job?.name, err: err.message }, 'job fail'));
    w.on('error', (err) => log.error({ queue: w.name, err: err.message }, 'worker erro'));
  }

  log.info({ count: workers.length }, 'workers iniciados');
}

export async function stopAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
