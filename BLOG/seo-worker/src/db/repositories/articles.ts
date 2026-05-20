/**
 * Repository: seo.articles + seo.briefings + seo.article_versions
 */
import { supabase } from '../supabase.js';
import { config } from '../../config.js';
import type { KeywordCategory } from './keywords.js';

export type ArticleStatus = 'draft' | 'in_review' | 'approved' | 'awaiting_pr_merge' | 'published' | 'archived' | 'updating';
export type ReviewStatus = 'APROVADO' | 'APROVADO_COM_AJUSTES' | 'REPROVADO';

export interface BriefingInsert {
  topic_id: string;
  seo_title: string;
  h1: string;
  outline: unknown;          // [{h2, h3:[], notes}]
  faqs?: unknown;            // [{q,a}]
  internal_links?: unknown;  // [{anchor,url}]
  legal_notes?: string;
  example_suggestions?: string;
  image_suggestion?: string;
  is_update_of?: string;
  llm_model_used?: string;
}

export interface BriefingRow extends BriefingInsert {
  id: string;
  created_at: string;
}

export async function insertBriefing(b: BriefingInsert): Promise<BriefingRow> {
  const sb = supabase();
  const { data, error } = await sb.from('briefings').insert(b).select('*').single();
  if (error || !data) throw new Error(`briefings.insert falhou: ${error?.message}`);
  return data as BriefingRow;
}

export interface ArticleInsert {
  topic_id?: string;
  briefing_id?: string;
  title: string;
  slug: string;
  meta_title?: string;
  meta_description?: string;
  category?: KeywordCategory;
  main_keyword?: string;
  secondary_keywords?: string[];
  mdx_path?: string;
  word_count?: number;
  read_time_min?: number;
  status?: ArticleStatus;
}

export interface ArticleRow extends ArticleInsert {
  id: string;
  company_id: string;
  url: string;
  status: ArticleStatus;
  review_status: ReviewStatus | null;
  review_notes: string | null;
  mdx_sha: string | null;
  pr_url: string | null;
  pr_branch: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export async function insertArticle(a: ArticleInsert): Promise<ArticleRow> {
  const sb = supabase();
  const { data, error } = await sb
    .from('articles')
    .insert({ company_id: config.COMPANY_ID, status: 'draft', ...a })
    .select('*')
    .single();
  if (error || !data) throw new Error(`articles.insert falhou: ${error?.message}`);
  return data as ArticleRow;
}

export async function updateArticle(id: string, patch: Partial<ArticleRow>): Promise<void> {
  const sb = supabase();
  const { error } = await sb.from('articles').update(patch).eq('id', id);
  if (error) throw new Error(`articles.update falhou: ${error.message}`);
}

export async function listAll(opts: { status?: ArticleStatus } = {}): Promise<ArticleRow[]> {
  const sb = supabase();
  let q = sb.from('articles').select('*').eq('company_id', config.COMPANY_ID).order('created_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`articles.listAll falhou: ${error.message}`);
  return (data ?? []) as ArticleRow[];
}

export async function findBySlug(slug: string): Promise<ArticleRow | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from('articles')
    .select('*')
    .eq('company_id', config.COMPANY_ID)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`articles.findBySlug falhou: ${error.message}`);
  return (data ?? null) as ArticleRow | null;
}

export async function saveVersion(article_id: string, version: number, mdx_content: string, changed_by: string, diff_summary?: string): Promise<void> {
  const sb = supabase();
  const { error } = await sb
    .from('article_versions')
    .insert({ article_id, version, mdx_content, changed_by, diff_summary });
  if (error) throw new Error(`article_versions.insert falhou: ${error.message}`);
}
