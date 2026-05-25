/**
 * Backfill: classifica os 80+ artigos existentes em clusters via embedding.
 *
 * Estrategia: cada cluster tem main_keywords + descricao. Geramos embedding
 * desse texto e fazemos cosine vs embedding de cada artigo. Atribui cluster
 * com maior similarity (so se cosine > 0.4).
 */
import { query, exec, closePool } from '../db/pg.js';
import { embedPassage } from '../lib/similarity.js';
import { logger } from '../lib/logger.js';

interface Cluster {
  id: string;
  slug: string;
  title: string;
  description: string;
  main_keywords: string[];
  category: string;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  embedding_text: string | null;
}

function parseVector(s: string | null): number[] | null {
  if (!s) return null;
  const trimmed = s.replace(/^\[|\]$/g, '');
  return trimmed.split(',').map((n) => parseFloat(n));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function main() {
  const clusters = await query<Cluster>(
    `SELECT id, slug, title, description, main_keywords, category FROM seo.clusters ORDER BY slug`,
  );
  logger.info({ count: clusters.length }, 'clusters carregados');

  // Pre-computa embeddings dos clusters
  const clusterEmbs: Array<{ cluster: Cluster; emb: number[] }> = [];
  for (const c of clusters) {
    const text = `${c.title}. ${c.description}. ${(c.main_keywords ?? []).join('. ')}`;
    const emb = await embedPassage(text);
    clusterEmbs.push({ cluster: c, emb });
  }

  // Pega artigos sem cluster
  const articles = await query<Article>(
    `SELECT id, slug, title, category, embedding::text AS embedding_text
     FROM seo.articles
     WHERE company_id='company-21go' AND cluster_id IS NULL AND embedding IS NOT NULL`,
  );
  logger.info({ count: articles.length }, 'artigos sem cluster_id');

  let attributed = 0;
  for (const a of articles) {
    const emb = parseVector(a.embedding_text);
    if (!emb) continue;

    let best: { cluster: Cluster; sim: number } | null = null;
    for (const { cluster, emb: clusterEmb } of clusterEmbs) {
      let sim = cosine(emb, clusterEmb);
      if (cluster.category === a.category) sim += 0.1;
      if (!best || sim > best.sim) best = { cluster, sim };
    }

    if (best && best.sim >= 0.4) {
      // Define funnel_stage heuristica: titulo com "vs" ou "diferenca" = mid; "preco|quanto|contratar" = bottom; default top
      const lt = a.title.toLowerCase();
      const funnelStage =
        /\bvs\b|\bdiferenca|\bcomparar|\bcomparacao/.test(lt) ? 'mid' :
        /\bpreco|\bquanto custa|\bcontratar|\bcotacao|\bvale a pena/.test(lt) ? 'bottom' :
        'top';

      await exec(
        `UPDATE seo.articles SET cluster_id=$1, funnel_stage=$2 WHERE id=$3`,
        [best.cluster.id, funnelStage, a.id],
      );
      attributed++;
      logger.debug({ slug: a.slug, cluster: best.cluster.slug, sim: best.sim.toFixed(3), funnelStage }, 'classificado');
    } else {
      logger.debug({ slug: a.slug, max_sim: best?.sim.toFixed(3) }, 'sem cluster (similarity baixa)');
    }
  }

  logger.info({ attributed, total: articles.length }, 'backfill concluido');

  // Stats finais
  const stats = await query<{ cluster: string; n: number }>(
    `SELECT COALESCE(c.slug, '(sem cluster)') AS cluster, count(*)::int AS n
     FROM seo.articles a LEFT JOIN seo.clusters c ON c.id = a.cluster_id
     WHERE a.company_id='company-21go'
     GROUP BY 1 ORDER BY n DESC`,
  );
  console.log('distribuicao final por cluster:');
  for (const s of stats) console.log(`  ${s.cluster}: ${s.n}`);

  await closePool();
}
main().catch((e) => { logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'fatal'); process.exit(1); });
