-- =============================================================================
-- 230_seo_schema.sql
-- Schema SEO — opera�ao de blog/SEO automatizada da 21Go
-- Target: dsclaxtvcbbuxmtmpxpf.supabase.co
--
-- Compatibilidade verificada:
--   - Extensions pg_trgm, unaccent, vector vivem no schema "extensions" (migration 100)
--   - core.companies(id) e text e company-21go esta seeded (migration 180)
--   - set_updated_at() existe em public (migration 100)
--   - vector(N) e gin_trgm_ops e vector_cosine_ops sempre com prefix "extensions."
--   - unaccent e STABLE — wrapper IMMUTABLE criado em public.seo_immutable_unaccent
--
-- Esta migration NAO destroi nenhuma tabela existente.
-- Para reverter: DROP SCHEMA seo CASCADE; + DROP FUNCTION public.seo_immutable_unaccent(text);
-- =============================================================================

BEGIN;

-- ---------- 0) Schema base ----------
CREATE SCHEMA IF NOT EXISTS seo;
COMMENT ON SCHEMA seo IS 'Opera�ao de SEO/blog automatizada: keywords, topics, briefings, artigos, indexa�ao, metricas, recomenda�oes';

GRANT USAGE ON SCHEMA seo TO postgres, authenticator, authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA seo GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA seo GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA seo GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- ---------- 1) Wrapper IMMUTABLE para unaccent ----------
-- unaccent() padrao e STABLE, nao serve em generated column STORED.
-- Solu�ao oficial: wrapper SQL IMMUTABLE chamando unaccent dicionario "unaccent" explicito.
CREATE OR REPLACE FUNCTION public.seo_immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('extensions.unaccent', $1)
$$;
COMMENT ON FUNCTION public.seo_immutable_unaccent(text) IS
  'Wrapper IMMUTABLE de unaccent para uso em generated columns e indices funcionais. Usado pelo schema seo.';

-- ---------- 2) seo.keywords ----------
CREATE TABLE seo.keywords (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text NOT NULL DEFAULT 'company-21go' REFERENCES core.companies(id) ON DELETE CASCADE,
  keyword              text NOT NULL,
  keyword_normalized   text GENERATED ALWAYS AS (lower(public.seo_immutable_unaccent(keyword))) STORED,
  category             text NOT NULL CHECK (category IN ('carros','motos','frotas','educativo')),
  source               text NOT NULL CHECK (source IN ('dataforseo','gsc','trends','manual','internal')),
  search_volume        integer,                          -- null se desconhecido (NUNCA inventar)
  difficulty           integer CHECK (difficulty IS NULL OR difficulty BETWEEN 0 AND 100),
  cpc_brl              numeric(8,2),
  intent               text CHECK (intent IN ('informational','navigational','commercial','transactional','unknown')),
  commercial_potential integer CHECK (commercial_potential IS NULL OR commercial_potential BETWEEN 0 AND 100),
  serp_competitors     jsonb,                            -- snapshot SERP top10 do DataForSEO
  notes                text,
  status               text NOT NULL DEFAULT 'pending'   -- pending|approved|rejected|used|out_of_scope
                       CHECK (status IN ('pending','approved','rejected','used','out_of_scope')),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, keyword_normalized)
);

CREATE INDEX idx_seo_keywords_status   ON seo.keywords(company_id, status);
CREATE INDEX idx_seo_keywords_category ON seo.keywords(company_id, category);
CREATE INDEX idx_seo_keywords_volume   ON seo.keywords(company_id, search_volume DESC NULLS LAST);
CREATE INDEX idx_seo_keywords_trgm     ON seo.keywords USING gin (keyword_normalized extensions.gin_trgm_ops);

CREATE TRIGGER seo_keywords_updated_at BEFORE UPDATE ON seo.keywords
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  seo.keywords IS 'Palavras-chave coletadas (DataForSEO/GSC/manual). NUNCA preencher search_volume/difficulty/cpc inventando: se API nao respondeu, deixar NULL.';
COMMENT ON COLUMN seo.keywords.keyword_normalized IS 'lower + unaccent — usado para dedup, busca trigram e join contra topics.';

