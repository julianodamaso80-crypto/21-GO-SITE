/**
 * Agente 11 — Google Indexing
 *
 * Apos publicacao:
 *  1. Submete sitemap pra Google Search Console (idempotente)
 *  2. URL Inspection — confere se URL ja foi descoberta/indexada
 *
 * NUNCA promete indexacao imediata — Google decide.
 * Loga TUDO em seo.indexing_log com response real.
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import * as gsc from '../integrations/gsc.js';
import { logIndexing } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:11-google-indexing');

const SITEMAP_URL = 'https://21go.site/sitemap.xml';

interface Input {
  article: ArticleRow;
}

interface Output {
  sitemap_submitted: boolean;
  url_inspected: boolean;
  inspection_verdict?: string;
  errors: string[];
}

export const agent11: Agent<Input, Output> = {
  id: '11-google-indexing',
  description: 'Submete sitemap pra GSC + URL Inspection do artigo',
  async run(input, ctx) {
    const a = input.article;
    const errors: string[] = [];

    const credentialsOk = !!config.GOOGLE_REFRESH_TOKEN;
    if (!credentialsOk) {
      log.warn('Pendente de credencial: Google OAuth ou Service Account');
      return { output: { sitemap_submitted: false, url_inspected: false, errors: ['Pendente de credencial Google'] } };
    }

    // ===== 1) Sitemap submit =====
    let sitemapOk = false;
    try {
      const r = await gsc.submitSitemap(SITEMAP_URL);
      sitemapOk = r.ok;
      if (!ctx.dry_run) {
        await logIndexing({
          article_id: a.id,
          url: SITEMAP_URL,
          channel: 'google_gsc',
          action: 'submit',
          response_status: r.status,
          response_body: r,
          error: r.ok ? undefined : 'sitemap submit retornou nao-OK',
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`sitemap submit: ${msg}`);
      if (!ctx.dry_run) {
        await logIndexing({
          article_id: a.id, url: SITEMAP_URL, channel: 'google_gsc', action: 'submit', error: msg,
        }).catch(() => {/* nada — ja em erro */});
      }
    }

    // ===== 2) URL Inspection =====
    let inspectionVerdict: string | undefined;
    let inspectedOk = false;
    try {
      const r = await gsc.urlInspection(a.url);
      inspectedOk = r.ok;
      if (r.ok && r.data) {
        const data = r.data as { inspectionResult?: { indexStatusResult?: { coverageState?: string; verdict?: string } } };
        inspectionVerdict = data.inspectionResult?.indexStatusResult?.verdict ?? data.inspectionResult?.indexStatusResult?.coverageState;
      }
      if (!ctx.dry_run) {
        await logIndexing({
          article_id: a.id,
          url: a.url,
          channel: 'url_inspection',
          action: 'validate',
          response_status: r.status,
          response_body: r.ok ? r.data : { error: r.error },
          error: r.ok ? undefined : r.error,
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`url inspection: ${msg}`);
      if (!ctx.dry_run) {
        await logIndexing({
          article_id: a.id, url: a.url, channel: 'url_inspection', action: 'validate', error: msg,
        }).catch(() => {/* */});
      }
    }

    log.info({ articleId: a.id, sitemapOk, inspectedOk, verdict: inspectionVerdict, errs: errors.length }, 'google indexing');
    return {
      output: { sitemap_submitted: sitemapOk, url_inspected: inspectedOk, inspection_verdict: inspectionVerdict, errors },
    };
  },
};
