/**
 * Agente 12 — Bing + IndexNow (multi-dominio)
 *
 * Para CADA dominio em PUBLISH_DOMAINS (21go.site + 21goconsultoraleticya.site):
 *  - Bing Webmaster Tools: SubmitUrl + SubmitFeed (sitemap)
 *  - IndexNow API: POST com a URL na lista
 *
 * Regra: TODO blog publicado deve ser indexado em TODOS os dominios.
 * Nunca esquecer nenhum (decisao user 2026-05-22).
 *
 * Tudo logado em seo.indexing_log com response real (url contem o host).
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import * as bing from '../integrations/bing.js';
import * as indexnow from '../integrations/indexnow.js';
import { logIndexing } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { PUBLISH_DOMAINS, urlFor } from '../lib/publish-domains.js';
import { child } from '../lib/logger.js';

const log = child('agent:12-bing-indexnow');

interface Input {
  article: ArticleRow;
}

interface Output {
  domains_processed: number;
  bing_url_ok: number;
  bing_sitemap_ok: number;
  indexnow_ok: number;
  errors: string[];
}

export const agent12: Agent<Input, Output> = {
  id: '12-bing-indexnow',
  description: 'Submete URL + sitemap pro Bing + IndexNow em TODOS os dominios',
  async run(input, ctx) {
    const a = input.article;
    const errors: string[] = [];
    let bingUrlOk = 0;
    let bingSmOk = 0;
    let inOk = 0;

    for (const dom of PUBLISH_DOMAINS) {
      const articleUrl = urlFor(dom, a.slug);

      // ===== Bing SubmitUrl =====
      if (config.BING_API_KEY) {
        try {
          const r = await bing.submitUrl(articleUrl, dom.bingSite);
          if (r.ok) bingUrlOk++;
          if (!ctx.dry_run) await logIndexing({
            article_id: a.id, url: articleUrl, channel: 'bing_wmt', action: 'submit',
            response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
          });
        } catch (e) {
          const msg = (e as Error).message;
          errors.push(`[${dom.host}] bing url: ${msg}`);
          if (!ctx.dry_run) await logIndexing({ article_id: a.id, url: articleUrl, channel: 'bing_wmt', action: 'submit', error: msg }).catch(() => {});
        }

        try {
          const r = await bing.submitSitemap(dom.sitemap, dom.bingSite);
          if (r.ok) bingSmOk++;
          if (!ctx.dry_run) await logIndexing({
            article_id: a.id, url: dom.sitemap, channel: 'bing_wmt', action: 'submit',
            response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
          });
        } catch (e) {
          const msg = (e as Error).message;
          errors.push(`[${dom.host}] bing sitemap: ${msg}`);
        }
      } else {
        log.warn('Pendente de credencial: BING_API_KEY — Bing pulado');
      }

      // ===== IndexNow =====
      if (config.INDEXNOW_KEY) {
        try {
          const r = await indexnow.submit([articleUrl]);
          if (r.ok) inOk++;
          if (!ctx.dry_run) await logIndexing({
            article_id: a.id, url: articleUrl, channel: 'indexnow', action: 'submit',
            response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
          });
        } catch (e) {
          const msg = (e as Error).message;
          errors.push(`[${dom.host}] indexnow: ${msg}`);
          if (!ctx.dry_run) await logIndexing({ article_id: a.id, url: articleUrl, channel: 'indexnow', action: 'submit', error: msg }).catch(() => {});
        }
      } else {
        log.warn('Pendente de credencial: INDEXNOW_KEY — IndexNow pulado');
      }
    }

    log.info({ articleId: a.id, domains: PUBLISH_DOMAINS.length, bingUrlOk, bingSmOk, inOk, errs: errors.length }, 'bing + indexnow multi-dominio');
    return { output: { domains_processed: PUBLISH_DOMAINS.length, bing_url_ok: bingUrlOk, bing_sitemap_ok: bingSmOk, indexnow_ok: inOk, errors } };
  },
};
