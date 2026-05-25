// =============================================================================
// apply-super-banco.js
// Aplica as 8 migrations 100-180 no banco novo (dsclaxtvcbbuxmtmpxpf)
// Cada arquivo roda em transacao isolada — se falhar, rollback e para.
// =============================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PASS = process.env.SUPABASE_NEW_DB_PASSWORD || 'GuI1616GuI@';
const REF = process.env.SUPABASE_NEW_REF || 'dsclaxtvcbbuxmtmpxpf';
const HOST = 'aws-1-sa-east-1.pooler.supabase.com';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const FILES = [
  '100_super_banco_extensions.sql',
  '110_super_banco_core.sql',
  '120_super_banco_chat.sql',
  '130_super_banco_ai.sql',
  '140_super_banco_tracking.sql',
  '150_super_banco_ops.sql',
  '160_super_banco_crm.sql',
  '170_super_banco_triggers.sql',
  '180_super_banco_seeds.sql',
];

(async () => {
  const c = new Client({
    host: HOST,
    port: 5432,
    user: 'postgres.' + REF,
    password: PASS,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
    query_timeout: 60000,
  });

  await c.connect();
  console.log('Conectado ao banco novo:', REF);
  console.log('---');

  for (const file of FILES) {
    const fpath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(fpath)) {
      console.log('SKIP (nao existe):', file);
      continue;
    }
    const sql = fs.readFileSync(fpath, 'utf8');

    process.stdout.write(`Aplicando ${file}... `);
    const t0 = Date.now();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('COMMIT');
      console.log(`OK (${Date.now()-t0}ms)`);
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      console.log(`FAIL (${Date.now()-t0}ms)`);
      console.error('  ERRO:', e.message);
      console.error('  Detail:', e.detail || '(sem detail)');
      console.error('  Hint:', e.hint || '(sem hint)');
      console.error('  Position:', e.position || '(sem position)');
      // Mostra linha proxima do erro
      if (e.position) {
        const pos = parseInt(e.position, 10);
        const around = sql.substring(Math.max(0, pos-150), Math.min(sql.length, pos+150));
        console.error('  Trecho:', around.replace(/\n/g, '\\n'));
      }
      await c.end();
      process.exit(1);
    }
  }

  // Resumo
  console.log('---');
  console.log('Resumo do banco novo:');
  const schemas = await c.query(`
    SELECT n.nspname AS schema, count(t.tablename)::int AS tables
    FROM pg_namespace n
    LEFT JOIN pg_tables t ON t.schemaname = n.nspname
    WHERE n.nspname IN ('core','chat','ai','tracking','ops','crm','public')
    GROUP BY n.nspname
    ORDER BY n.nspname
  `);
  for (const r of schemas.rows) {
    console.log('  schema ' + r.schema.padEnd(10) + ' tabelas: ' + r.tables);
  }

  const ext = await c.query(`SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm','uuid-ossp','pgcrypto','unaccent') ORDER BY extname`);
  console.log('  extensions:', ext.rows.map(r => r.extname).join(', '));

  await c.end();
  console.log('---');
  console.log('SUCESSO. Banco novo pronto.');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
