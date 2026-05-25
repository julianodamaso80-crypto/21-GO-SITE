// =============================================================================
// FASE 1.D — Gera embeddings LOCAIS (multilingual-e5-large, 1024 dim)
// Indexa todos chunks de ai.knowledge_chunks + ai.conversation_chunks
// 100% offline, zero custo de API.
// =============================================================================
const { Client } = require('pg');

const MODEL = 'Xenova/multilingual-e5-small'; // 384 dim, leve, ótimo pra PT-BR em apps memory-constrained
const BATCH_SIZE = 8;

(async () => {
  const { pipeline } = await import('@xenova/transformers');

  console.log(`Carregando modelo ${MODEL} (primeira vez baixa ~560MB do HuggingFace)...`);
  const t0 = Date.now();
  const extractor = await pipeline('feature-extraction', MODEL, { quantized: true });
  console.log(`Modelo carregado em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  async function embedBatch(texts) {
    // e5 espera prefixo "passage: " pra documentos a indexar
    const prefixed = texts.map(t => `passage: ${t}`);
    const out = await extractor(prefixed, { pooling: 'mean', normalize: true });
    // out.tolist() retorna [batch][dim]
    return out.tolist();
  }

  function vecToPgString(vec) {
    return '[' + vec.map(v => v.toFixed(6)).join(',') + ']';
  }

  const c = new Client({
    host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432,
    user: 'postgres.dsclaxtvcbbuxmtmpxpf', password: 'GuI1616GuI@',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Indexar knowledge_chunks
  console.log('\n--- Knowledge chunks ---');
  const kc = (await c.query('SELECT id, content FROM ai.knowledge_chunks WHERE embedding IS NULL ORDER BY id')).rows;
  console.log(`Pendentes: ${kc.length}`);
  let kdone = 0;
  for (let i = 0; i < kc.length; i += BATCH_SIZE) {
    const batch = kc.slice(i, i + BATCH_SIZE);
    const t = Date.now();
    const embs = await embedBatch(batch.map(r => r.content));
    for (let j = 0; j < batch.length; j++) {
      await c.query(
        `UPDATE ai.knowledge_chunks SET embedding = $1::extensions.vector WHERE id = $2`,
        [vecToPgString(embs[j]), batch[j].id]
      );
    }
    kdone += batch.length;
    process.stdout.write(`\r  ${kdone}/${kc.length} (${Date.now() - t}ms/batch)        `);
  }
  console.log();

  // Indexar conversation_chunks
  console.log('\n--- Conversation chunks ---');
  const cc = (await c.query('SELECT id, content FROM ai.conversation_chunks WHERE embedding IS NULL ORDER BY id')).rows;
  console.log(`Pendentes: ${cc.length}`);
  let ccdone = 0;
  for (let i = 0; i < cc.length; i += BATCH_SIZE) {
    const batch = cc.slice(i, i + BATCH_SIZE);
    const t = Date.now();
    const embs = await embedBatch(batch.map(r => r.content));
    for (let j = 0; j < batch.length; j++) {
      await c.query(
        `UPDATE ai.conversation_chunks SET embedding = $1::extensions.vector WHERE id = $2`,
        [vecToPgString(embs[j]), batch[j].id]
      );
    }
    ccdone += batch.length;
    process.stdout.write(`\r  ${ccdone}/${cc.length} (${Date.now() - t}ms/batch)        `);
  }
  console.log();

  // Verificar
  const stats = await c.query(`
    SELECT 'knowledge_chunks' AS tabela,
           count(*) FILTER (WHERE embedding IS NOT NULL) AS com_emb,
           count(*) AS total
    FROM ai.knowledge_chunks
    UNION ALL
    SELECT 'conversation_chunks', count(*) FILTER (WHERE embedding IS NOT NULL), count(*)
    FROM ai.conversation_chunks
  `);
  console.log('\n=== STATUS FINAL ===');
  for (const r of stats.rows) {
    console.log(`  ${r.tabela.padEnd(22)} ${r.com_emb}/${r.total} com embedding`);
  }

  await c.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
