import { query, exec, closePool } from '../db/pg.js';

const SEEDS = [
  'protecao veicular frota food truck delivery rj',
  'protecao frota uber black executivos zona sul',
  'protecao frota motos delivery aplicativo 99 ifood',
];

async function main() {
  let inserted = 0;
  for (const s of SEEDS) {
    const exists = await query<{ id: string }>(
      `SELECT id FROM seo.keywords WHERE keyword_normalized=$1`,
      [s.toLowerCase()],
    );
    if (exists.length > 0) { console.log('skip:', s); continue; }
    await exec(
      `INSERT INTO seo.keywords (company_id, keyword, category, source, intent, status)
       VALUES ('company-21go', $1, 'frotas', 'manual', 'commercial', 'pending')`,
      [s],
    );
    inserted++;
    console.log('inserida:', s);
  }
  console.log('total:', inserted);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
