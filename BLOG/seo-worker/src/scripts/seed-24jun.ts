import { query, exec, closePool } from '../db/pg.js';

const SEEDS: Array<{ k: string; cat: 'carros' | 'motos' | 'frotas' }> = [
  { k: 'protecao veicular para pickup hilux ranger amarok rio de janeiro', cat: 'carros' },
  { k: 'protecao veicular para SUV tucson kicks creta rj 2026', cat: 'carros' },
  { k: 'protecao para moto custom harley fat boy iron rj', cat: 'motos' },
  { k: 'protecao moto trail xre 300 lander himalayan rio', cat: 'motos' },
  { k: 'protecao frota carros executivos uber black 99 rio', cat: 'frotas' },
  { k: 'protecao frota startup tech aplicativo entregas rj', cat: 'frotas' },
];

async function main() {
  let inserted = 0;
  for (const { k, cat } of SEEDS) {
    const exists = await query<{ id: string }>(
      `SELECT id FROM seo.keywords WHERE keyword_normalized=$1`,
      [k.toLowerCase()],
    );
    if (exists.length > 0) { console.log('skip:', k); continue; }
    await exec(
      `INSERT INTO seo.keywords (company_id, keyword, category, source, intent, status)
       VALUES ('company-21go', $1, $2, 'manual', 'commercial', 'pending')`,
      [k, cat],
    );
    inserted++;
    console.log('inserida:', cat, '-', k);
  }
  console.log('total:', inserted);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
