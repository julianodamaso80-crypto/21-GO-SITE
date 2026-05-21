/**
 * Repository: seo.articles + seo.briefings + seo.article_versions (via pg direto).
 */
import { query, queryOne, exec } from '../pg.js';
import { config } from '../../config.js';
import type { KeywordCategory } from './keywords.js';

export type ArticleStatus = 'draft' | 'in_review' | 'approved' | 'awaiting_pr_merge' | 'published' | 'archived' | 'updating';
export type ReviewStatus = 'APROVADO' | 'APROVADO_COM_AJUSTES' | 'REPROVADO';

export interface BriefingInsert {
  topic_id: string;
  seo_title: string;
  h1: string;
  outline: unknown;
  faqs?: unknown;
  internal_links?: unknown;
  legal_notes?: string;
  example_suggestions?: string;
  image_suggestion?: string;
  is_update_of?: string;
  llm_model_used?: string;
}

export interface BriefingRow extends BriefingInsert {
  id: string;
  created_at: string;
}

export async function insertBriefing(b: BriefingInsert): Promise<BriefingRow> {
  const row = await queryOne<BriefingRow>(
    `INSERT INTO seo.briefings
       (topic_id, seo_title, h1, outline, faqs, internal_links, legal_notes,
        example_suggestions, image_suggestion, is_update_of, llm_model_used)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      b.topic_id, b.seo_title, b.h1,
      JSON.stringify(b.outline),
      b.faqs ? JSON.stringify(b.faqs) : null,
      b.internal_links ? JSON.stringify(b.internal_links) : null,
      b.legal_notes ?? null,
      b.example_suggestions ?? null,
      b.image_suggestion ?? null,
      b.is_update_of ?? null,
      b.llm_model_used ?? null,
    ],
  );
  if (!row) throw new Error('briefings.insert nao retornou row');
  return row;
}

export interface ArticleInsert {
  topic_id?: string;
  briefing_id?: string;
  title: string;
  slug: string;
  meta_title?: string;
  meta_description?: string;
  category?: KeywordCategory;
  main_keyword?: string;
  secondary_keywords?: string[];
  mdx_path?: string;
  mdx_content?: string;
  word_count?: number;
  read_time_min?: number;
  status?: ArticleStatus;
}

export interface ArticleRow extends Omit<ArticleInsert, 'mdx_content'> {
  id: string;
  company_id: string;
  url: string;
  status: ArticleStatus;
  review_status: ReviewStatus | null;
  review_notes: string | null;
  mdx_sha: string | null;
  mdx_content: string | null;
  pr_url: string | null;
  pr_branch: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export async function insertArticle(a: ArticleInsert): Promise<ArticleRow> {
  const row = await queryOne<ArticleRow>(
    `INSERT INTO seo.articles
       (company_id, topic_id, briefing_id, title, slug, meta_title, meta_description,
        category, main_keyword, secondary_keywords, mdx_path, mdx_content, word_count, read_time_min, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      config.COMPANY_ID,
      a.topic_id ?? null, a.briefing_id ?? null,
      a.title, a.slug,
      a.meta_title ?? null, a.meta_description ?? null,
      a.category ?? null, a.main_keyword ?? null,
      a.secondary_keywords ?? null,
      a.mdx_path ?? null,
      a.mdx_content ?? null,
      a.word_count ?? null, a.read_time_min ?? null,
      a.status ?? 'draft',
    ],
  );
  if (!row) throw new Error('articles.insert nao retornou row');
  return row;
}

/** Patch dinamico — so atualiza campos passados. */
export async function updateArticle(id: string, patch: Partial<ArticleRow>): Promise<void> {
  const keys = Object.keys(patch).filter((k) => k !== 'id' && (patch as Record<string, unknown>)[k] !== undefined);
  if (keys.length === 0) return;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const k of keys) {
    const v = (patch as Record<string, unknown>)[k];
    // embedding precisa de cast pra vector
    if (k === 'embedding' && Array.isArray(v)) {
      sets.push(`${k} = $${i}::vector`);
      values.push('[' + (v as number[]).join(',') + ']');
    } else if (k === 'secondary_keywords' && Array.isArray(v)) {
      sets.push(`${k} = $${i}`);
      values.push(v);
    } else {
      sets.push(`${k} = $${i}`);
      values.push(v);
    }
    i++;
  }
  values.push(id);
  await exec(`UPDATE seo.articles SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

export async function listAll(opts: { status?: ArticleStatus } = {}): Promise<ArticleRow[]> {
  if (opts.status) {
    return query<ArticleRow>(
      `SELECT * FROM seo.articles WHERE company_id=$1 AND status=$2 ORDER BY created_at DESC`,
      [config.COMPANY_ID, opts.status],
    );
  }
  return query<ArticleRow>(
    `SELECT * FROM seo.articles WHERE company_id=$1 ORDER BY created_at DESC`,
    [config.COMPANY_ID],
  );
}

export async function findBySlug(slug: string): Promise<ArticleRow | null> {
  return queryOne<ArticleRow>(
    `SELECT * FROM seo.articles WHERE company_id=$1 AND slug=$2`,
    [config.COMPANY_ID, slug],
  );
}

export async function getById(id: string): Promise<ArticleRow | null> {
  return queryOne<ArticleRow>(`SELECT * FROM seo.articles WHERE id=$1`, [id]);
}

export async function saveVersion(article_id: string, version: number, mdx_content: string, changed_by: string, diff_summary?: string): Promise<void> {
  await exec(
    `INSERT INTO seo.article_versions (article_id, version, mdx_content, changed_by, diff_summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [article_id, version, mdx_content, changed_by, diff_summary ?? null],
  );
}
