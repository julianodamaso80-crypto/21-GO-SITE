import { query, closePool } from '../db/pg.js';

async function main() {
  const arts = await query<{ slug: string; status: string; category: string }>(
    `SELECT slug, status, category FROM seo.articles
     WHERE updated_at >= now() - interval '30 minutes'
       AND status IN ('awaiting_pr_merge','published')
     ORDER BY updated_at DESC`,
  );
  console.log('=== ARTIGOS POS-INDEXACAO ===');
  console.log(JSON.stringify(arts, null, 2));

  const idx = await query<{ slug: string; channel: string; response_status: number; n: number }>(
    `SELECT a.slug, i.channel, i.response_status, count(*)::int as n
     FROM seo.indexing_log i
     JOIN seo.articles a ON a.id = i.article_id
     WHERE i.occurred_at >= now() - interval '30 minutes'
       AND a.updated_at >= now() - interval '30 minutes'
     GROUP BY a.slug, i.channel, i.response_status
     ORDER BY a.slug, i.channel`,
  );
  console.log('=== INDEXACAO POR ARTIGO+CANAL ===');
  console.log(JSON.stringify(idx, null, 2));

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
