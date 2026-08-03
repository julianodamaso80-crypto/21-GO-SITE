import { query, closePool } from '../db/pg.js';

const SLUGS = [
  'protecao-veicular-para-carro-hatch-economia-e-seguranca',
  'protecao-para-scooter-150cc-no-rj-entregadores-seguros-com-21go',
  'protecao-veicular-para-frota-pequena-3-5-veiculos-no-rj',
];

async function main() {
  for (const slug of SLUGS) {
    const rows = await query<{ channel: string; url: string; response_status: number; occurred_at: string }>(
      `SELECT channel, url, response_status, occurred_at
         FROM seo.indexing_log
        WHERE url LIKE '%' || $1 || '%'
        ORDER BY occurred_at DESC`,
      [slug],
    );
    console.log('---', slug, '---');
    console.log('total submits:', rows.length);
    const okCount = rows.filter((r) => r.response_status >= 200 && r.response_status < 400).length;
    console.log('OK 2xx/3xx:', okCount);
  }
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
