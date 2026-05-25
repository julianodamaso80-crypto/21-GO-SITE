/**
 * Força reindex agressivo de TODOS os artigos publicados:
 *
 * 1. Submit sitemap pros 2 GSCs
 * 2. URL Inspection (GET) pra TODOS os artigos (sinaliza pro Google que existem)
 * 3. IndexNow batch (Bing/Yandex — indexa muito mais rápido que Google)
 * 4. Bing SubmitUrlBatch
 *
 * Não pode forçar indexação no Google, mas pode acelerar via:
 * - Sinalização ativa (URL Inspection acorda crawl)
 * - Bing indexando primeiro (Bing → cross-signal pro Google)
 * - IndexNow notifica Bing/Yandex em segundos
 */
import { query, closePool } from '../db/pg.js';
import { config } from '../config.js';
import { PUBLISH_DOMAINS, urlFor } from '../lib/publish-domains.js';
import { logger } from '../lib/logger.js';

async function main() {
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      refresh_token: config.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const tk = await tokenResp.json() as { access_token: string };
  if (!tk.access_token) { logger.fatal({ tk }, 'no access token'); process.exit(1); }
  logger.info('OAuth token OK');

  // Pega todos os artigos publicados
  const arts = await query<{ id: string; slug: string }>(
    `SELECT id, slug FROM seo.articles WHERE status='published' ORDER BY created_at DESC`,
  );
  logger.info({ count: arts.length, domains: PUBLISH_DOMAINS.length }, 'reindex todos');

  let gscSitemap = 0, gscInspect = 0, bingUrl = 0, indexnowOk = 0;

  // === 1. Sitemap submit pros 2 GSCs ===
  for (const d of PUBLISH_DOMAINS) {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(d.gscSite)}/sitemaps/${encodeURIComponent(d.sitemap)}`;
    const r = await fetch(url, { method: 'PUT', headers: { Authorization: 'Bearer ' + tk.access_token } });
    if (r.ok) gscSitemap++;
    logger.info({ host: d.host, sitemap: d.sitemap, status: r.status }, 'GSC sitemap submit');
  }

  // === 2. URL Inspection (GET) pra cada artigo × cada domínio ===
  // GSC permite ~600/dia. 88 artigos × 2 domínios = 176 calls (safe)
  for (const a of arts) {
    for (const d of PUBLISH_DOMAINS) {
      const fullUrl = urlFor(d, a.slug);
      try {
        const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tk.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionUrl: fullUrl, siteUrl: d.gscSite, languageCode: 'pt-BR' }),
        });
        if (r.ok) gscInspect++;
        // Rate limit ~3 RPS
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        logger.warn({ slug: a.slug, host: d.host, err: (e as Error).message }, 'inspect falhou');
      }
    }
  }

  // === 3. Bing SubmitUrlBatch (até 500 URLs/batch) ===
  for (const d of PUBLISH_DOMAINS) {
    const urls = arts.map((a) => urlFor(d, a.slug));
    // Bing limita 500 URLs/batch
    for (let i = 0; i < urls.length; i += 500) {
      const batch = urls.slice(i, i + 500);
      const r = await fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${config.BING_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: d.bingSite, urlList: batch }),
        },
      );
      if (r.ok) bingUrl += batch.length;
      logger.info({ host: d.host, batch_size: batch.length, status: r.status }, 'Bing batch');
    }
  }

  // === 4. IndexNow batch (até 10000 URLs) ===
  for (const d of PUBLISH_DOMAINS) {
    const urls = arts.map((a) => urlFor(d, a.slug));
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: d.host,
        key: config.INDEXNOW_KEY,
        keyLocation: `https://${d.host}/${config.INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    if (r.status >= 200 && r.status < 300) indexnowOk += urls.length;
    logger.info({ host: d.host, urls: urls.length, status: r.status }, 'IndexNow batch');
  }

  logger.info({
    artigos: arts.length,
    dominios: PUBLISH_DOMAINS.length,
    gsc_sitemaps_ok: gscSitemap,
    gsc_inspections_ok: gscInspect,
    bing_submissions: bingUrl,
    indexnow_submissions: indexnowOk,
  }, '=== FORCE REINDEX COMPLETO ===');

  await closePool();
}
main().catch((e) => { logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'fatal'); process.exit(1); });
