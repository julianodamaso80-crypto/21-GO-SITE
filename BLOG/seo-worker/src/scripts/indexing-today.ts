import { query, closePool } from '../db/pg.js';

async function main() {
  const arts = await query<{ slug: string; status: string }>(
    `SELECT slug, status FROM seo.articles
     WHERE created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo'
     ORDER BY created_at DESC`,
  );
  console.log('=== ARTIGOS DE HOJE ===');
  for (const a of arts) console.log(`  [${a.status}] ${a.slug}`);

  const idx = await query<{ slug: string; channel: string; response_status: number; n: number }>(
    `SELECT a.slug, i.channel, i.response_status, count(*)::int AS n
     FROM seo.indexing_log i
     JOIN seo.articles a ON a.id = i.article_id
     WHERE a.created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo'
     GROUP BY a.slug, i.channel, i.response_status
     ORDER BY a.slug, i.channel`,
  );
  console.log('\n=== INDEXACAO POR ARTIGO/CANAL ===');
  for (const r of idx) {
    const ok = r.response_status >= 200 && r.response_status < 300 ? 'OK' : 'FAIL';
    console.log(`  ${ok} ${r.response_status} ${r.channel.padEnd(16)} x${r.n}  ${r.slug}`);
  }

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
