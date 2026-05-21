/**
 * Agente 12 — Bing + IndexNow
 *
 * Submete o MESMO conteudo do Google (URL nova) pro:
 *  - Bing Webmaster Tools: SubmitUrl + SubmitFeed (sitemap)
 *  - IndexNow API: POST com a URL na lista
 *
 * Tudo logado em seo.indexing_log com response real.
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import * as bing from '../integrations/bing.js';
import * as indexnow from '../integrations/indexnow.js';
import { logIndexing } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:12-bing-indexnow');

const SITEMAP_URL = 'https://21go.site/sitemap.xml';

interface Input {
  article: ArticleRow;
}

interface Output {
  bing_url_ok: boolean;
  bing_sitemap_ok: boolean;
  indexnow_ok: boolean;
  errors: string[];
}

export const agent12: Agent<Input, Output> = {
  id: '12-bing-indexnow',
  description: 'Submete URL + sitemap pro Bing + IndexNow',
  async run(input, ctx) {
    const a = input.article;
    const errors: string[] = [];
    let bingUrl = false;
    let bingSitemap = false;
    let inOk = false;

    // ===== Bing SubmitUrl =====
    if (config.BING_API_KEY) {
      try {
        const r = await bing.submitUrl(a.url);
        bingUrl = r.ok;
        if (!ctx.dry_run) await logIndexing({
          article_id: a.id, url: a.url, channel: 'bing_wmt', action: 'submit',
          response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
        });
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`bing url: ${msg}`);
        if (!ctx.dry_run) await logIndexing({
          article_id: a.id, url: a.url, channel: 'bing_wmt', action: 'submit', error: msg,
        }).catch(() => {/* */});
      }

      try {
        const r = await bing.submitSitemap(SITEMAP_URL);
        bingSitemap = r.ok;
        if (!ctx.dry_run) await logIndexing({
          article_id: a.id, url: SITEMAP_URL, channel: 'bing_wmt', action: 'submit',
          response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
        });
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`bing sitemap: ${msg}`);
      }
    } else {
      log.warn('Pendente de credencial: BING_API_KEY — Bing pulado');
    }

    // ===== IndexNow =====
    if (config.INDEXNOW_KEY && config.INDEXNOW_KEY_LOCATION) {
      try {
        const r = await indexnow.submit([a.url]);
        inOk = r.ok;
        if (!ctx.dry_run) await logIndexing({
          article_id: a.id, url: a.url, channel: 'indexnow', action: 'submit',
          response_status: r.status, response_body: r, error: r.ok ? undefined : r.body,
        });
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`indexnow: ${msg}`);
        if (!ctx.dry_run) await logIndexing({
          article_id: a.id, url: a.url, channel: 'indexnow', action: 'submit', error: msg,
        }).catch(() => {/* */});
      }
    } else {
      log.warn('Pendente de credencial: INDEXNOW_KEY/_LOCATION — IndexNow pulado');
    }

    log.info({ articleId: a.id, bingUrl, bingSitemap, inOk, errs: errors.length }, 'bing + indexnow');
    return { output: { bing_url_ok: bingUrl, bing_sitemap_ok: bingSitemap, indexnow_ok: inOk, errors } };
  },
};
