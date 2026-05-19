/**
 * Repository: seo.indexing_log + seo.metrics_daily + seo.recommendations + seo.dataforseo_calls
 */
import { supabase } from '../supabase.js';

export type IndexingChannel = 'sitemap' | 'google_gsc' | 'bing_wmt' | 'indexnow' | 'url_inspection';
export type IndexingAction = 'submit' | 'recheck' | 'remove' | 'validate';

export interface IndexingLogInsert {
  article_id?: string;
  url: string;
  channel: IndexingChannel;
  action: IndexingAction;
  response_status?: number;
  response_body?: unknown;
  error?: string;
}

export async function logIndexing(entry: IndexingLogInsert): Promise<void> {
  const sb = supabase();
  const { error } = await sb.from('indexing_log').insert(entry);
  if (error) throw new Error(`indexing_log.insert falhou: ${error.message}`);
}

export type MetricsSource = 'gsc' | 'ga4' | 'bing';

export interface MetricsDailyInsert {
  article_id?: string;
  url: string;
  date: string; // YYYY-MM-DD
  source: MetricsSource;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  avg_position?: number;
  ga4_sessions?: number;
  ga4_engaged_sessions?: number;
  ga4_engagement_rate?: number;
  ga4_avg_engagement_time_sec?: number;
  ga4_conversions?: number;
  whatsapp_clicks?: number;
}

export async function upsertMetrics(rows: MetricsDailyInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabase();
  const { error } = await sb
    .from('metrics_daily')
    .upsert(rows, { onConflict: 'article_id,url,date,source', ignoreDuplicates: false });
  if (error) throw new Error(`metrics_daily.upsert falhou: ${error.message}`);
}

export type RecommendationType =
  | 'update_title' | 'update_meta_description' | 'improve_ctr'
  | 'add_faq' | 'expand_content' | 'merge_articles' | 'split_article'
  | 'add_internal_link' | 'fix_indexing' | 'new_topic' | 'deploy_failed';

export interface RecommendationInsert {
  type: RecommendationType;
  article_id?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  recommendation: string;
  reason: string;
  data?: unknown;
}

export async function insertRecommendation(r: RecommendationInsert): Promise<void> {
  const sb = supabase();
  const { error } = await sb.from('recommendations').insert(r);
  if (error) throw new Error(`recommendations.insert falhou: ${error.message}`);
}

export async function logDataForSeoCall(
  endpoint: string,
  body: unknown,
  meta: unknown,
  cost_usd: number | null,
  cached: boolean,
): Promise<void> {
  const sb = supabase();
  const { error } = await sb.from('dataforseo_calls').insert({
    endpoint, request_body: body, response_meta: meta, cost_usd, cached,
  });
  if (error) throw new Error(`dataforseo_calls.insert falhou: ${error.message}`);
}

export async function getDataForSeoTodaySpend(): Promise<number> {
  const sb = supabase();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('dataforseo_calls')
    .select('cost_usd')
    .gte('called_at', today.toISOString());
  if (error) throw new Error(`dataforseo_calls.todaySpend falhou: ${error.message}`);
  return (data ?? []).reduce((acc: number, r: { cost_usd: number | null }) => acc + (r.cost_usd ?? 0), 0);
}
