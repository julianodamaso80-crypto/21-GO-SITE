/**
 * Rotas de disparo manual de agentes/rotinas. TODAS exigem TRIGGER_SECRET.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { queueResearch, queueWrite, queuePublish, queueAnalyze, queueReporting } from '../queue.js';
import { child } from '../lib/logger.js';

const log = child('routes:runs');

function requireSecret(req: FastifyRequest): { ok: true } | { ok: false; reason: string } {
  if (!config.TRIGGER_SECRET) return { ok: false, reason: 'TRIGGER_SECRET nao configurado' };
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return { ok: false, reason: 'sem bearer' };
  const token = auth.slice('Bearer '.length).trim();
  if (token !== config.TRIGGER_SECRET) return { ok: false, reason: 'bearer invalido' };
  return { ok: true };
}

const RunBody = z.object({
  limit: z.number().int().positive().optional(),
  dry_run: z.boolean().optional(),
}).strict();

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/runs/weekly', async (req, reply) => {
    const auth = requireSecret(req);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    const body = RunBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const job = await queueResearch.add(
      'manual-weekly-research',
      { triggered_by: 'manual', limit: body.data.limit ?? config.WEEKLY_KEYWORD_LIMIT, dry_run: body.data.dry_run ?? false },
    );
    log.info({ jobId: job.id }, 'manual weekly disparado');
    return reply.code(202).send({ enqueued: 'seo:research', jobId: job.id });
  });

  app.post('/runs/daily', async (req, reply) => {
    const auth = requireSecret(req);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    const body = RunBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const job = await queueWrite.add(
      'manual-daily-write',
      { triggered_by: 'manual', limit: body.data.limit ?? config.DAILY_ARTICLE_LIMIT, dry_run: body.data.dry_run ?? false },
    );
    log.info({ jobId: job.id }, 'manual daily disparado');
    return reply.code(202).send({ enqueued: 'seo:write', jobId: job.id });
  });

  app.post('/runs/analyze', async (req, reply) => {
    const auth = requireSecret(req);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    const job = await queueAnalyze.add('manual-analyze', { triggered_by: 'manual' });
    log.info({ jobId: job.id }, 'manual analyze disparado');
    return reply.code(202).send({ enqueued: 'seo:analyze', jobId: job.id });
  });

  app.post('/runs/reporting', async (req, reply) => {
    const auth = requireSecret(req);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    const job = await queueReporting.add('manual-reporting', { triggered_by: 'manual' });
    log.info({ jobId: job.id }, 'manual reporting disparado');
    return reply.code(202).send({ enqueued: 'seo:reporting', jobId: job.id });
  });

  /** Publica/indexa um artigo especifico (manual). */
  const PublishBody = z.object({
    article_id: z.string().uuid(),
    skip_human_review: z.boolean().optional(),
  }).strict();

  app.post('/runs/publish', async (req, reply) => {
    const auth = requireSecret(req);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    const body = PublishBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    if (!config.AUTO_PUBLISH_ENABLED && !body.data.skip_human_review) {
      return reply.code(403).send({ error: 'AUTO_PUBLISH_ENABLED=false e skip_human_review=false' });
    }
    const job = await queuePublish.add('manual-publish', { ...body.data, triggered_by: 'manual' });
    log.info({ jobId: job.id, articleId: body.data.article_id }, 'manual publish disparado');
    return reply.code(202).send({ enqueued: 'seo:publish', jobId: job.id });
  });
}
