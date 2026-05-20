/**
 * Repository: indexing_log + metrics_daily + recommendations + dataforseo_calls (via pg).
 */
import { query, exec } from '../pg.js';

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
  await exec(
    `INSERT INTO seo.indexing_log
       (article_id, url, channel, action, response_status, response_body, error)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      entry.article_id ?? null, entry.url, entry.channel, entry.action,
      entry.response_status ?? null,
      entry.response_body ? JSON.stringify(entry.response_body) : null,
      entry.error ?? null,
    ],
  );
}

export type MetricsSource = 'gsc' | 'ga4' | 'bing';

export interface MetricsDailyInsert {
  article_id?: string;
  url: string;
  date: string;
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
  for (const r of rows) {
    await exec(
      `INSERT INTO seo.metrics_daily
         (article_id, url, date, source, impressions, clicks, ctr, avg_position,
          ga4_sessions, ga4_engaged_sessions, ga4_engagement_rate,
          ga4_avg_engagement_time_sec, ga4_conversions, whatsapp_clicks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (article_id, url, date, source) DO UPDATE SET
         impressions=COALESCE(EXCLUDED.impressions, seo.metrics_daily.impressions),
         clicks=COALESCE(EXCLUDED.clicks, seo.metrics_daily.clicks),
         ctr=COALESCE(EXCLUDED.ctr, seo.metrics_daily.ctr),
         avg_position=COALESCE(EXCLUDED.avg_position, seo.metrics_daily.avg_position),
         ga4_sessions=COALESCE(EXCLUDED.ga4_sessions, seo.metrics_daily.ga4_sessions),
         ga4_engaged_sessions=COALESCE(EXCLUDED.ga4_engaged_sessions, seo.metrics_daily.ga4_engaged_sessions),
         ga4_engagement_rate=COALESCE(EXCLUDED.ga4_engagement_rate, seo.metrics_daily.ga4_engagement_rate),
         ga4_avg_engagement_time_sec=COALESCE(EXCLUDED.ga4_avg_engagement_time_sec, seo.metrics_daily.ga4_avg_engagement_time_sec),
         ga4_conversions=COALESCE(EXCLUDED.ga4_conversions, seo.metrics_daily.ga4_conversions),
         whatsapp_clicks=COALESCE(EXCLUDED.whatsapp_clicks, seo.metrics_daily.whatsapp_clicks)`,
      [
        r.article_id ?? null, r.url, r.date, r.source,
        r.impressions ?? null, r.clicks ?? null, r.ctr ?? null, r.avg_position ?? null,
        r.ga4_sessions ?? null, r.ga4_engaged_sessions ?? null, r.ga4_engagement_rate ?? null,
        r.ga4_avg_engagement_time_sec ?? null, r.ga4_conversions ?? null,
        r.whatsapp_clicks ?? null,
      ],
    );
  }
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
  await exec(
    `INSERT INTO seo.recommendations (type, article_id, priority, recommendation, reason, data)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [r.type, r.article_id ?? null, r.priority, r.recommendation, r.reason, r.data ? JSON.stringify(r.data) : null],
  );
}

export async function logDataForSeoCall(
  endpoint: string,
  body: unknown,
  meta: unknown,
  cost_usd: number | null,
  cached: boolean,
): Promise<void> {
  await exec(
    `INSERT INTO seo.dataforseo_calls (endpoint, request_body, response_meta, cost_usd, cached)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)`,
    [endpoint, JSON.stringify(body), JSON.stringify(meta), cost_usd, cached],
  );
}

export async function getDataForSeoTodaySpend(): Promise<number> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = await query<{ cost_usd: number | null }>(
    `SELECT cost_usd FROM seo.dataforseo_calls WHERE called_at >= $1`,
    [today.toISOString()],
  );
  return rows.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0);
}
