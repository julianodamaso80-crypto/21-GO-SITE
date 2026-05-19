// =============================================================================
// apply-seo-schema.js
// Aplica a migration 230_seo_schema.sql no super-banco da 21Go.
//
// MODOS:
//   --dry-run   : valida sintaxe (PREPARE), nao executa CREATE/ALTER reais.
//   --apply     : executa de verdade (dentro da transacao da propria migration).
//
// USO:
//   SUPABASE_NEW_DB_PASSWORD=... node scripts/apply-seo-schema.js --dry-run
//   SUPABASE_NEW_DB_PASSWORD=... node scripts/apply-seo-schema.js --apply
//
// Segue o padrao de scripts/apply-super-banco.js (mesmo pooler/host).
// =============================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const APPLY = args.has('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Uso: node scripts/apply-seo-schema.js --dry-run | --apply');
  process.exit(2);
}

const PASS = process.env.SUPABASE_NEW_DB_PASSWORD;
const REF = process.env.SUPABASE_NEW_REF || 'dsclaxtvcbbuxmtmpxpf';
const HOST = process.env.SUPABASE_NEW_HOST || 'aws-1-sa-east-1.pooler.supabase.com';

if (!PASS) {
  console.error('ERRO: defina SUPABASE_NEW_DB_PASSWORD no ambiente.');
  console.error('Pendente de credencial: nao vou inventar/usar default.');
  process.exit(1);
}

const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '230_seo_schema.sql');
if (!fs.existsSync(MIGRATION)) {
  console.error('ERRO: migration nao encontrada:', MIGRATION);
  process.exit(1);
}
const SQL = fs.readFileSync(MIGRATION, 'utf8');

(async () => {
  const c = new Client({
    host: HOST,
    port: 5432,
    user: 'postgres.' + REF,
    password: PASS,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    query_timeout: 120000,
  });

  try {
    await c.connect();
    console.log('Conectado:', REF, '@', HOST);
  } catch (e) {
    console.error('FALHA AO CONECTAR:', e.message);
    process.exit(1);
  }

  // Pre-check 1: schemas/funcao/extensions esperados
  console.log('--- Pre-check 1: dependencias ---');
  const pre = await c.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='core')                            AS schema_core,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='extensions')                       AS schema_extensions,
      EXISTS (SELECT 1 FROM core.companies WHERE id='company-21go')                        AS company_seed,
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='set_updated_at')                     AS fn_set_updated_at,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector')                           AS ext_vector,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm')                          AS ext_pg_trgm,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname='unaccent')                         AS ext_unaccent,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='seo')                              AS schema_seo_existe
  `);
  console.table(pre.rows[0]);

  const r = pre.rows[0];
  if (!r.schema_core)        { console.error('ERRO: schema core nao existe. Rode migrations 100-180 antes.'); process.exit(1); }
  if (!r.schema_extensions)  { console.error('ERRO: schema extensions nao existe.'); process.exit(1); }
  if (!r.company_seed)       { console.error('ERRO: company-21go nao seed. Rode migration 180.'); process.exit(1); }
  if (!r.fn_set_updated_at)  { console.error('ERRO: public.set_updated_at() nao existe.'); process.exit(1); }
  if (!r.ext_vector)         { console.error('ERRO: extension vector nao instalada.'); process.exit(1); }
  if (!r.ext_pg_trgm)        { console.error('ERRO: extension pg_trgm nao instalada.'); process.exit(1); }
  if (!r.ext_unaccent)       { console.error('ERRO: extension unaccent nao instalada.'); process.exit(1); }
  if (r.schema_seo_existe)   { console.error('ATENCAO: schema seo ja existe. Pare e revise antes de re-aplicar.'); process.exit(1); }

  // Pre-check 2: dimensao do vector e nome dos operadores
  console.log('--- Pre-check 2: tipos/operadores ---');
  const ops = await c.query(`
    SELECT extname, n.nspname AS schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE extname IN ('vector','pg_trgm','unaccent')
    ORDER BY extname
  `);
  console.table(ops.rows);

  if (DRY_RUN) {
    // Dry-run: prepara o SQL em transacao e da ROLLBACK no fim.
    console.log('--- DRY-RUN: aplicando dentro de transacao e fazendo ROLLBACK ---');
    const t0 = Date.now();
    try {
      // BEGIN externo — NAO usamos o BEGIN/COMMIT da migration: removemos.
      const sqlNoTx = SQL
        .replace(/^BEGIN;\s*$/m, '-- (BEGIN removido para dry-run)')
        .replace(/^COMMIT;\s*$/m, '-- (COMMIT removido para dry-run)');
      await c.query('BEGIN');
      await c.query(sqlNoTx);
      // Lista o que foi criado dentro da transacao
      const created = await c.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema='seo'
        ORDER BY table_name
      `);
      console.log('Tabelas criadas (DENTRO da transacao, vai sofrer ROLLBACK):');
      console.table(created.rows);
      const views = await c.query(`
        SELECT table_schema, table_name
        FROM information_schema.views
        WHERE table_schema='seo'
        ORDER BY table_name
      `);
      console.log('Views criadas:');
      console.table(views.rows);
      await c.query('ROLLBACK');
      console.log(`DRY-RUN OK em ${Date.now()-t0}ms. Nenhuma mudanca foi persistida.`);
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch (_) {}
      console.error(`DRY-RUN FALHOU em ${Date.now()-t0}ms`);
      console.error('  ERRO:', e.message);
      console.error('  Detail:', e.detail || '(sem detail)');
      console.error('  Hint:', e.hint || '(sem hint)');
      console.error('  Position:', e.position || '(sem position)');
      if (e.position) {
        const pos = parseInt(e.position, 10);
        const around = SQL.substring(Math.max(0, pos-200), Math.min(SQL.length, pos+200));
        console.error('  Trecho proximo:', '\n' + around);
      }
      process.exit(1);
    }
  } else if (APPLY) {
    console.log('--- APPLY: aplicando migration de verdade ---');
    const t0 = Date.now();
    try {
      // A migration tem seu proprio BEGIN/COMMIT — apenas executar.
      await c.query(SQL);
      console.log(`APPLY OK em ${Date.now()-t0}ms.`);
    } catch (e) {
      console.error(`APPLY FALHOU em ${Date.now()-t0}ms`);
      console.error('  ERRO:', e.message);
      console.error('  Detail:', e.detail || '(sem detail)');
      console.error('  Hint:', e.hint || '(sem hint)');
      console.error('  Position:', e.position || '(sem position)');
      if (e.position) {
        const pos = parseInt(e.position, 10);
        const around = SQL.substring(Math.max(0, pos-200), Math.min(SQL.length, pos+200));
        console.error('  Trecho proximo:', '\n' + around);
      }
      process.exit(1);
    }

    // Pos-check
    const post = await c.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema='seo'
      UNION ALL
      SELECT table_name, 'VIEW' FROM information_schema.views WHERE table_schema='seo'
      ORDER BY 1
    `);
    console.log('Pos-check — objetos no schema seo:');
    console.table(post.rows);
  }

  await c.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
