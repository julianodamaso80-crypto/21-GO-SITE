/**
 * Catch-up: re-roda agentes 11 (Google) e 12 (Bing/IndexNow) pra TODOS os
 * artigos publicados, garantindo indexacao nos 2 dominios (21go.site +
 * 21goconsultoraleticya.site).
 *
 * Idempotente: pode rodar quantas vezes quiser.
 */
import { query, closePool } from '../db/pg.js';
import { agent11 } from '../agents/11-google-indexing.js';
import { agent12 } from '../agents/12-bing-indexnow.js';
import { logger } from '../lib/logger.js';

async function main() {
  const arts = await query<{ id: string; slug: string; url: string }>(
    `SELECT id, slug, url FROM seo.articles
     WHERE status='published'
     ORDER BY created_at ASC`,
  );
  logger.info({ count: arts.length }, 'artigos pra re-indexar nos 2 dominios');

  let processed = 0;
  for (const a of arts) {
    try {
      // Le o article completo (sem trazer mdx_content pra economizar memoria)
      const full = (await query(`SELECT * FROM seo.articles WHERE id=$1`, [a.id]))[0];
      if (!full) continue;
      const ctx = { triggered_by: 'manual:catchup-dual-domain', dry_run: false };
      // Bing/IndexNow primeiro (mais rapido)
      await agent12.run({ article: full as any }, ctx);
      await agent11.run({ article: full as any }, ctx);
      processed++;
      if (processed % 5 === 0) logger.info({ processed, total: arts.length }, 'progresso');
    } catch (e) {
      logger.error({ slug: a.slug, err: (e as Error).message }, 'falhou');
    }
  }

  logger.info({ processed, total: arts.length }, 'catch-up concluido');
  await closePool();
}

main().catch((e) => { logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'fatal'); process.exit(1); });
