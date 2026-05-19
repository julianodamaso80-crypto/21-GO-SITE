/**
 * Repository: seo.topics — pautas avaliadas pelo SEOStrategist.
 */
import { supabase } from '../supabase.js';
import { config } from '../../config.js';
import type { KeywordCategory, KeywordIntent } from './keywords.js';

export type TopicDecision =
  | 'APROVAR_ARTIGO_NOVO'
  | 'ATUALIZAR_ARTIGO_EXISTENTE'
  | 'VIRAR_SECAO_DE_ARTIGO_EXISTENTE'
  | 'REJEITAR_POR_REPETICAO'
  | 'REJEITAR_FORA_DO_ESCOPO'
  | 'PENDENTE';

export interface TopicInsert {
  title: string;
  main_keyword_id?: string;
  secondary_keywords?: string[];
  category: KeywordCategory;
  intent?: KeywordIntent;
  audience?: string;
  pain_point?: string;
  pillar_page?: string;
  anti_repetition_score?: number;
  similar_articles?: string[];
  decision?: TopicDecision;
  decision_reason?: string;
  target_article_id?: string;
  scheduled_for?: string;
}

export interface TopicRow extends TopicInsert {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export async function insertTopic(t: TopicInsert): Promise<TopicRow> {
  const sb = supabase();
  const { data, error } = await sb
    .from('topics')
    .insert({ company_id: config.COMPANY_ID, ...t })
    .select('*')
    .single();
  if (error || !data) throw new Error(`topics.insert falhou: ${error?.message}`);
  return data as TopicRow;
}

export async function updateDecision(
  id: string,
  decision: TopicDecision,
  reason: string,
  extras: Partial<Pick<TopicRow, 'anti_repetition_score' | 'similar_articles' | 'target_article_id'>> = {},
): Promise<void> {
  const sb = supabase();
  const { error } = await sb
    .from('topics')
    .update({ decision, decision_reason: reason, ...extras })
    .eq('id', id);
  if (error) throw new Error(`topics.updateDecision falhou: ${error.message}`);
}

export async function listApproved(limit = 10): Promise<TopicRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from('topics')
    .select('*')
    .eq('company_id', config.COMPANY_ID)
    .in('decision', ['APROVAR_ARTIGO_NOVO', 'ATUALIZAR_ARTIGO_EXISTENTE'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`topics.listApproved falhou: ${error.message}`);
  return (data ?? []) as TopicRow[];
}
