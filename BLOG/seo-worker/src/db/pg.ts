/**
 * PostgreSQL pool direto — bypassa PostgREST (que nao expoe schema 'seo').
 *
 * Conecta via SUPABASE_NEW_DIRECT_URL (preferido — porta 5432, suporta prepared
 * statements) ou DATABASE_URL.
 *
 * Pool com max=5 — worker tem trafego baixo + concurrency=1 por fila.
 */
import pg from 'pg';
import { child } from '../lib/logger.js';

const { Pool } = pg;
const log = child('db:pg');

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const url = process.env.SUPABASE_NEW_DIRECT_URL
    ?? process.env.SUPABASE_NEW_DATABASE_URL
    ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Pendente de credencial: SUPABASE_NEW_DIRECT_URL (ou SUPABASE_NEW_DATABASE_URL ou DATABASE_URL)');
  }
  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    query_timeout: 60_000,
  });
  _pool.on('error', (err: Error) => log.error({ err: err.message }, 'pg pool erro'));
  log.info({ host: new URL(url).host }, 'pg pool inicializado');
  return _pool;
}

/** Retorna todas as linhas. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await getPool().query(text, params);
  return r.rows as T[];
}

/** Retorna a primeira linha ou null. */
export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Executa e retorna rowCount. */
export async function exec(text: string, params: unknown[] = []): Promise<number> {
  const r = await getPool().query(text, params);
  return r.rowCount ?? 0;
}

/** Fecha o pool (graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
