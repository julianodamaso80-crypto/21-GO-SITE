/**
 * Aplica a migration 260 (clusters + funnel + data_sources + seeds + skill_invocations).
 * Idempotente: todos os ALTER/CREATE usam IF NOT EXISTS.
 */
import { promises as fs } from 'fs';
import { exec, closePool, query } from '../db/pg.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sqlPath = path.resolve(__dirname, '../../../../21go-website/supabase/migrations/260_seo_clusters_and_funnel.sql');
  let sql: string;
  try {
    sql = await fs.readFile(sqlPath, 'utf8');
  } catch {
    // Fallback: tenta path absoluto se rodando dentro do container
    sql = await fs.readFile('/app/migrations/260_seo_clusters_and_funnel.sql', 'utf8');
  }
  await exec(sql);

  const tables = await query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema='seo' ORDER BY t`,
  );
  console.log('tabelas em seo:', tables.map(x => x.t).join(', '));

  const clusters = await query<{ slug: string; title: string }>(
    `SELECT slug, title FROM seo.clusters ORDER BY slug`,
  );
  console.log('clusters seed:', clusters);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
