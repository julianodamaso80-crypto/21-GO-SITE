/**
 * Bing Webmaster Tools API.
 * Docs: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
 * Endpoint: https://ssl.bing.com/webmaster/api.svc/json/{Action}?apikey={key}
 */
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:bing');
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

function key(): string {
  if (!config.BING_API_KEY) throw new Error('Pendente de credencial: BING_API_KEY');
  return config.BING_API_KEY;
}

/** Submete uma URL ao Bing. Se bingSite omitido, usa o padrao do config. */
export async function submitUrl(url: string, bingSite?: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const siteUrl = bingSite ?? config.BING_SITE_URL;
  const res = await fetch(`${BASE}/SubmitUrl?apikey=${key()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl, url }),
  });
  if (!res.ok) {
    const body = await res.text();
    log.warn({ status: res.status, body: body.slice(0, 200), siteUrl }, 'bing submitUrl falhou');
    return { ok: false, status: res.status, body };
  }
  log.info({ url, siteUrl }, 'bing submitUrl ok');
  return { ok: true, status: res.status };
}

/** Submete sitemap ao Bing. Se bingSite omitido, usa o padrao do config. */
export async function submitSitemap(sitemapUrl: string, bingSite?: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const siteUrl = bingSite ?? config.BING_SITE_URL;
  const res = await fetch(`${BASE}/SubmitFeed?apikey=${key()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl, feedUrl: sitemapUrl }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status };
}
