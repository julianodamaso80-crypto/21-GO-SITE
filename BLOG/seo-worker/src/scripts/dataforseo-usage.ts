import { query, closePool } from '../db/pg.js';

async function main() {
  const all = await query<{ n: number; cost: number; cached: number; first: string; last: string }>(
    `SELECT count(*)::int AS n, COALESCE(sum(cost_usd),0)::float AS cost,
            count(*) FILTER (WHERE cached=true)::int AS cached,
            min(called_at)::timestamp(0)::text AS first,
            max(called_at)::timestamp(0)::text AS last
     FROM seo.dataforseo_calls`,
  );
  console.log('=== DATAFORSEO USO TOTAL ===');
  console.log(JSON.stringify(all[0], null, 2));

  const byDay = await query<{ d: string; n: number; cost: number; cached: number }>(
    `SELECT date_trunc('day', called_at)::date::text AS d,
            count(*)::int AS n, sum(cost_usd)::float AS cost,
            count(*) FILTER (WHERE cached=true)::int AS cached
     FROM seo.dataforseo_calls
     GROUP BY 1 ORDER BY 1 DESC LIMIT 10`,
  );
  console.log('\n=== POR DIA ===');
  for (const r of byDay) console.log(`  ${r.d}: ${r.n} chamadas, USD ${r.cost.toFixed(4)}, cached=${r.cached}`);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