-- ---------- 3) seo.topics ----------
CREATE TABLE seo.topics (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               text NOT NULL DEFAULT 'company-21go' REFERENCES core.companies(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  main_keyword_id          uuid REFERENCES seo.keywords(id) ON DELETE SET NULL,
  secondary_keywords       text[],
  category                 text NOT NULL CHECK (category IN ('carros','motos','frotas','educativo')),
  intent                   text CHECK (intent IN ('informational','navigational','commercial','transactional','unknown')),
  audience                 text,                       -- ex: "motorista de aplicativo"
  pain_point               text,                       -- dor real do leitor
  pillar_page              text,                       -- ex: '/protecao-veicular'
  anti_repetition_score    numeric(4,3),               -- 0..1 (similaridade maxima vs existentes)
  similar_articles         uuid[],                     -- artigos com score > 0.7 (referencia)
  decision                 text NOT NULL DEFAULT 'PENDENTE'
                           CHECK (decision IN (
                             'APROVAR_ARTIGO_NOVO',
                             'ATUALIZAR_ARTIGO_EXISTENTE',
                             'VIRAR_SECAO_DE_ARTIGO_EXISTENTE',
                             'REJEITAR_POR_REPETICAO',
                             'REJEITAR_FORA_DO_ESCOPO',
                             'PENDENTE'
                           )),
  decision_reason          text,
  target_article_id        uuid,                       -- se ATUALIZAR/VIRAR_SECAO, aponta pro existente (FK definida depois de articles)
  scheduled_for            date,                       -- agendamento editorial
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seo_topics_decision  ON seo.topics(company_id, decision);
CREATE INDEX idx_seo_topics_category  ON seo.topics(company_id, category);
CREATE INDEX idx_seo_topics_keyword   ON seo.topics(main_keyword_id);
CREATE INDEX idx_seo_topics_scheduled ON seo.topics(scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE TRIGGER seo_topics_updated_at BEFORE UPDATE ON seo.topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE seo.topics IS 'Pautas — saida do Agente 02 (estrategista). decision NUNCA pode quebrar escopo (caminhao/onibus/etc).';

-- ---------- 4) seo.briefings ----------
CREATE TABLE seo.briefings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id             uuid NOT NULL REFERENCES seo.topics(id) ON DELETE CASCADE,
  seo_title            text NOT NULL,
  h1                   text NOT NULL,
  outline              jsonb NOT NULL,                -- [{h2, h3:[], notes}]
  faqs                 jsonb,                         -- [{q, a}]
  internal_links       jsonb,                         -- [{anchor, url}]
  legal_notes          text,                          -- pontos de aten�ao comercial/juridica
  example_suggestions  text,
  image_suggestion     text,
  is_update_of         uuid,                          -- se for atualiza�ao, aponta pro article (FK definida depois)
  llm_model_used       text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_briefings_topic ON seo.briefings(topic_id);

COMMENT ON TABLE seo.briefings IS 'Briefing detalhado — saida do Agente 04, entrada do Agente 05 (Writer).';

-- ---------- 5) seo.articles ----------
CREATE TABLE seo.articles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text NOT NULL DEFAULT 'company-21go' REFERENCES core.companies(id) ON DELETE CASCADE,
  topic_id             uuid REFERENCES seo.topics(id) ON DELETE SET NULL,
  briefing_id          uuid REFERENCES seo.briefings(id) ON DELETE SET NULL,
  title                text NOT NULL,
  slug                 text NOT NULL,
  url                  text GENERATED ALWAYS AS ('https://21go.site/blog/' || slug) STORED,
  meta_title           text,
  meta_description     text,
  category             text CHECK (category IN ('carros','motos','frotas','educativo')),
  main_keyword         text,
  secondary_keywords   text[],
  mdx_path             text,                          -- 'content/blog/{slug}.mdx' ou 'content/blog/_drafts/{slug}.mdx'
  mdx_sha              text,                          -- sha do blob no git (drift detection)
  pr_url               text,                          -- URL do Pull Request no GitHub (status=awaiting_pr_merge)
  pr_branch            text,                          -- nome da branch do PR (ex: seo/publish-{slug}-{ts})
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','in_review','approved','awaiting_pr_merge','published','archived','updating')),
  -- awaiting_pr_merge: PR aberto no GitHub esperando merge humano (sem auto-merge na master)
  review_status        text CHECK (review_status IN ('APROVADO','APROVADO_COM_AJUSTES','REPROVADO')),
  review_notes         text,
  embedding            extensions.vector(384),        -- multilingual-e5-small (Xenova) - 384-dim
  word_count           integer,
  read_time_min        integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  published_at         timestamptz,
  archived_at          timestamptz,
  UNIQUE (company_id, slug)
);

