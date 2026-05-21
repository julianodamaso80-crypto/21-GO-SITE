/**
 * Re-roda Reviewer (06) em artigos REPROVADOS pelo guard antigo (>1700 palavras).
 * O guard novo (1100-2200) deve aprovar artigos de 1800-2000 palavras gerados pelo
 * Gemini Flash. Apos aprovar, encadeia OnPage (07) -> Repurpose (08) -> Publisher (09).
 */
import { query, exec, closePool } from '../db/pg.js';
import { getById } from '../db/repositories/articles.js';
import { agent06 } from '../agents/06-legal-reviewer.js';
import { agent07 } from '../agents/07-onpage-seo.js';
import { agent08 } from '../agents/08-design-repurpose.js';
import { queuePublish } from '../queue.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  const targets = await query<{ id: string; slug: string; review_status: string | null; word_count: number }>(
    `SELECT id, slug, review_status, word_count
     FROM seo.articles
     WHERE review_status='REPROVADO'
       AND mdx_content IS NOT NULL
       AND created_at >= now() - interval '24 hours'`,
  );
  logger.info({ count: targets.length }, 'artigos pra re-revisar');

  const ctx = { triggered_by: 'manual:rerun-reviewer', dry_run: false };

  for (const t of targets) {
    logger.info({ slug: t.slug, word_count: t.word_count }, 're-revisando');

    // Reset review_status
    await exec(`UPDATE seo.articles SET review_status=NULL, review_notes=NULL WHERE id=$1`, [t.id]);

    const article = await getById(t.id);
    if (!article) { logger.warn({ id: t.id }, 'article sumiu'); continue; }

    const r06 = await withRun(
      { agent_id: '06-legal-reviewer', triggered_by: 'manual:rerun', input: { article_id: article.id } },
      async () => {
        const res = await agent06.run({ article }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );

    if (r06.output.review_status === 'REPROVADO') {
      logger.warn({ slug: t.slug, notes: r06.output.review_notes }, 'reprovado de novo');
      continue;
    }

    logger.info({ slug: t.slug, decision: r06.output.review_status }, 'aprovado pelo reviewer');

    // OnPage
    await withRun(
      { agent_id: '07-onpage-seo', triggered_by: 'agent:06', input: { article_id: article.id } },
      async () => {
        const res = await agent07.run({ article }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );

    // Repurpose
    await withRun(
      { agent_id: '08-design-repurpose', triggered_by: 'agent:07', input: { article_id: article.id } },
      async () => {
        const res = await agent08.run({ article }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );

    // Publisher (auto)
    if (config.AUTO_PUBLISH_ENABLED) {
      const pubJob = await queuePublish.add('manual-publish', {
        article_id: article.id,
        skip_human_review: true,
        triggered_by: 'manual:rerun-publish',
      });
      logger.info({ slug: t.slug, pubJobId: pubJob.id }, 'publisher enfileirado');
    }
  }

  await closePool();
  logger.info('done');
}

main().catch((e) => { logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'fatal'); process.exit(1); });
