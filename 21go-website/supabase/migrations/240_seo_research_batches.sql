-- =============================================================================
-- 240_seo_research_batches.sql
-- Rastreia rodadas semanais de pesquisa (DataForSEO 1x/semana).
-- Permite dedup: nao re-pesquisar seeds que rodaram nos ultimos 7 dias.
-- Permite metricas: cache_hit_rate, custo por semana.
-- =============================================================================

BEGIN;

-- ---------- 1) Tabela de batches ----------
CREATE TABLE IF NOT EXISTS seo.research_batches (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               text NOT NULL DEFAULT 'company-21go' REFERENCES core.companies(id) ON DELETE CASCADE,
  triggered_by             text NOT NULL,           -- 'cron:weekly' | 'manual'
  started_at               timestamptz NOT NULL DEFAULT now(),
  finished_at              timestamptz,
  -- Inputs
  seeds_used               text[] NOT NULL DEFAULT '{}',
  weekly_limit             integer,
  -- Outputs
  keywords_found           integer DEFAULT 0,
  keywords_new             integer DEFAULT 0,        -- keywords que nao existiam antes
  keywords_skipped_cache   integer DEFAULT 0,        -- keywords que vieram do cache (nao chamou DFS)
  topics_approved          integer DEFAULT 0,
  topics_rejected          integer DEFAULT 0,
  briefings_created        integer DEFAULT 0,
  -- Custos
  dataforseo_cost_usd      numeric(10,6) DEFAULT 0,
  dataforseo_calls_made    integer DEFAULT 0,
  llm_cost_usd             numeric(10,6) DEFAULT 0,
  llm_calls_made           integer DEFAULT 0,
  -- Status
  status                   text NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running','success','partial','error')),
  error                    text,
  notes                    text
);

CREATE INDEX idx_seo_research_batches_started ON seo.research_batches(company_id, started_at DESC);
CREATE INDEX idx_seo_research_batches_status  ON seo.research_batches(status, started_at DESC);

COMMENT ON TABLE seo.research_batches IS
  'Cada execucao semanal de pesquisa = 1 row. Usado pra dedup (nao re-pesquisar seeds em 7d) e auditoria de custos.';

-- ---------- 2) Coluna em seo.keywords pra ligar ao batch ----------
-- ja existe seo.keywords.last_seen_at (migration 230). Adicionamos a FK pro batch
-- pra saber em qual rodada essa keyword apareceu pela primeira vez.
ALTER TABLE seo.keywords
  ADD COLUMN IF NOT EXISTS first_research_batch_id uuid REFERENCES seo.research_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_research_batch_id  uuid REFERENCES seo.research_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seo_keywords_last_batch ON seo.keywords(last_research_batch_id);

COMMIT;

-- =============================================================================
-- POS-CHECK:
--   SELECT count(*) FROM seo.research_batches;  -- esperado: 0
--   \d seo.keywords  -- esperado: ver first_research_batch_id e last_research_batch_id
-- =============================================================================
