import type { FastifyInstance } from 'fastify';
import { credentialsSnapshot, config } from '../config.js';
import { redis } from '../lib/redis.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** Liveness — sempre 200 enquanto o processo estiver vivo. */
  app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));

  /** Readiness — verifica deps externas (redis ao menos). */
  app.get('/readyz', async (_req, reply) => {
    const redisOk = await redis
      .ping()
      .then(r => r === 'PONG')
      .catch(() => false);

    const ready = redisOk;
    return reply.code(ready ? 200 : 503).send({
      ready,
      redis: redisOk,
      ts: new Date().toISOString(),
    });
  });

  /** Diagnostico: quais credenciais estao configuradas (sem expor valores). */
  app.get('/diag', async () => ({
    service: 'seo-worker',
    env: config.NODE_ENV,
    company: config.COMPANY_ID,
    auto_publish: config.AUTO_PUBLISH_ENABLED,
    credentials: credentialsSnapshot(),
    ts: new Date().toISOString(),
  }));
}
