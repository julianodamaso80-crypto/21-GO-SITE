-- =============================================================================
-- 210_hybrid_search_rrf.sql
-- FASE 1.E — Hybrid search com RRF (Reciprocal Rank Fusion)
--
-- Adiciona tsvector PT-BR em ai.knowledge_chunks + ai.conversation_chunks
-- Cria 2 funções: hybrid_search_knowledge() e hybrid_search_conversations()
-- =============================================================================

-- ─── tsvector PT-BR em ai.knowledge_chunks ───
ALTER TABLE ai.knowledge_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS ix_kc_tsv ON ai.knowledge_chunks USING gin(tsv);

-- ─── tsvector PT-BR em ai.conversation_chunks ───
ALTER TABLE ai.conversation_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS ix_cc_tsv ON ai.conversation_chunks USING gin(tsv);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.hybrid_search_knowledge — busca hibrida na knowledge base
-- Vetorial top-50 + BM25 PT top-50 → RRF k=60 → top-K
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ai.hybrid_search_knowledge(
  query_text       text,
  query_embedding  extensions.vector(1024),
  top_k            int DEFAULT 10,
  source_filter    text DEFAULT NULL
) RETURNS TABLE (
  id            uuid,
  source        text,
  source_doc_id text,
  content       text,
  metadata      jsonb,
  rrf_score     float,
  vec_rank      int,
  bm_rank       int
) LANGUAGE sql STABLE AS $$
  WITH vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding)::int AS rank
    FROM ai.knowledge_chunks
    WHERE embedding IS NOT NULL
      AND (source_filter IS NULL OR source = source_filter)
    ORDER BY embedding <=> query_embedding
    LIMIT 50
  ),
  bm AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(tsv, plainto_tsquery('portuguese', query_text)) DESC
    )::int AS rank
    FROM ai.knowledge_chunks
    WHERE tsv @@ plainto_tsquery('portuguese', query_text)
      AND (source_filter IS NULL OR source = source_filter)
    LIMIT 50
  )
  SELECT
    k.id, k.source, k.source_doc_id, k.content, k.metadata,
    (COALESCE(1.0::float / (60 + v.rank), 0) + COALESCE(1.0::float / (60 + b.rank), 0))::float AS rrf_score,
    v.rank AS vec_rank,
    b.rank AS bm_rank
  FROM ai.knowledge_chunks k
  LEFT JOIN vec v ON v.id = k.id
  LEFT JOIN bm  b ON b.id = k.id
  WHERE v.id IS NOT NULL OR b.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT top_k;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.hybrid_search_conversations — busca em conversas reais com filtros
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ai.hybrid_search_conversations(
  query_text          text,
  query_embedding     extensions.vector(1024),
  top_k               int DEFAULT 10,
  outcome_filter      text DEFAULT NULL,
  vehicle_type_filter text DEFAULT NULL,
  only_with_price     boolean DEFAULT false
) RETURNS TABLE (
  id              uuid,
  conversation_id uuid,
  contact_id      uuid,
  content         text,
  outcome         text,
  vehicle_type    text,
  contains_price  boolean,
  contains_fipe   boolean,
  msg_count       int,
  metadata        jsonb,
  rrf_score       float
) LANGUAGE sql STABLE AS $$
  WITH vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding)::int AS rank
    FROM ai.conversation_chunks
    WHERE embedding IS NOT NULL
      AND (outcome_filter IS NULL OR outcome = outcome_filter)
      AND (vehicle_type_filter IS NULL OR vehicle_type = vehicle_type_filter)
      AND (NOT only_with_price OR contains_price = true)
    ORDER BY embedding <=> query_embedding
    LIMIT 50
  ),
  bm AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(tsv, plainto_tsquery('portuguese', query_text)) DESC
    )::int AS rank
    FROM ai.conversation_chunks
    WHERE tsv @@ plainto_tsquery('portuguese', query_text)
      AND (outcome_filter IS NULL OR outcome = outcome_filter)
      AND (vehicle_type_filter IS NULL OR vehicle_type = vehicle_type_filter)
      AND (NOT only_with_price OR contains_price = true)
    LIMIT 50
  )
  SELECT
    cc.id, cc.conversation_id, cc.contact_id, cc.content,
    cc.outcome, cc.vehicle_type, cc.contains_price, cc.contains_fipe,
    cc.msg_count, cc.metadata,
    (COALESCE(1.0::float / (60 + v.rank), 0) + COALESCE(1.0::float / (60 + b.rank), 0))::float AS rrf_score
  FROM ai.conversation_chunks cc
  LEFT JOIN vec v ON v.id = cc.id
  LEFT JOIN bm  b ON b.id = cc.id
  WHERE v.id IS NOT NULL OR b.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT top_k;
$$;

-- ─── Permissões ───
GRANT EXECUTE ON FUNCTION ai.hybrid_search_knowledge(text, extensions.vector, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ai.hybrid_search_conversations(text, extensions.vector, int, text, text, boolean) TO authenticated, service_role;
