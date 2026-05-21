/**
 * Limpa drafts orfaos (sem mdx_content — falharam no Writer pre-refactor).
 * Reabre os briefings deles pra serem reprocessados pelo daily.
 */
import { query, exec, closePool } from '../db/pg.js';

async function main(): Promise<void> {
  const drafts = await query<{ id: string; slug: string; briefing_id: string | null }>(
    `SELECT id, slug, briefing_id FROM seo.articles WHERE status IN ('draft','in_review') AND mdx_content IS NULL`,
  );
  console.log(`orfaos encontrados: ${drafts.length}`);
  for (const d of drafts) {
    await exec(`DELETE FROM seo.articles WHERE id = $1`, [d.id]);
    console.log(`  deletado: ${d.slug} (briefing ${d.briefing_id} liberado)`);
  }

  const free = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM seo.briefings b
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL`,
  );
  console.log(`briefings livres: ${free[0]?.n ?? 0}`);

  const byCategory = await query<{ category: string; n: number }>(
    `SELECT t.category, count(*)::int AS n
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL
     GROUP BY t.category`,
  );
  console.log('por categoria:', byCategory);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
