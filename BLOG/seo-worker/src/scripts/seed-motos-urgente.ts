import { query, exec, closePool } from '../db/pg.js';

const SEEDS = [
  'protecao veicular moto naked 600cc 1000cc rj',
  'protecao moto turismo bmw r1250 ducati multistrada',
  'protecao para motoboy ifood barra tijuca jacarepagua',
];

async function main() {
  let inserted = 0;
  for (const s of SEEDS) {
    const exists = await query<{ id: string }>(
      `SELECT id FROM seo.keywords WHERE keyword_normalized=$1`,
      [s.toLowerCase()],
    );
    if (exists.length > 0) continue;
    await exec(
      `INSERT INTO seo.keywords (company_id, keyword, category, source, intent, status)
       VALUES ('company-21go', $1, 'motos', 'manual', 'commercial', 'pending')`,
      [s],
    );
    inserted++;
    console.log('inserida:', s);
  }
  console.log('total:', inserted);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
