import { readFileSync } from 'node:fs'
import pg from 'pg'

/**
 * Aplica UM arquivo .sql no banco, por conexao direta.
 *
 * Roda DENTRO do container (`docker exec site21go node /tmp/aplicar-migracao.mjs
 * /tmp/276.sql`): a `SUPABASE_DB_URL` so existe la, e de proposito.
 *
 * Tem transacao: ou a migracao inteira entra, ou nada entra. Meia migracao num
 * banco compartilhado com o CRM e o pior dos mundos.
 */

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('uso: node aplicar-migracao.mjs <arquivo.sql>')
  process.exit(1)
}

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL ausente — rode isto dentro do container site21go')
  process.exit(1)
}

const sql = readFileSync(arquivo, 'utf8')

// Host/usuario separados, NAO `connectionString`: a URL do Supabase vem com
// `sslmode=require`, o pg 8 trata isso como `verify-full` e o certificado deles
// derruba a conexao com SELF_SIGNED_CERT_IN_CHAIN — ignorando o objeto `ssl`
// passado junto. Mesma armadilha ja documentada em src/lib/supabase-direto.ts.
const u = new URL(url)
const cliente = new pg.Client({
  host: u.hostname,
  port: Number(u.port) || 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
})

await cliente.connect()
try {
  await cliente.query('BEGIN')
  await cliente.query(sql)
  await cliente.query('COMMIT')
  console.log(`✓ aplicado: ${arquivo}`)
} catch (err) {
  await cliente.query('ROLLBACK')
  console.error(`✗ falhou, nada foi aplicado: ${err.message}`)
  process.exitCode = 1
} finally {
  await cliente.end()
}
