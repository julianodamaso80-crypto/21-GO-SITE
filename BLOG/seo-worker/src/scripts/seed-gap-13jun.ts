import { query, exec, closePool } from '../db/pg.js';

const SEEDS: Array<{ k: string; cat: 'carros' | 'motos' | 'frotas' }> = [
  { k: 'protecao veicular para sedan compacto onix prisma cobalt rj', cat: 'carros' },
  { k: 'protecao veicular para SUV familiar trailblazer pajero rio', cat: 'carros' },
  { k: 'protecao moto adventure africa twin gs versys 1000 rj', cat: 'motos' },
  { k: 'protecao moto utilitaria nx 400 falcon xt 660 rio', cat: 'motos' },
  { k: 'protecao frota carros corporativos plano saude rj 2026', cat: 'frotas' },
  { k: 'protecao frota van escolar transporte criancas rio', cat: 'frotas' },
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
