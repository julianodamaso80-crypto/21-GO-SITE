import { query, exec, closePool } from '../db/pg.js';

const SEEDS: Array<{ k: string; cat: 'carros' | 'motos' | 'frotas' }> = [
  // CARROS
  { k: 'protecao veicular para carro popular hatch barra', cat: 'carros' },
  { k: 'protecao veicular SUV familia compacta jacarepagua', cat: 'carros' },
  { k: 'protecao veicular pickup leve campo grande rj', cat: 'carros' },
  // MOTOS
  { k: 'protecao para moto scooter 150cc entregador rio', cat: 'motos' },
  { k: 'protecao moto big trail v-strom xre tenere rj', cat: 'motos' },
  { k: 'protecao moto custom shadow vulcan rio de janeiro', cat: 'motos' },
  // FROTAS
  { k: 'protecao frota empresa pequena 3 a 5 veiculos rj', cat: 'frotas' },
  { k: 'protecao frota motos delivery 99 ifood uber 2026', cat: 'frotas' },
  { k: 'gestao frota carros vans escola transporte privado', cat: 'frotas' },
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
