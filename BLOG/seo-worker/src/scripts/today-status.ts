import { query, closePool } from '../db/pg.js';

async function main() {
  // Hoje (no fuso de SP)
  const arts = await query<{ slug: string; category: string; status: string; review_status: string | null; word_count: number; url: string }>(
    `SELECT slug, category, status, review_status, word_count, url
     FROM seo.articles
     WHERE created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo'
     ORDER BY created_at DESC`,
  );
  console.log('=== ARTIGOS DE HOJE (TZ SP) ===');
  console.log(JSON.stringify(arts, null, 2));

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
