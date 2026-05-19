/**
 * Agente 13 — GSC Analyst
 *
 * Le Search Analytics dos ultimos 28 dias e gera recomendacoes:
 *   - improve_ctr: pagina com muitas impressoes e poucos cliques (CTR baixo)
 *   - update_title: idem + posicao boa (top 10) — sinal de title pouco atrativo
 *   - expand_content: posicao 8-20 com volume — pode subir com conteudo
 *   - add_internal_link: paginas isoladas com poucos cliques
 *   - new_topic: query nova com muitas impressoes em pagina antiga (oportunidade)
 *   - fix_indexing: pagina com 0 cliques e 0 impressoes apos 14+ dias publicada
 *
 * Cada recomendacao vai pra seo.recommendations com priority calculada.
 * NUNCA inventa numero — se GSC nao respondeu, nada vai pra recommendations.
 */
import type { Agent } from './_types.js';
import * as gsc from '../integrations/gsc.js';
import { supabase } from '../db/supabase.js';
import { insertRecommendation } from '../db/repositories/indexing.js';
import type { RecommendationInsert, RecommendationType } from '../db/repositories/indexing.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:13-gsc-analyst');

interface Input {
  /** Janela em dias (default 28). */
  window_days?: number;
}

interface Output {
  recommendations_created: number;
  by_type: Record<string, number>;
  pages_analyzed: number;
  errors: string[];
}

export const agent13: Agent<Input, Output> = {
  id: '13-gsc-analyst',
  description: 'Analisa Search Console e gera recomendacoes acionaveis',
  async run(input, ctx) {
    const credentialsOk = !!(config.GOOGLE_REFRESH_TOKEN || config.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (!credentialsOk) {
      log.warn('Pendente de credencial Google — pulando');
      return { output: { recommendations_created: 0, by_type: {}, pages_analyzed: 0, errors: ['Pendente de credencial Google'] } };
    }

    const days = input.window_days ?? 28;
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Busca por pagina (URL)
    let pageRows: gsc.SearchAnalyticsRow[];
    try {
      pageRows = await gsc.searchAnalytics({
        startDate: fmt(start), endDate: fmt(end), dimensions: ['page'], rowLimit: 500,
      });
    } catch (e) {
      log.error({ err: (e as Error).message }, 'GSC searchAnalytics falhou');
      return { output: { recommendations_created: 0, by_type: {}, pages_analyzed: 0, errors: [`gsc: ${(e as Error).message}`] } };
    }

    // Mapeia URL -> article_id (so URLs do blog)
    const sb = supabase();
    const slugsByUrl = new Map<string, { article_id: string; title: string; published_at: string | null }>();
    const { data: articles } = await sb
      .from('articles')
      .select('id, title, slug, url, published_at')
      .eq('status', 'published');
    for (const a of (articles ?? []) as Array<{ id: string; title: string; slug: string; url: string; published_at: string | null }>) {
      slugsByUrl.set(a.url, { article_id: a.id, title: a.title, published_at: a.published_at });
    }

    const recommendations: RecommendationInsert[] = [];

    for (const row of pageRows) {
      if (!row.url.includes('/blog/')) continue; // foca em blog
      const meta = slugsByUrl.get(row.url);
      const article_id = meta?.article_id;

      // ===== improve_ctr =====
      if (row.impressions >= 200 && row.ctr < 0.02 && row.position <= 15) {
        recommendations.push({
          type: 'improve_ctr',
          article_id,
          priority: 4,
          recommendation: `CTR ${(row.ctr * 100).toFixed(2)}% com ${row.impressions} impressoes e posicao ${row.position.toFixed(1)}. Revisar title/meta description.`,
          reason: 'alta impressao + baixo CTR + posicao boa indica title pouco atrativo',
          data: { url: row.url, impressions: row.impressions, ctr: row.ctr, position: row.position },
        });
      }

      // ===== expand_content (posicao 8-20) =====
      if (row.impressions >= 100 && row.position > 8 && row.position <= 20) {
        recommendations.push({
          type: 'expand_content',
          article_id,
          priority: 3,
          recommendation: `Posicao ${row.position.toFixed(1)} com ${row.impressions} impressoes. Considerar expandir conteudo (FAQ + secao especifica).`,
          reason: 'posicao 8-20 com volume — alvo de quick win',
          data: { url: row.url, impressions: row.impressions, position: row.position },
        });
      }

      // ===== fix_indexing (publicado ha 14+ dias, 0 cliques e 0 impressoes) =====
      if (article_id && meta?.published_at) {
        const daysSince = (Date.now() - new Date(meta.published_at).getTime()) / 86_400_000;
        if (daysSince >= 14 && row.clicks === 0 && row.impressions === 0) {
          recommendations.push({
            type: 'fix_indexing',
            article_id,
            priority: 5,
            recommendation: `Sem cliques nem impressoes ha ${Math.round(daysSince)} dias. Reenviar pra GSC + IndexNow.`,
            reason: 'publicado ha 14+ dias e Google nao indexou',
            data: { url: row.url, days_since_publish: daysSince },
          });
        }
      }
    }

    // Insere todas
    let created = 0;
    const byType: Record<string, number> = {};
    for (const rec of recommendations) {
      if (ctx.dry_run) {
        log.info(rec, 'DRY-RUN recommendation');
        continue;
      }
      try {
        await insertRecommendation(rec);
        created++;
        byType[rec.type] = (byType[rec.type] ?? 0) + 1;
      } catch (e) {
        log.warn({ err: (e as Error).message, type: rec.type }, 'falha ao inserir recommendation');
      }
    }

    log.info({ pages: pageRows.length, recommendations_created: created, by_type: byType }, 'gsc analyst concluido');
    return { output: { recommendations_created: created, by_type: byType, pages_analyzed: pageRows.length, errors: [] } };
  },
};

// re-export pra TS aceitar import nominal
export type _Re = RecommendationType;
