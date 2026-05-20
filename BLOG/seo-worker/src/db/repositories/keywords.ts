/**
 * Repository: seo.keywords (via pg direto)
 */
import { query, queryOne, exec } from '../pg.js';
import { config } from '../../config.js';

export type KeywordCategory = 'carros' | 'motos' | 'frotas' | 'educativo';
export type KeywordSource = 'dataforseo' | 'gsc' | 'trends' | 'manual' | 'internal';
export type KeywordIntent = 'informational' | 'navigational' | 'commercial' | 'transactional' | 'unknown';
export type KeywordStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'out_of_scope';

export interface KeywordInsert {
  keyword: string;
  category: KeywordCategory;
  source: KeywordSource;
  search_volume?: number | null;
  difficulty?: number | null;
  cpc_brl?: number | null;
  intent?: KeywordIntent;
  commercial_potential?: number | null;
  serp_competitors?: unknown;
  notes?: string;
}

export interface KeywordRow {
  id: string;
  company_id: string;
  keyword: string;
  keyword_normalized: string;
  category: KeywordCategory;
  source: KeywordSource;
  search_volume: number | null;
  difficulty: number | null;
  cpc_brl: number | null;
  intent: KeywordIntent | null;
  commercial_potential: number | null;
  serp_competitors: unknown;
  notes: string | null;
  status: KeywordStatus;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/** Upsert por (company_id, keyword_normalized). */
export async function upsertKeyword(k: KeywordInsert): Promise<KeywordRow> {
  const row = await queryOne<KeywordRow>(
    `INSERT INTO seo.keywords
      (company_id, keyword, category, source, search_volume, difficulty, cpc_brl, intent, commercial_potential, serp_competitors, notes, last_seen_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, now())
     ON CONFLICT (company_id, keyword_normalized) DO UPDATE SET
       category=EXCLUDED.category,
       source=EXCLUDED.source,
       search_volume=COALESCE(EXCLUDED.search_volume, seo.keywords.search_volume),
       difficulty=COALESCE(EXCLUDED.difficulty, seo.keywords.difficulty),
       cpc_brl=COALESCE(EXCLUDED.cpc_brl, seo.keywords.cpc_brl),
       intent=COALESCE(EXCLUDED.intent, seo.keywords.intent),
       last_seen_at=now()
     RETURNING *`,
    [
      config.COMPANY_ID, k.keyword, k.category, k.source,
      k.search_volume ?? null, k.difficulty ?? null, k.cpc_brl ?? null,
      k.intent ?? null, k.commercial_potential ?? null,
      k.serp_competitors ? JSON.stringify(k.serp_competitors) : null,
      k.notes ?? null,
    ],
  );
  if (!row) throw new Error('keywords.upsert nao retornou row');
  return row;
}

export async function listPending(limit = 50): Promise<KeywordRow[]> {
  return query<KeywordRow>(
    `SELECT * FROM seo.keywords
     WHERE company_id=$1 AND status='pending'
     ORDER BY search_volume DESC NULLS LAST
     LIMIT $2`,
    [config.COMPANY_ID, limit],
  );
}

export async function setStatus(id: string, status: KeywordStatus, notes?: string): Promise<void> {
  if (notes !== undefined) {
    await exec(`UPDATE seo.keywords SET status=$1, notes=$2 WHERE id=$3`, [status, notes, id]);
  } else {
    await exec(`UPDATE seo.keywords SET status=$1 WHERE id=$2`, [status, id]);
  }
}

export async function findByNormalized(normalized: string): Promise<KeywordRow | null> {
  return queryOne<KeywordRow>(
    `SELECT * FROM seo.keywords WHERE company_id=$1 AND keyword_normalized=$2`,
    [config.COMPANY_ID, normalized],
  );
}
