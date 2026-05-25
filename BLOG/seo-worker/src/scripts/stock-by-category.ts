import { query, closePool } from '../db/pg.js';

async function main() {
  const kw = await query<{ category: string; status: string; n: number }>(
    `SELECT category, status, count(*)::int AS n FROM seo.keywords GROUP BY category, status ORDER BY category, status`,
  );
  console.log('=== KEYWORDS POR CATEGORIA/STATUS ===');
  for (const r of kw) console.log(`  ${(r.category ?? 'null').padEnd(12)} ${r.status.padEnd(10)} ${r.n}`);

  const topics = await query<{ category: string; decision: string; n: number; with_briefing: number }>(
    `SELECT t.category, t.decision, count(*)::int AS n,
            count(b.id)::int AS with_briefing
     FROM seo.topics t
     LEFT JOIN seo.briefings b ON b.topic_id = t.id
     GROUP BY t.category, t.decision ORDER BY t.category, t.decision`,
  );
  console.log('\n=== TOPICS POR CATEGORIA/DECISION ===');
  for (const r of topics) console.log(`  ${(r.category ?? 'null').padEnd(12)} ${r.decision.padEnd(32)} ${r.n} topics (${r.with_briefing} com briefing)`);

  const noBrief = await query<{ category: string; n: number }>(
    `SELECT t.category, count(*)::int AS n
     FROM seo.topics t LEFT JOIN seo.briefings b ON b.topic_id = t.id
     WHERE b.id IS NULL AND t.decision IN ('APROVAR_ARTIGO_NOVO','ATUALIZAR_ARTIGO_EXISTENTE')
     GROUP BY t.category ORDER BY t.category`,
  );
  console.log('\n=== TOPICS APROVADOS SEM BRIEFING ===');
  for (const r of noBrief) console.log(`  ${(r.category ?? 'null').padEnd(12)} ${r.n}`);

  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
