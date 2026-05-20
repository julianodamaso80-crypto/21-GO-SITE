/**
 * Agente 03 — Anti-Repetition / Anti-Canibalizacao
 *
 * Avalia se uma pauta proposta colide com artigos existentes.
 * Combina:
 *   1) Match exato de slug calculado a partir do titulo
 *   2) Cosine similarity em embedding (multilingual-e5-small, 384-dim)
 *   3) Heuristica city-swap (titulo "{tema} em {cidade}")
 *
 * Saida:
 *   - anti_repetition_score: maior similaridade encontrada (0..1)
 *   - similar_articles: ids dos artigos com score >= warn_threshold
 *   - cannibal_with: article que excede block_threshold (se houver)
 *   - city_swap_risk: true se o titulo so contem cidade + termo generico
 */
import type { Agent } from './_types.js';
import { findSimilar, isCannibal, type SimilarityHit } from '../lib/similarity.js';
import { looksLikeCitySwap } from '../lib/scope-guard.js';
import { slugify } from '../lib/mdx.js';
import { findBySlug } from '../db/repositories/articles.js';
import { child } from '../lib/logger.js';

const log = child('agent:03-anti-repetition');

const BLOCK_THRESHOLD = 0.85;
const WARN_THRESHOLD = 0.70;

interface Input {
  title: string;
  main_keyword: string;
  category: string;
  intent?: string;
}

interface Output {
  anti_repetition_score: number;
  similar_articles: string[];
  cannibal_with: { article_id: string; title: string; slug: string; similarity: number } | null;
  slug_collision: { article_id: string; slug: string } | null;
  city_swap_risk: boolean;
  city_detected?: string;
  hits: SimilarityHit[];
}

export const agent03: Agent<Input, Output> = {
  id: '03-anti-repetition',
  description: 'Bloqueia conteudo repetitivo via embedding cosine + slug + city-swap',
  async run(input) {
    // 1) Slug collision (deterministico)
    const slug = slugify(input.title);
    const collision = await findBySlug(slug);
    const slug_collision = collision ? { article_id: collision.id, slug } : null;

    // 2) Embedding similarity
    const probe = `${input.title}. ${input.main_keyword}. categoria: ${input.category}`;
    let hits: SimilarityHit[] = [];
    try {
      hits = await findSimilar(probe, 10);
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'embedding falhou — seguindo sem similarity vetorial');
    }
    const maxScore = hits[0]?.similarity ?? 0;
    const similar = hits.filter((h) => h.similarity >= WARN_THRESHOLD).map((h) => h.article_id);
    const cannibal = isCannibal(hits, BLOCK_THRESHOLD);

    // 3) City swap
    const city = looksLikeCitySwap(input.title);

    log.info({
      title: input.title.slice(0, 80),
      slug,
      maxScore: maxScore.toFixed(3),
      similar_count: similar.length,
      cannibal: !!cannibal,
      slug_collision: !!slug_collision,
      city_risk: city.risky,
    }, 'check repetition');

    return {
      output: {
        anti_repetition_score: maxScore,
        similar_articles: similar,
        cannibal_with: cannibal
          ? { article_id: cannibal.article_id, title: cannibal.title, slug: cannibal.slug, similarity: cannibal.similarity }
          : null,
        slug_collision,
        city_swap_risk: city.risky,
        city_detected: city.city,
        hits,
      },
    };
  },
};
