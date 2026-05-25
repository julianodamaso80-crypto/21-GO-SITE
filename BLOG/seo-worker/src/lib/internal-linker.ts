/**
 * Internal Linker — Sprint 5
 *
 * Pos-Writer: injeta 3-5 links contextuais pra artigos relacionados (cosine 0.45-0.75).
 * Bidirectional: ao adicionar link de A pra B, marca pra adicionar link de B pra A
 * no proximo backfill (job assincrono pra nao bloquear publish).
 *
 * Distribuicao de anchor text (best practice 2026):
 *   exact-match 15-25% | partial 30-40% | semantic 25-35% | navigational 5-15%
 *
 * Limites:
 *   - 2-5 contextual links por 1000 palavras
 *   - max 150 links totais por pagina
 *   - cosine target 0.45-0.75 (relacionado mas nao canibal)
 */
import { query, exec } from '../db/pg.js';
import { embedPassage } from './similarity.js';
import { child } from './logger.js';

const log = child('lib:internal-linker');

interface RelatedArticle {
  id: string;
  slug: string;
  title: string;
  main_keyword: string | null;
  cosine: number;
}

interface LinkPlan {
  target_slug: string;
  target_title: string;
  anchor: string;
  anchor_type: 'exact' | 'partial' | 'semantic';
  insert_after_paragraph_idx: number;
}

/**
 * Encontra ate 5 artigos relacionados pelo embedding pgvector,
 * com filtro de cosine 0.45-0.75 (relacionados mas nao canibal).
 */
export async function findRelatedArticles(articleId: string, embedding: number[], limit = 5): Promise<RelatedArticle[]> {
  const vec = '[' + embedding.join(',') + ']';
  return query<RelatedArticle>(
    `SELECT id, slug, title, main_keyword,
            1 - (embedding <=> $1::vector) AS cosine
     FROM seo.articles
     WHERE id != $2
       AND status = 'published'
       AND embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) BETWEEN 0.45 AND 0.75
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vec, articleId, limit],
  );
}

/**
 * Pra cada relacionado, decide ANCHOR e ONDE inserir no body.
 * Variacao de anchor text segue estudo internal linking 2026.
 */
export function planLinks(body: string, related: RelatedArticle[]): LinkPlan[] {
  if (related.length === 0) return [];
  const paragraphs = body.split(/\n\n+/);
  const plans: LinkPlan[] = [];

  for (let i = 0; i < related.length; i++) {
    const r = related[i]!;
    // Distribuicao: 1o exact, 2o partial, 3o-5o semantic
    const anchorType: 'exact' | 'partial' | 'semantic' =
      i === 0 ? 'exact' :
      i === 1 ? 'partial' :
      'semantic';

    const mainKw = r.main_keyword ?? r.title;
    let anchor = '';
    if (anchorType === 'exact') anchor = mainKw;
    else if (anchorType === 'partial') {
      const words = mainKw.split(/\s+/);
      anchor = words.slice(0, Math.max(2, Math.floor(words.length / 2))).join(' ');
    } else {
      // semantic — usar o titulo
      anchor = r.title.length > 60 ? r.title.slice(0, 57) + '...' : r.title;
    }

    // Distribui inserts em paragrafos espacados pelo body
    const idx = Math.min(
      paragraphs.length - 2,
      Math.floor((paragraphs.length / (related.length + 1)) * (i + 1)),
    );
    plans.push({
      target_slug: r.slug,
      target_title: r.title,
      anchor,
      anchor_type: anchorType,
      insert_after_paragraph_idx: idx,
    });
  }
  return plans;
}

/**
 * Injeta os links no body como uma frase contextual.
 * Idempotente: nao injeta se URL ja aparece no body.
 */
export function injectLinks(body: string, plans: LinkPlan[]): { body: string; injected: number } {
  let result = body;
  let injected = 0;
  const paragraphs = result.split(/\n\n+/);

  // Injeta em ordem reversa pra nao bagunçar indices
  const sorted = [...plans].sort((a, b) => b.insert_after_paragraph_idx - a.insert_after_paragraph_idx);

  for (const p of sorted) {
    const url = `/blog/${p.target_slug}`;
    if (result.includes(url)) continue; // ja tem
    const idx = Math.min(p.insert_after_paragraph_idx, paragraphs.length - 1);
    const linkPhrase = `\n\nSe quiser entender melhor sobre temas relacionados, veja tambem [${p.anchor}](${url}).`;
    paragraphs[idx] = (paragraphs[idx] ?? '') + linkPhrase;
    injected++;
  }
  return { body: paragraphs.join('\n\n'), injected };
}

/**
 * Marca pro backfill bidirecional: artigos relacionados vao receber link de volta no proximo cron.
 */
export async function queueBidirectionalLinks(sourceArticleId: string, related: RelatedArticle[]): Promise<void> {
  for (const r of related) {
    await exec(
      `INSERT INTO seo.indexing_log (article_id, url, channel, action, response_body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        r.id,
        `pending-backlink-from:${sourceArticleId}`,
        'bidirectional_link',
        'queue',
        { source_article_id: sourceArticleId },
      ],
    ).catch((e) => log.warn({ err: (e as Error).message }, 'queue bidirectional falhou'));
  }
}

/**
 * Pipeline completo: chama do Writer apos gerar body.
 * Retorna body com links injetados + count.
 */
export async function injectInternalLinks(
  articleId: string,
  body: string,
  title: string,
): Promise<{ body: string; injected: number; related_count: number }> {
  try {
    const emb = await embedPassage(`${title}. ${body.slice(0, 2000)}`);
    const related = await findRelatedArticles(articleId, emb, 5);
    log.info({ articleId, related_count: related.length }, 'artigos relacionados encontrados');
    if (related.length === 0) return { body, injected: 0, related_count: 0 };
    const plans = planLinks(body, related);
    const { body: newBody, injected } = injectLinks(body, plans);
    await queueBidirectionalLinks(articleId, related).catch(() => {});
    return { body: newBody, injected, related_count: related.length };
  } catch (e) {
    log.warn({ err: (e as Error).message, articleId }, 'internal linker falhou — seguindo sem');
    return { body, injected: 0, related_count: 0 };
  }
}
