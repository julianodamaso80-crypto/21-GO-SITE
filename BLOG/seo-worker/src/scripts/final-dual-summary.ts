import { query, closePool } from '../db/pg.js';

async function main() {
  const rows = await query<{ d: string; channel: string; n: number; ok: number }>(
    `SELECT
       CASE WHEN url LIKE '%21goconsultoraleticya%' THEN 'consultoraleticya' ELSE '21go.site' END as d,
       channel, count(*)::int as n,
       count(*) FILTER (WHERE response_status BETWEEN 200 AND 299)::int as ok
     FROM seo.indexing_log
     WHERE occurred_at >= now() - interval '3 hours'
     GROUP BY 1, channel
     ORDER BY 1, channel`,
  );
  console.log('=== INDEXACAO ULT 3H (catch-up + auto) ===');
  for (const r of rows) console.log(`  [${r.d.padEnd(20)}] ${r.channel.padEnd(16)} ${r.ok}/${r.n} OK`);

  const arts = await query<{ n: number }>(
    `SELECT count(*)::int as n FROM seo.articles WHERE status = 'published'`,
  );
  console.log('\nTotal artigos published:', arts[0]?.n);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
