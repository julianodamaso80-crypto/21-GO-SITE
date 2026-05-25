import { query, closePool } from '../db/pg.js';

async function main() {
  // Artigos GERADOS pela esteira por dia (exclui imports antigos massivos)
  const byDay = await query<{ d: string; carros: number; motos: number; frotas: number; educativo: number; total: number }>(
    `SELECT
       (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS d,
       count(*) FILTER (WHERE category='carros')::int AS carros,
       count(*) FILTER (WHERE category='motos')::int AS motos,
       count(*) FILTER (WHERE category='frotas')::int AS frotas,
       count(*) FILTER (WHERE category='educativo')::int AS educativo,
       count(*)::int AS total
     FROM seo.articles
     WHERE company_id='company-21go'
       AND created_at >= '2026-05-20'::date
       AND mdx_content IS NOT NULL  -- exclui posts importados antigos sem mdx_content
     GROUP BY (created_at AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY d DESC`,
  );
  console.log('=== ARTIGOS GERADOS PELA ESTEIRA POR DIA ===');
  console.log('Data        Carros  Motos  Frotas  Edu  TOTAL  Slots(C+M+F)?');
  for (const r of byDay) {
    const slotsOk = (r.carros >= 1 && r.motos >= 1 && r.frotas >= 1) ? '[OK]' : `[FALTA: ${r.carros < 1 ? 'C ' : ''}${r.motos < 1 ? 'M ' : ''}${r.frotas < 1 ? 'F' : ''}]`;
    console.log(`${r.d}   ${String(r.carros).padStart(2)}      ${String(r.motos).padStart(2)}     ${String(r.frotas).padStart(2)}      ${String(r.educativo).padStart(2)}   ${String(r.total).padStart(2)}     ${slotsOk}`);
  }

  const cnt = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM seo.articles
     WHERE company_id='company-21go' AND mdx_content IS NOT NULL AND status='published'`,
  );
  console.log(`\nTotal artigos novos publicados (geradas pela esteira): ${cnt[0]?.n}`);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
