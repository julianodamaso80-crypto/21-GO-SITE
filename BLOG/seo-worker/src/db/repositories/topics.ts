/**
 * Repository: seo.topics — pautas avaliadas pelo SEOStrategist (via pg direto).
 */
import { query, queryOne, exec } from '../pg.js';
import { config } from '../../config.js';
import type { KeywordCategory, KeywordIntent } from './keywords.js';

export type TopicDecision =
  | 'APROVAR_ARTIGO_NOVO'
  | 'ATUALIZAR_ARTIGO_EXISTENTE'
  | 'VIRAR_SECAO_DE_ARTIGO_EXISTENTE'
  | 'REJEITAR_POR_REPETICAO'
  | 'REJEITAR_FORA_DO_ESCOPO'
  | 'PENDENTE';

export interface TopicInsert {
  title: string;
  main_keyword_id?: string;
  secondary_keywords?: string[];
  category: KeywordCategory;
  intent?: KeywordIntent;
  audience?: string;
  pain_point?: string;
  pillar_page?: string;
  anti_repetition_score?: number;
  similar_articles?: string[];
  decision?: TopicDecision;
  decision_reason?: string;
  target_article_id?: string;
  scheduled_for?: string;
}

export interface TopicRow extends TopicInsert {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export async function insertTopic(t: TopicInsert): Promise<TopicRow> {
  const row = await queryOne<TopicRow>(
    `INSERT INTO seo.topics
       (company_id, title, main_keyword_id, secondary_keywords, category, intent,
        audience, pain_point, pillar_page, anti_repetition_score, similar_articles,
        decision, decision_reason, target_article_id, scheduled_for)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      config.COMPANY_ID, t.title, t.main_keyword_id ?? null,
      t.secondary_keywords ?? null, t.category, t.intent ?? null,
      t.audience ?? null, t.pain_point ?? null, t.pillar_page ?? null,
      t.anti_repetition_score ?? null, t.similar_articles ?? null,
      t.decision ?? 'PENDENTE', t.decision_reason ?? null,
      t.target_article_id ?? null, t.scheduled_for ?? null,
    ],
  );
  if (!row) throw new Error('topics.insert nao retornou row');
  return row;
}

export async function updateDecision(
  id: string,
  decision: TopicDecision,
  reason: string,
  extras: Partial<Pick<TopicRow, 'anti_repetition_score' | 'similar_articles' | 'target_article_id'>> = {},
): Promise<void> {
  await exec(
    `UPDATE seo.topics SET
       decision=$2, decision_reason=$3,
       anti_repetition_score=COALESCE($4, anti_repetition_score),
       similar_articles=COALESCE($5, similar_articles),
       target_article_id=COALESCE($6, target_article_id)
     WHERE id=$1`,
    [
      id, decision, reason,
      extras.anti_repetition_score ?? null,
      extras.similar_articles ?? null,
      extras.target_article_id ?? null,
    ],
  );
}

export async function listApproved(limit = 10): Promise<TopicRow[]> {
  return query<TopicRow>(
    `SELECT * FROM seo.topics
     WHERE company_id=$1 AND decision IN ('APROVAR_ARTIGO_NOVO','ATUALIZAR_ARTIGO_EXISTENTE')
     ORDER BY created_at ASC
     LIMIT $2`,
    [config.COMPANY_ID, limit],
  );
}

export async function getById(id: string): Promise<TopicRow | null> {
  return queryOne<TopicRow>(`SELECT * FROM seo.topics WHERE id=$1`, [id]);
}
