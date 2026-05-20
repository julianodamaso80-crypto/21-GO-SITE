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

const baseOpts = {
  connection: redis,
  concurrency: 1, // 1 job por fila — sequencial pra evitar conflito de rate-limit/DB
  removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
  removeOnFail: { count: 1000, age: 30 * 24 * 3600 },
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
