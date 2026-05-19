/**
 * Repository: seo.keywords
 */
import { supabase } from '../supabase.js';
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

export interface KeywordRow extends KeywordInsert {
  id: string;
  company_id: string;
  keyword_normalized: string;
  status: KeywordStatus;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/** Insere ou atualiza pela chave (company_id, keyword_normalized). */
export async function upsertKeyword(k: KeywordInsert): Promise<KeywordRow> {
  const sb = supabase();
  const { data, error } = await sb
    .from('keywords')
    .upsert(
      { company_id: config.COMPANY_ID, ...k, last_seen_at: new Date().toISOString() },
      { onConflict: 'company_id,keyword_normalized', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(`keywords.upsert falhou: ${error?.message}`);
  return data as KeywordRow;
}

export async function listPending(limit = 50): Promise<KeywordRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from('keywords')
    .select('*')
    .eq('company_id', config.COMPANY_ID)
    .eq('status', 'pending')
    .order('search_volume', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`keywords.listPending falhou: ${error.message}`);
  return (data ?? []) as KeywordRow[];
}

export async function setStatus(id: string, status: KeywordStatus, notes?: string): Promise<void> {
  const sb = supabase();
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;
  const { error } = await sb.from('keywords').update(patch).eq('id', id);
  if (error) throw new Error(`keywords.setStatus falhou: ${error.message}`);
}

export async function findByNormalized(normalized: string): Promise<KeywordRow | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from('keywords')
    .select('*')
    .eq('company_id', config.COMPANY_ID)
    .eq('keyword_normalized', normalized)
    .maybeSingle();

  if (error) throw new Error(`keywords.findByNormalized falhou: ${error.message}`);
  return (data ?? null) as KeywordRow | null;
}
