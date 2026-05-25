import { query, closePool } from '../db/pg.js';

async function main() {
  const runs = await query<{ agent_id: string; n: number; ok: number; last: string }>(
    `SELECT agent_id, count(*)::int AS n,
            count(*) FILTER (WHERE status='success')::int AS ok,
            max(started_at)::timestamp(0)::text AS last
     FROM seo.agent_runs
     WHERE agent_id IN ('01-keyword-research','13-gsc-analyst','15-reporting')
     GROUP BY agent_id ORDER BY agent_id`,
  );
  console.log('=== AGENTES QUE USAM GSC ===');
  for (const r of runs) console.log(`  ${r.agent_id}: ${r.ok}/${r.n} runs, ult ${r.last}`);

  const km = await query<{ n: number }>(`SELECT count(*)::int AS n FROM seo.metrics_daily`);
  console.log(`\nseo.metrics_daily: ${km[0]?.n} linhas (snapshot diario GSC+GA4 do Agente 15)`);

  const kw = await query<{ source: string; n: number }>(
    `SELECT source, count(*)::int AS n FROM seo.keywords GROUP BY source ORDER BY n DESC`,
  );
  console.log(`\nKeywords por fonte:`);
  for (const r of kw) console.log(`  ${r.source}: ${r.n}`);

  const recs = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM seo.recommendations`,
  );
  console.log(`\nseo.recommendations: ${recs[0]?.n} (saida do Agente 13)`);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
