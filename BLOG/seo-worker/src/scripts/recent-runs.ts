import { query, closePool } from '../db/pg.js';

async function main() {
  const r = await query<{ agent_id: string; status: string; t: string; duration_ms: number }>(
    `SELECT agent_id, status, started_at::timestamp(0)::text AS t, duration_ms
     FROM seo.agent_runs
     WHERE started_at >= now() - interval '40 minutes'
     ORDER BY started_at DESC
     LIMIT 30`,
  );
  for (const x of r) console.log(`${x.t}  ${x.agent_id.padEnd(22)} ${x.status} ${x.duration_ms ?? '?'}ms`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
