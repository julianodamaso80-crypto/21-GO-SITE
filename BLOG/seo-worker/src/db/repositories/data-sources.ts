/**
 * Repository: seo.data_sources
 *
 * Sprint 2 — Information Gain. Cada artigo gerado pelo Writer precisa puxar
 * 3+ dados unicos dessa tabela e mencionar fonte + fact + source_url.
 */
import { query, exec } from '../pg.js';

export interface DataSource {
  id: string;
  type: 'estatistica' | 'tabela' | 'caso' | 'norma' | 'calculo' | 'localizacao';
  topic_tags: string[];
  title: string;
  fact: string;
  source_name: string;
  source_url: string | null;
  valid_until: string | null;
}

/**
 * Retorna ate `limit` data sources relevantes para os tags do topic.
 * Prioriza: matching de tags > recencia > variedade de tipos.
 */
export async function pickRelevantSources(tags: string[], limit = 6): Promise<DataSource[]> {
  if (tags.length === 0) {
    return query<DataSource>(
      `SELECT id, type, topic_tags, title, fact, source_name, source_url, valid_until::text
       FROM seo.data_sources
       WHERE valid_until IS NULL OR valid_until >= now()
       ORDER BY random() LIMIT $1`,
      [limit],
    );
  }
  return query<DataSource>(
    `SELECT id, type, topic_tags, title, fact, source_name, source_url, valid_until::text,
            cardinality(array(SELECT unnest(topic_tags) INTERSECT SELECT unnest($1::text[]))) AS overlap
     FROM seo.data_sources
     WHERE (valid_until IS NULL OR valid_until >= now())
     ORDER BY overlap DESC, random()
     LIMIT $2`,
    [tags, limit],
  );
}

export async function insertDataSource(d: Omit<DataSource, 'id'>): Promise<void> {
  await exec(
    `INSERT INTO seo.data_sources (type, topic_tags, title, fact, source_name, source_url, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [d.type, d.topic_tags, d.title, d.fact, d.source_name, d.source_url, d.valid_until],
  );
}

export function formatForPrompt(sources: DataSource[]): string {
  if (sources.length === 0) return '(sem dados especificos no banco — improvisar com cuidado)';
  return sources
    .map((s, i) => `  ${i + 1}. [${s.type}] ${s.fact} — Fonte: ${s.source_name}${s.source_url ? ` (${s.source_url})` : ''}`)
    .join('\n');
}
