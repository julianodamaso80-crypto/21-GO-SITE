/**
 * Aplica enforceWriterRules nos artigos REPROVADOS, atualiza mdx_content + word_count,
 * limpa review_status, dispara Reviewer -> OnPage -> Repurpose -> Publisher.
 */
import { query, exec, closePool } from '../db/pg.js';
import { getById } from '../db/repositories/articles.js';
import { enforceWriterRules } from '../lib/enforce-writer-rules.js';
import { agent06 } from '../agents/06-legal-reviewer.js';
import { agent07 } from '../agents/07-onpage-seo.js';
import { agent08 } from '../agents/08-design-repurpose.js';
import { queuePublish } from '../queue.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  const targets = await query<{ id: string; slug: string; word_count: number }>(
    `SELECT id, slug, word_count FROM seo.articles
     WHERE review_status='REPROVADO' AND mdx_content IS NOT NULL
     AND created_at >= now() - interval '24 hours'`,
  );
  logger.info({ count: targets.length }, 'artigos pra corrigir');

  const ctx = { triggered_by: 'manual:fix-reproved', dry_run: false };

  for (const t of targets) {
    const article = await getById(t.id);
    if (!article || !article.mdx_content) continue;

    const enforced = enforceWriterRules(article.mdx_content);
    logger.info({ slug: t.slug, changes: enforced.changes }, 'enforce aplicado');

    const bodyOnly = enforced.mdx.replace(/^---[\s\S]+?---\n+/m, '');
    const newWordCount = bodyOnly.split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(newWordCount / 220));

    await exec(
      `UPDATE seo.articles
       SET mdx_content=$2, word_count=$3, read_time_min=$4,
           review_status=NULL, review_notes=NULL, status='draft'
       WHERE id=$1`,
      [t.id, enforced.mdx, newWordCount, readTime],
    );

    const fresh = await getById(t.id);
    if (!fresh) continue;

    // Reviewer
    const r06 = await withRun(
      { agent_id: '06-legal-reviewer', triggered_by: 'manual:fix', input: { article_id: fresh.id } },
      async () => {
        const res = await agent06.run({ article: fresh }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );

    if (r06.output.review_status === 'REPROVADO') {
      logger.warn({ slug: t.slug, notes: r06.output.review_notes }, 'AINDA reprovado apos enforce');
      continue;
    }
    logger.info({ slug: t.slug, decision: r06.output.review_status }, 'reviewer OK');

    // OnPage + Repurpose
    await withRun(
      { agent_id: '07-onpage-seo', triggered_by: 'agent:06', input: { article_id: fresh.id } },
      async () => {
        const res = await agent07.run({ article: fresh }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );
    await withRun(
      { agent_id: '08-design-repurpose', triggered_by: 'agent:07', input: { article_id: fresh.id } },
      async () => {
        const res = await agent08.run({ article: fresh }, ctx);
        return { result: res, finish: { output: res.output } };
      },
    );

    // Publisher (auto)
    if (config.AUTO_PUBLISH_ENABLED) {
      const pubJob = await queuePublish.add('manual-publish', {
        article_id: fresh.id,
        skip_human_review: true,
        triggered_by: 'manual:fix-publish',
      });
      logger.info({ slug: t.slug, pubJobId: pubJob.id }, 'publisher enfileirado');
    }
  }

  await closePool();
}

main().catch((e) => { logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'fatal'); process.exit(1); });
