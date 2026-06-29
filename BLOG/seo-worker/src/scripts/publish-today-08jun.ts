import { query, closePool } from '../db/pg.js';

const SLUGS = [
  'protecao-veicular-para-carro-hatch-economia-e-seguranca',
  'protecao-para-scooter-150cc-no-rj-entregadores-seguros-com-21go',
  'protecao-veicular-para-frota-pequena-3-5-veiculos-no-rj',
];

async function main() {
  for (const slug of SLUGS) {
    const rows = await query<{ id: string; status: string }>(
      `SELECT id, status FROM seo.articles WHERE slug=$1`,
      [slug],
    );
    const first = rows[0];
    if (!first) { console.log('NOT FOUND:', slug); continue; }
    const id = first.id;
    console.log(slug, 'id=', id, 'status=', first.status);

    const resp = await fetch('http://seo-worker:8080/runs/publish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer 61d3ef1154c77bc6b6ad2a05be65a732bd43e405bd6a4c88bf4297acb9b8c83e',
      },
      body: JSON.stringify({ article_id: id }),
    });
    const body = await resp.text();
    console.log('  →', resp.status, body.slice(0, 200));
  }
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
