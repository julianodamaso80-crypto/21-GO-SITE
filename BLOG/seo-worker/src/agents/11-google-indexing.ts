/**
 * Agente 11 — Google Indexing (multi-dominio)
 *
 * Para CADA dominio em PUBLISH_DOMAINS (21go.site + 21goconsultoraleticya.site):
 *  1. Submete sitemap pra GSC (idempotente)
 *  2. URL Inspection — confere se URL ja foi descoberta/indexada
 *
 * Regra: TODO blog publicado deve ser indexado em TODOS os dominios da lista.
 * Nunca esquecer nenhum (decisao user 2026-05-22).
 *
 * Loga TUDO em seo.indexing_log com response real, separado por dominio (url contem o host).
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import * as gsc from '../integrations/gsc.js';
import { logIndexing } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { PUBLISH_DOMAINS, urlFor } from '../lib/publish-domains.js';
import { child } from '../lib/logger.js';

const log = child('agent:11-google-indexing');

interface Input {
  article: ArticleRow;
}

interface Output {
  domains_processed: number;
  sitemaps_submitted: number;
  urls_inspected: number;
  errors: string[];
}

export const agent11: Agent<Input, Output> = {
  id: '11-google-indexing',
  description: 'Submete sitemap pra GSC + URL Inspection em TODOS os dominios',
  async run(input, ctx) {
    const a = input.article;
    const errors: string[] = [];
    let sitemapsOk = 0;
    let inspectedOk = 0;

    if (!config.GOOGLE_REFRESH_TOKEN) {
      log.warn('Pendente de credencial: GOOGLE_REFRESH_TOKEN');
      return { output: { domains_processed: 0, sitemaps_submitted: 0, urls_inspected: 0, errors: ['Pendente de credencial Google'] } };
    }

    for (const dom of PUBLISH_DOMAINS) {
      const articleUrl = urlFor(dom, a.slug);

      // ===== 1) Sitemap submit =====
      try {
        const r = await gsc.submitSitemap(dom.sitemap, dom.gscSite);
        if (r.ok) sitemapsOk++;
        if (!ctx.dry_run) {
          await logIndexing({
            article_id: a.id,
            url: dom.sitemap,
            channel: 'google_gsc',
            action: 'submit',
            response_status: r.status,
            response_body: r,
            error: r.ok ? undefined : `sitemap submit ${dom.host} nao-OK`,
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`[${dom.host}] sitemap: ${msg}`);
        if (!ctx.dry_run) {
          await logIndexing({ article_id: a.id, url: dom.sitemap, channel: 'google_gsc', action: 'submit', error: msg }).catch(() => {});
        }
      }

      // ===== 2) URL Inspection =====
      try {
        const r = await gsc.urlInspection(articleUrl, dom.gscSite);
        if (r.ok) inspectedOk++;
        if (!ctx.dry_run) {
          await logIndexing({
            article_id: a.id,
            url: articleUrl,
            channel: 'url_inspection',
            action: 'validate',
            response_status: r.status,
            response_body: r.ok ? r.data : { error: r.error },
            error: r.ok ? undefined : r.error,
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`[${dom.host}] inspection: ${msg}`);
        if (!ctx.dry_run) {
          await logIndexing({ article_id: a.id, url: articleUrl, channel: 'url_inspection', action: 'validate', error: msg }).catch(() => {});
        }
      }
    }

    log.info({
      articleId: a.id,
      domains: PUBLISH_DOMAINS.length,
      sitemapsOk,
      inspectedOk,
      errs: errors.length,
    }, 'google indexing multi-dominio');

    return {
      output: {
        domains_processed: PUBLISH_DOMAINS.length,
        sitemaps_submitted: sitemapsOk,
        urls_inspected: inspectedOk,
        errors,
      },
    };
  },
};
