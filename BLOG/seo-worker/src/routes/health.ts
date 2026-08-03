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

  /**
   * Saude da PRODUCAO de conteudo — nao do processo.
   *
   * A esteira passou 30 dias sem publicar nada com o /healthz respondendo 200 o tempo
   * todo: liveness do container nao diz nada sobre a esteira estar entregando. Este
   * endpoint responde 503 quando o blog para, entao da pra monitorar de fora sem
   * depender do WhatsApp (os chips caem sozinhos com frequencia).
   */
  app.get('/producao', async (_req, reply) => {
    try {
      const { queryOne } = await import('../db/pg.js');
      const row = await queryOne<{
        ultimo_artigo: string | null;
        ultimo_update: string | null;
        briefings_disponiveis: number;
        keywords_pendentes: number;
      }>(
        `SELECT
           (SELECT max(created_at) FROM seo.articles WHERE status <> 'archived') AS ultimo_artigo,
           (SELECT max(applied_at) FROM seo.recommendations WHERE status='applied') AS ultimo_update,
           (SELECT count(*)::int FROM seo.briefings b
              LEFT JOIN seo.articles a ON a.briefing_id = b.id WHERE a.id IS NULL) AS briefings_disponiveis,
           (SELECT count(*)::int FROM seo.keywords WHERE status='pending') AS keywords_pendentes`,
      );

      const marcos = [row?.ultimo_artigo, row?.ultimo_update]
        .filter((d): d is string => !!d)
        .map((d) => new Date(d).getTime());
      const ultimaAtividade = marcos.length ? Math.max(...marcos) : null;
      const horasParado = ultimaAtividade ? (Date.now() - ultimaAtividade) / 3_600_000 : null;

      // 48h = 2 ciclos diarios perdidos. Abaixo disso, fim de semana/atraso e normal.
      const saudavel = horasParado !== null && horasParado < 48;

      return reply.code(saudavel ? 200 : 503).send({
        saudavel,
        horas_sem_produzir: horasParado === null ? null : Number(horasParado.toFixed(1)),
        ultimo_artigo: row?.ultimo_artigo ?? null,
        ultimo_update: row?.ultimo_update ?? null,
        briefings_disponiveis: row?.briefings_disponiveis ?? 0,
        keywords_pendentes: row?.keywords_pendentes ?? 0,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      return reply.code(503).send({ saudavel: false, erro: (e as Error).message });
    }
  });
}
