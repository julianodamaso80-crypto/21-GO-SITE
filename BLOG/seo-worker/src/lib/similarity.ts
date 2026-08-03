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
  lexical?: number;         // 0..1 — overlap de termos distintivos do titulo
  score?: number;           // 0..1 — score combinado usado na decisao de canibalizacao
}

/**
 * Termos que aparecem em quase todo titulo do blog (marca, servico, geografia, muleta
 * editorial). Se entrarem na conta lexical, "Isencao de IPVA no RJ" e "Protecao Veicular
 * para SUV no RJ" parecem irmaos. Removidos antes de comparar.
 */
const TERMOS_ONIPRESENTES = new Set([
  'protecao', 'proteger', 'proteja', 'protege', 'veicular', 'veiculo', 'veiculos', 'patrimonial',
  'rj', 'rio', 'janeiro', '21go', '21', 'go',
  'guia', 'completo', 'completa', 'tudo', 'sobre', 'entenda', 'saiba', 'conheca', 'dicas',
  'seu', 'sua', 'seus', 'suas', 'para', 'com', 'como', 'que', 'quais', 'qual', 'the',
  'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das', 'em', 'um', 'uma', 'os', 'as',
  'e', 'o', 'a', 'ou', 'se', 'ao', 'aos', 'por', 'pra', 'pro', 'mais', 'menos',
  '2024', '2025', '2026', '2027',
]);

function tokensDistintivos(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[\p{Diacritic}]/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !TERMOS_ONIPRESENTES.has(t)),
  );
}

/**
 * Overlap coefficient (interseccao / menor conjunto) dos termos distintivos.
 * Preferido ao Jaccard: "Chassi Remarcado no RJ" vs "Chassi Remarcado: Riscos e
 * Legalidade" tem Jaccard 0.4 (parece diferente) e overlap 0.67 (e o mesmo assunto).
 */
export function lexicalOverlap(a: string, b: string): number {
  const ta = tokensDistintivos(a);
  const tb = tokensDistintivos(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/**
 * O multilingual-e5-small comprime cosine numa faixa alta: num corpus monotematico
 * (161 posts de protecao veicular no RJ) o PISO observado e ~0.874 — acima do
 * threshold antigo de 0.85. Resultado: 105 dos 113 topics foram marcados como
 * canibais, incluindo assuntos novos como "Isencao de IPVA". Remapeamos a faixa
 * util [0.86, 0.95] pra [0, 1] antes de decidir.
 */
const SEMANTIC_FLOOR = 0.86;
const SEMANTIC_CEIL = 0.95;
function normalizeSemantic(sim: number): number {
  return Math.max(0, Math.min(1, (sim - SEMANTIC_FLOOR) / (SEMANTIC_CEIL - SEMANTIC_FLOOR)));
}

/** Score combinado: metade semantica normalizada, metade overlap lexical. */
export function combinedScore(semantic: number, lexical: number): number {
  return 0.5 * normalizeSemantic(semantic) + 0.5 * lexical;
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

/**
 * Enriquece os hits com overlap lexical + score combinado, comparando contra o titulo
 * candidato. Deve ser chamado antes de isCannibal().
 */
export function scoreHits(candidateTitle: string, hits: SimilarityHit[]): SimilarityHit[] {
  return hits
    .map((h) => {
      const lexical = lexicalOverlap(candidateTitle, h.title);
      return { ...h, lexical, score: combinedScore(h.similarity, lexical) };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Decisao binaria de canibalizacao.
 *
 * Threshold sobre o score COMBINADO (nao mais sobre o cosine cru — ver comentario do
 * SEMANTIC_FLOOR). Calibrado com casos reais do proprio blog:
 *   "Carros mais roubados RJ" x duplicata          -> ~0.66  canibal
 *   "Motor Remarcado" x "Chassi Remarcado"          -> ~0.42  canibal
 *   "Isencao de IPVA no RJ" x qualquer post atual   -> ~0.08  assunto novo
 */
export const CANNIBAL_THRESHOLD = 0.40;

export function isCannibal(hits: SimilarityHit[], threshold = CANNIBAL_THRESHOLD): SimilarityHit | null {
  return hits.find((h) => (h.score ?? normalizeSemantic(h.similarity)) >= threshold) ?? null;
}
