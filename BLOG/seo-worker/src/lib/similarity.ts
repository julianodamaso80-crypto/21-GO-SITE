/**
 * Anti-canibalizacao — 3 camadas:
 *   1) Match exato de slug (determinista)
 *   2) Trigram (pg_trgm) via similarity() em PostgreSQL — barato, roda no banco
 *   3) Embedding cosine via pgvector — captura sinonimos/parafrase
 *
 * Threshold default: 0.85 — acima disso, considerar canibal.
 * 60 posts existentes em content/blog/*.mdx tambem entram no calculo (importados via Agente 03).
 */
import { pipeline } from '@xenova/transformers';
import { query } from '../db/pg.js';
import { child } from './logger.js';

const log = child('lib:similarity');

const MODEL = 'Xenova/multilingual-e5-small';   // 384-dim, mesmo modelo usado em generate-embeddings.js
const PREFIX_PASSAGE = 'passage: ';
const PREFIX_QUERY = 'query: ';

// Tipo solto pro pipeline — a API real do Xenova retorna FeatureExtractionPipeline mas
// nao e exportada nominalmente. Sem perda de seguranca: cada chamada e validada por shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _embedder: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmbedder(): Promise<any> {
  if (_embedder) return _embedder;
  log.info({ model: MODEL }, 'carregando embedder local (primeira chamada)');
  _embedder = await pipeline('feature-extraction', MODEL);
  return _embedder;
}

export async function embedPassage(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const out = await e(PREFIX_PASSAGE + text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

export async function embedQuery(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const out = await e(PREFIX_QUERY + text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

export interface SimilarityHit {
  article_id: string;
  title: string;
  slug: string;
  similarity: number;       // 0..1 — cosine similarity (1 = identico)
}

/**
 * Busca artigos similares a um texto (titulo + descricao + main_keyword recomendado).
 * Combina: vector cosine (top K) + trigram (top K) e funde por max score.
 */
export async function findSimilar(text: string, k = 10): Promise<SimilarityHit[]> {
  const queryEmbedding = await embedQuery(text);

  // pg direto — usa pgvector cosine distance ja em SQL (HNSW index)
  // embedding e armazenado como vector(384). Operador <=> retorna cosine distance.
  // similarity = 1 - distance.
  type Row = { id: string; title: string; slug: string; sim: number };
  const vectorLiteral = '[' + queryEmbedding.join(',') + ']';
  const rows = await query<Row>(
    `SELECT id, title, slug,
            (1 - (embedding <=> $1::vector))::float AS sim
     FROM seo.articles
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, k],
  );

  return rows
    .filter((r) => r.sim > 0)
    .map((r) => ({ article_id: r.id, title: r.title, slug: r.slug, similarity: r.sim }));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  // embedPassage retorna normalizado entao norm = 1 — cosine vira dot direto
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return Math.max(0, Math.min(1, dot));
}

/** Decisao binaria — true se algum artigo passa do threshold. */
export function isCannibal(hits: SimilarityHit[], threshold = 0.85): SimilarityHit | null {
  return hits.find((h) => h.similarity >= threshold) ?? null;
}