CREATE INDEX idx_seo_articles_status   ON seo.articles(company_id, status);
CREATE INDEX idx_seo_articles_category ON seo.articles(company_id, category);
CREATE INDEX idx_seo_articles_topic    ON seo.articles(topic_id);
CREATE INDEX idx_seo_articles_publish  ON seo.articles(published_at DESC NULLS LAST);
CREATE INDEX idx_seo_articles_emb_hnsw ON seo.articles
  USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE TRIGGER seo_articles_updated_at BEFORE UPDATE ON seo.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE seo.articles IS 'Espelho do MDX no git + estado de revisao/publica�ao. AUTO_PUBLISH_ENABLED=false nos primeiros 30 dias.';

-- FKs deferred (referencia circular topics <-> articles)
ALTER TABLE seo.topics
  ADD CONSTRAINT topics_target_article_fk
  FOREIGN KEY (target_article_id) REFERENCES seo.articles(id) ON DELETE SET NULL;

ALTER TABLE seo.briefings
  ADD CONSTRAINT briefings_is_update_of_fk
  FOREIGN KEY (is_update_of) REFERENCES seo.articles(id) ON DELETE SET NULL;

-- ---------- 6) seo.article_versions ----------
CREATE TABLE seo.article_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    uuid NOT NULL REFERENCES seo.articles(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  diff_summary  text,
  mdx_content   text,                                 -- snapshot completo (pra rollback)
  changed_by    text,                                 -- 'agent:14-content-updater' | 'human:<email>'
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);
CREATE INDEX idx_seo_article_versions_article ON seo.article_versions(article_id, version DESC);

COMMENT ON TABLE seo.article_versions IS 'Auditoria de updates — Agente 14 cria nova versao antes de sobrescrever.';

-- ---------- 7) seo.indexing_log ----------
CREATE TABLE seo.indexing_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id        uuid REFERENCES seo.articles(id) ON DELETE CASCADE,
  url               text NOT NULL,
  channel           text NOT NULL CHECK (channel IN ('sitemap','google_gsc','bing_wmt','indexnow','url_inspection')),
  action            text NOT NULL CHECK (action IN ('submit','recheck','remove','validate')),
  response_status   integer,                          -- HTTP status real, ou NULL se nao chamou
  response_body     jsonb,
  error             text,                             -- se falhou
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_indexing_log_article ON seo.indexing_log(article_id, channel, occurred_at DESC);
CREATE INDEX idx_seo_indexing_log_channel ON seo.indexing_log(channel, occurred_at DESC);

COMMENT ON TABLE seo.indexing_log IS 'Log auditavel — uma linha por chamada real. NUNCA inserir fake — se nao chamou, nao loga.';

-- ---------- 8) seo.metrics_daily ----------
CREATE TABLE seo.metrics_daily (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id                      uuid REFERENCES seo.articles(id) ON DELETE CASCADE,
  url                             text NOT NULL,
  date                            date NOT NULL,
  source                          text NOT NULL CHECK (source IN ('gsc','ga4','bing')),
  -- GSC
  impressions                     integer,
  clicks                          integer,
  ctr                             numeric(7,4),
  avg_position                    numeric(6,2),
  -- GA4
  ga4_sessions                    integer,
  ga4_engaged_sessions            integer,
  ga4_engagement_rate             numeric(6,4),
  ga4_avg_engagement_time_sec     numeric(8,2),
  ga4_conversions                 integer,
  whatsapp_clicks                 integer,            -- evento custom ja existente no GTM
  -- meta
  fetched_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, url, date, source)
);
CREATE INDEX idx_seo_metrics_daily_date     ON seo.metrics_daily(date DESC, source);
CREATE INDEX idx_seo_metrics_daily_article  ON seo.metrics_daily(article_id, date DESC);

COMMENT ON TABLE seo.metrics_daily IS 'Snapshot diario — Agente 15 (Reporting). 1 linha por (article, date, source).';

-- ---------- 9) seo.recommendations ----------
CREATE TABLE seo.recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL CHECK (type IN (
                    'update_title','update_meta_description','improve_ctr',
                    'add_faq','expand_content','merge_articles','split_article',
                    'add_internal_link','fix_indexing','new_topic','deploy_failed'
                  )),
  article_id      uuid REFERENCES seo.articles(id) ON DELETE SET NULL,
  priority        integer NOT NULL CHECK (priority BETWEEN 1 AND 5),
  recommendation  text NOT NULL,
  reason          text NOT NULL,
  data            jsonb,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  applied_at      timestamptz
);
CREATE INDEX idx_seo_recommendations_status   ON seo.recommendations(status, priority DESC, created_at DESC);
CREATE INDEX idx_seo_recommendations_article  ON seo.recommendations(article_id, status);

