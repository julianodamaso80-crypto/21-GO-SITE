import { query, closePool } from '../db/pg.js';

async function main() {
  const arts = await query<{ slug: string; status: string; category: string; url: string; pr_url: string }>(
    `SELECT slug, status, category, url, pr_url FROM seo.articles
     WHERE updated_at >= now() - interval '15 minutes'
       AND status IN ('awaiting_pr_merge','published')
     ORDER BY updated_at DESC`,
  );
  console.log(JSON.stringify(arts, null, 2));
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
