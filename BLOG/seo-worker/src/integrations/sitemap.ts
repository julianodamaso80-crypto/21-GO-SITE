/**
 * Sitemap checker — usado pelo Agente 10 (Sitemap).
 *
 * Responsabilidades:
 *   - Fetch do sitemap publicado
 *   - Verifica se a URL alvo esta presente
 *   - Faz GET na URL e confere status 200 e ausencia de noindex
 *   - Faz GET no robots.txt e confere que a URL nao esta disallow
 */
import { child } from '../lib/logger.js';

const log = child('integrations:sitemap');

export interface SitemapCheck {
  url: string;
  sitemap_contains: boolean | null;
  status_ok: boolean | null;
  http_status: number | null;
  has_noindex: boolean | null;
  robots_allows: boolean | null;
  errors: string[];
}

export async function checkUrl(targetUrl: string, sitemapUrl: string): Promise<SitemapCheck> {
  const errors: string[] = [];
  const check: SitemapCheck = {
    url: targetUrl,
    sitemap_contains: null,
    status_ok: null,
    http_status: null,
    has_noindex: null,
    robots_allows: null,
    errors,
  };

  // 1) Sitemap
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      errors.push(`sitemap ${sitemapUrl}: HTTP ${res.status}`);
      check.sitemap_contains = false;
    } else {
      const xml = await res.text();
      check.sitemap_contains = xml.includes(targetUrl);
      if (!check.sitemap_contains) errors.push(`sitemap nao contem ${targetUrl}`);
    }
  } catch (e) {
    errors.push(`sitemap fetch falhou: ${(e as Error).message}`);
    check.sitemap_contains = false;
  }

  // 2) HTTP GET na URL + noindex
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(15_000), redirect: 'manual' });
    check.http_status = res.status;
    check.status_ok = res.status >= 200 && res.status < 300;
    if (!check.status_ok) errors.push(`URL retornou HTTP ${res.status}`);
    else {
      const html = await res.text();
      const tag = /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i.exec(html);
      check.has_noindex = !!(tag && /noindex/i.test(tag[1] ?? ''));
      if (check.has_noindex) errors.push('URL tem <meta robots="noindex">');
    }
  } catch (e) {
    errors.push(`URL fetch falhou: ${(e as Error).message}`);
    check.status_ok = false;
  }

  // 3) robots.txt
  try {
    const u = new URL(targetUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      errors.push(`robots.txt: HTTP ${res.status}`);
      check.robots_allows = null;
    } else {
      const txt = await res.text();
      // verificacao simplificada: lista todos os Disallow e ve se algum bate com pathname
      const lines = txt.split('\n').map((l) => l.trim());
      let currentUA: string | null = null;
      let starUA = false;
      const disallows: string[] = [];
      for (const line of lines) {
        if (/^user-agent:/i.test(line)) {
          const v = line.split(':')[1]?.trim() ?? '';
          starUA = v === '*';
          currentUA = v;
        } else if (/^disallow:/i.test(line) && starUA) {
          const p = line.split(':')[1]?.trim() ?? '';
          if (p) disallows.push(p);
        }
      }
      const path = u.pathname;
      const blocked = disallows.some((d) => path.startsWith(d));
      check.robots_allows = !blocked;
      if (blocked) errors.push(`robots.txt bloqueia ${path} (${disallows.find((d) => path.startsWith(d))})`);
      void currentUA; // suprime no-unused
    }
  } catch (e) {
    errors.push(`robots fetch falhou: ${(e as Error).message}`);
  }

  log.info({ url: targetUrl, sitemap_ok: check.sitemap_contains, status: check.http_status, noindex: check.has_noindex, robots_ok: check.robots_allows, errs: errors.length }, 'sitemap check');
  return check;
}
