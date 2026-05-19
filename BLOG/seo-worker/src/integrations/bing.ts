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

/** Submete uma URL ao Bing (max 10/dia por padrao Webmaster). */
export async function submitUrl(url: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const res = await fetch(`${BASE}/SubmitUrl?apikey=${key()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl: config.BING_SITE_URL, url }),
  });
  if (!res.ok) {
    const body = await res.text();
    log.warn({ status: res.status, body: body.slice(0, 200) }, 'bing submitUrl falhou');
    return { ok: false, status: res.status, body };
  }
  log.info({ url }, 'bing submitUrl ok');
  return { ok: true, status: res.status };
}

/** Submete sitemap ao Bing. */
export async function submitSitemap(sitemapUrl: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const res = await fetch(`${BASE}/SubmitFeed?apikey=${key()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl: config.BING_SITE_URL, feedUrl: sitemapUrl }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status };
}