COMMENT ON TABLE seo.recommendations IS 'Saida do Agente 13 (GSC Analyst) e 14 (Content Updater). priority 1=baixa, 5=critica.';

-- ---------- 10) seo.agent_runs ----------
CREATE TABLE seo.agent_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            text NOT NULL,                  -- '01-keyword-research' .. '15-reporting'
  triggered_by        text,                           -- 'cron:weekly' | 'cron:daily' | 'manual' | 'agent:09'
  input               jsonb,
  output              jsonb,
  llm_provider        text,                           -- 'anthropic'
  llm_model           text,                           -- valor real do env (ANTHROPIC_MODEL_MAIN/LIGHT)
  llm_input_tokens    integer,
  llm_output_tokens   integer,
  llm_cost_usd        numeric(10,6),
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error','timeout')),
  error               text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  duration_ms         integer
);
CREATE INDEX idx_seo_agent_runs_agent  ON seo.agent_runs(agent_id, started_at DESC);
CREATE INDEX idx_seo_agent_runs_status ON seo.agent_runs(status, started_at DESC);

COMMENT ON TABLE seo.agent_runs IS 'Rastreabilidade de TODA execu�ao de agente. Custos LLM reais (se nao usou LLM, deixar NULL).';

-- ---------- 11) seo.dataforseo_calls ----------
CREATE TABLE seo.dataforseo_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL,
  request_body  jsonb,
  response_meta jsonb,                                -- meta retornado pela API (tasks_count, cost, etc)
  cost_usd      numeric(10,6),                        -- custo real reportado pela API
  cached        boolean NOT NULL DEFAULT false,
  called_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_dataforseo_calls_date ON seo.dataforseo_calls(called_at DESC);

COMMENT ON TABLE seo.dataforseo_calls IS 'Auditoria de custo DataForSEO. Budget guard usa SUM(cost_usd) do dia para hard-stop.';

-- ---------- 12) View consolidada para Looker/Data Studio ----------
CREATE OR REPLACE VIEW seo.v_article_performance AS
SELECT
  a.id,
  a.title,
  a.slug,
  a.url,
  a.category,
  a.status,
  a.main_keyword,
  a.published_at,
  a.word_count,
  a.read_time_min,
  COALESCE(SUM(m.impressions) FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days'), 0)::int AS impressions_30d,
  COALESCE(SUM(m.clicks)      FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days'), 0)::int AS clicks_30d,
  CASE WHEN COALESCE(SUM(m.impressions) FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days'), 0) > 0
       THEN ROUND(
         COALESCE(SUM(m.clicks)::numeric FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days'), 0)
         / NULLIF(COALESCE(SUM(m.impressions) FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days'), 0), 0)
       , 4)
       ELSE NULL END AS ctr_30d,
  AVG(m.avg_position) FILTER (WHERE m.source='gsc' AND m.date >= current_date - interval '30 days') AS avg_position_30d,
  COALESCE(SUM(m.ga4_sessions)    FILTER (WHERE m.source='ga4' AND m.date >= current_date - interval '30 days'), 0)::int AS sessions_30d,
  COALESCE(SUM(m.ga4_conversions) FILTER (WHERE m.source='ga4' AND m.date >= current_date - interval '30 days'), 0)::int AS conversions_30d,
  COALESCE(SUM(m.whatsapp_clicks) FILTER (WHERE m.date >= current_date - interval '30 days'), 0)::int AS whatsapp_clicks_30d
FROM seo.articles a
LEFT JOIN seo.metrics_daily m ON m.article_id = a.id
GROUP BY a.id;

COMMENT ON VIEW seo.v_article_performance IS 'View consolidada para painel Looker/Data Studio — agrega ultimos 30 dias por artigo.';

COMMIT;

-- =============================================================================
-- POS-CHECK (rodar separado para verificar):
--   SELECT table_name FROM information_schema.tables WHERE table_schema='seo' ORDER BY 1;
--   -- Esperado: 10 tabelas + 1 view
--
--   SELECT proname FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public') AND proname='seo_immutable_unaccent';
--   -- Esperado: 1 row
-- =============================================================================
