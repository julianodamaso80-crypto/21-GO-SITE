/**
 * Agente 10 — Sitemap
 *
 * Apos publicacao, valida que a URL esta:
 *  1. No sitemap publicado
 *  2. Retornando 200
 *  3. Sem noindex
 *  4. Permitida em robots.txt
 *
 * Loga em seo.indexing_log (channel='sitemap', action='validate').
 *
 * Nao tenta reconstruir o sitemap manualmente — o next-sitemap do site
 * regenera automaticamente apos o rebuild do EasyPanel.
 */
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { checkUrl, type SitemapCheck } from '../integrations/sitemap.js';
import { logIndexing } from '../db/repositories/indexing.js';
import { child } from '../lib/logger.js';

const log = child('agent:10-sitemap');

const SITEMAP_URL = 'https://21go.site/sitemap.xml';

interface Input {
  article: ArticleRow;
}

interface Output {
  check: SitemapCheck;
  ok: boolean;
}

export const agent10: Agent<Input, Output> = {
  id: '10-sitemap',
  description: 'Valida URL no sitemap + status HTTP + robots.txt',
  async run(input, ctx) {
    const a = input.article;
    log.info({ articleId: a.id, url: a.url }, 'verificando sitemap');

    const check = await checkUrl(a.url, SITEMAP_URL);

    const overall_ok =
      check.sitemap_contains === true &&
      check.status_ok === true &&
      check.has_noindex === false &&
      check.robots_allows !== false;

    if (!ctx.dry_run) {
      await logIndexing({
        article_id: a.id,
        url: a.url,
        channel: 'sitemap',
        action: 'validate',
        response_status: check.http_status ?? undefined,
        response_body: { check },
        error: check.errors.length > 0 ? check.errors.join('; ') : undefined,
      });
    }

    return { output: { check, ok: overall_ok } };
  },
};
