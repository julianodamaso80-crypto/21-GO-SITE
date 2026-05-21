/**
 * Snapshot do que cada ferramenta/integracao fez nas ultimas 24h.
 */
import { query, closePool } from '../db/pg.js';
import { credentialsSnapshot } from '../config.js';

async function main() {
  console.log('=== CREDENCIAIS CONFIGURADAS ===');
  console.log(JSON.stringify(credentialsSnapshot(), null, 2));

  console.log('\n=== INDEXACAO ULT 24h (por canal) ===');
  const byChannel = await query<{ channel: string; n: number; ok: number; fail: number }>(
    `SELECT channel,
            count(*)::int AS n,
            count(*) FILTER (WHERE response_status BETWEEN 200 AND 299)::int AS ok,
            count(*) FILTER (WHERE response_status >= 400)::int AS fail
     FROM seo.indexing_log
     WHERE occurred_at >= now() - interval '24 hours'
     GROUP BY channel
     ORDER BY channel`,
  );
  console.log(JSON.stringify(byChannel, null, 2));

  console.log('\n=== DATAFORSEO ULT 7d ===');
  const dfs = await query<{ n: number; cost: number; cached: number }>(
    `SELECT count(*)::int AS n,
            COALESCE(sum(cost_usd),0)::float AS cost,
            count(*) FILTER (WHERE cached=true)::int AS cached
     FROM seo.dataforseo_calls
     WHERE called_at >= now() - interval '7 days'`,
  );
  console.log(JSON.stringify(dfs, null, 2));

  console.log('\n=== AGENT RUNS ULT 24h (por agente) ===');
  const runs = await query<{ agent_id: string; n: number; ok: number; err: number; cost: number }>(
    `SELECT agent_id,
            count(*)::int AS n,
            count(*) FILTER (WHERE status='success')::int AS ok,
            count(*) FILTER (WHERE status='error')::int AS err,
            COALESCE(sum(llm_cost_usd),0)::float AS cost
     FROM seo.agent_runs
     WHERE started_at >= now() - interval '24 hours'
     GROUP BY agent_id
     ORDER BY agent_id`,
  );
  console.log(JSON.stringify(runs, null, 2));

  console.log('\n=== ARTIGOS ULT 24h (por categoria/status) ===');
  const arts = await query<{ category: string; status: string; n: number }>(
    `SELECT category, status, count(*)::int AS n
     FROM seo.articles
     WHERE created_at >= now() - interval '24 hours'
     GROUP BY category, status
     ORDER BY category, status`,
  );
  console.log(JSON.stringify(arts, null, 2));

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
