/**
 * Filas BullMQ — 5 filas dedicadas, uma por etapa.
 * Workers vivem em src/workers/*.worker.ts e consomem suas filas.
 */
import { Queue, QueueEvents } from 'bullmq';
import { redis } from './lib/redis.js';
import { child } from './lib/logger.js';

const log = child('queue');

const baseOpts = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 200, age: 7 * 24 * 3600 }, // mantem 200 ou 7 dias
    removeOnFail: { count: 1000, age: 30 * 24 * 3600 },   // mantem falhas 30 dias para debug
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
  },
};

export const queueResearch = new Queue('seo:research', baseOpts);     // Agente 01-04
export const queueWrite = new Queue('seo:write', baseOpts);           // Agente 05-08
export const queuePublish = new Queue('seo:publish', baseOpts);       // Agente 09-12
export const queueAnalyze = new Queue('seo:analyze', baseOpts);       // Agente 13-14
export const queueReporting = new Queue('seo:reporting', baseOpts);   // Agente 15

export const QUEUES = [queueResearch, queueWrite, queuePublish, queueAnalyze, queueReporting];

// QueueEvents — log basico de transicoes (sem flood)
for (const q of QUEUES) {
  const ev = new QueueEvents(q.name, { connection: redis });
  ev.on('completed', ({ jobId }) => log.debug({ queue: q.name, jobId }, 'job completed'));
  ev.on('failed', ({ jobId, failedReason }) => log.warn({ queue: q.name, jobId, reason: failedReason }, 'job failed'));
  ev.on('stalled', ({ jobId }) => log.warn({ queue: q.name, jobId }, 'job stalled'));
}

export async function closeQueues(): Promise<void> {
  await Promise.all(QUEUES.map(q => q.close()));
}
