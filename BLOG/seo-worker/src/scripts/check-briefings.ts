import { query, closePool } from '../db/pg.js';

async function main() {
  const free = await query<{ category: string; n: number }>(
    `SELECT t.category, count(*)::int AS n
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL
     GROUP BY t.category
     ORDER BY t.category`,
  );
  console.log('briefings livres por categoria:');
  console.log(JSON.stringify(free, null, 2));
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
