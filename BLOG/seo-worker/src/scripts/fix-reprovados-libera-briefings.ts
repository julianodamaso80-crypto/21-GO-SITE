/**
 * Deleta artigos REPROVADOS pra liberar os briefings ocupados.
 * Briefings ficam de novo no estoque pra serem reprocessados pelo daily.
 *
 * Causa do bug: query do slot system usa `LEFT JOIN articles ON a.briefing_id=b.id WHERE a.id IS NULL`.
 * Artigos REPROVADOS são `a.id != NULL`, então briefings ficam presos pra sempre.
 *
 * Decisao 2026-05-31: deletar reprovados = liberar briefing pra retry.
 */
import { query, exec, closePool } from '../db/pg.js';

async function main() {
  // 1. Lista reprovados ocupando briefings
  const reprovados = await query<{ id: string; slug: string; briefing_id: string | null }>(
    `SELECT id, slug, briefing_id
     FROM seo.articles
     WHERE company_id='company-21go'
       AND review_status='REPROVADO'
       AND briefing_id IS NOT NULL`,
  );
  console.log(`Reprovados ocupando briefings: ${reprovados.length}`);

  // 2. Deleta os artigos reprovados — briefings ficam livres automaticamente
  let deleted = 0;
  for (const r of reprovados) {
    await exec(`DELETE FROM seo.articles WHERE id = $1`, [r.id]);
    deleted++;
    console.log(`  deletado: ${r.slug}`);
  }

  // 3. Confirma estoque restaurado
  const stock = await query<{ category: string; n: number }>(
    `SELECT t.category, count(*)::int AS n
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL
     GROUP BY t.category
     ORDER BY t.category`,
  );
  console.log('\nEstoque após cleanup:');
  for (const s of stock) console.log(`  ${s.category}: ${s.n}`);

  console.log(`\nTotal deletado: ${deleted}`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
