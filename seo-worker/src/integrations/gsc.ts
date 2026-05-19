/**
 * Google Search Console — Search Analytics + URL Inspection + Sitemap submit.
 * Docs: https://developers.google.com/webmaster-tools/v1/api_reference_index
 * Scope: https://www.googleapis.com/auth/webmasters
 */
import { getAccessToken } from './google-auth.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:gsc');
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

async function gscFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(SCOPE);
  return fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

export interface SearchAnalyticsRow {
  url: string;
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Search Analytics — dimensions=['page'] ou ['page','query'] etc. */
export async function searchAnalytics(opts: {
  startDate: string;
  endDate: string;
  dimensions: ('page' | 'query' | 'device' | 'country')[];
  rowLimit?: number;
}): Promise<SearchAnalyticsRow[]> {
  const siteUrl = encodeURIComponent(config.GSC_SITE_URL);
  const res = await gscFetch(`/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
    method: 'POST',
    body: JSON.stringify({
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 1000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gsc searchAnalytics falhou: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  type Resp = { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
  const json = (await res.json()) as Resp;
  return (json.rows ?? []).map((r) => ({
    url: r.keys?.[0] ?? '',
    query: opts.dimensions.includes('query') ? r.keys?.[1] : undefined,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/** Submete (re)submissao de sitemap. */
export async function submitSitemap(sitemapUrl: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const siteUrl = encodeURIComponent(config.GSC_SITE_URL);
  const feedpath = encodeURIComponent(sitemapUrl);
  const res = await gscFetch(`/webmasters/v3/sites/${siteUrl}/sitemaps/${feedpath}`, { method: 'PUT' });
  if (!res.ok) {
    const body = await res.text();
    log.warn({ status: res.status, body: body.slice(0, 200) }, 'sitemap submit falhou');
    return { ok: false, status: res.status, body };
  }
  log.info({ sitemap: sitemapUrl }, 'sitemap submetido');
  return { ok: true, status: res.status };
}

/** URL Inspection (search.google.com/u/0/search-console/inspect?... — via API). */
export async function urlInspection(url: string): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  // API: https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
  const token = await getAccessToken(SCOPE);
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: config.GSC_SITE_URL, languageCode: 'pt-BR' }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, error: body.slice(0, 200) };
  }
  return { ok: true, status: res.status, data: await res.json() };
}
