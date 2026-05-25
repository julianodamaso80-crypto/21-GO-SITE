-- Migration 260: Topical Clusters + Funnel Stage + Data Sources
-- Sprint 1 (clusters) + Sprint 6 (funnel) + Sprint 2 (data sources)
-- Dec user 2026-05-25: estrategia 9.6/10 baseada em March 2026 Core Update.

-- 1) Clusters — pillar pages + hub-and-spoke
CREATE TABLE IF NOT EXISTS seo.clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL DEFAULT 'company-21go' REFERENCES core.companies(id),
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  pillar_article_id uuid,                          -- FK adicionada apos articles.id existir (circular)
  category text CHECK (category IN ('carros','motos','frotas','educativo')),
  search_intent text,                              -- ex: "comparacao planos protecao veicular"
  main_keywords text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_seo_clusters_category ON seo.clusters (company_id, category);

-- 2) cluster_id em topics e articles
ALTER TABLE seo.topics
  ADD COLUMN IF NOT EXISTS cluster_id uuid REFERENCES seo.clusters(id),
  ADD COLUMN IF NOT EXISTS funnel_stage text CHECK (funnel_stage IN ('top','mid','bottom'));

ALTER TABLE seo.articles
  ADD COLUMN IF NOT EXISTS cluster_id uuid REFERENCES seo.clusters(id),
  ADD COLUMN IF NOT EXISTS funnel_stage text CHECK (funnel_stage IN ('top','mid','bottom')),
  ADD COLUMN IF NOT EXISTS is_pillar boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_seo_articles_cluster ON seo.articles (cluster_id);

-- FK circular: pillar_article_id -> seo.articles(id)
ALTER TABLE seo.clusters
  ADD CONSTRAINT clusters_pillar_fkey
  FOREIGN KEY (pillar_article_id) REFERENCES seo.articles(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- 3) Data sources — fatos auditaveis pro Writer usar (information gain)
CREATE TABLE IF NOT EXISTS seo.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL DEFAULT 'company-21go',
  type text NOT NULL CHECK (type IN ('estatistica','tabela','caso','norma','calculo','localizacao')),
  topic_tags text[],                               -- ex: {'carros','roubo','rj'}
  title text NOT NULL,                             -- ex: "Roubo de veiculos RJ 2025"
  fact text NOT NULL,                              -- frase pronta
  source_name text NOT NULL,                       -- ex: "SSP-RJ"
  source_url text,
  valid_until date,                                -- pra expirar dados antigos
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_data_sources_tags ON seo.data_sources USING gin (topic_tags);

-- 4) Seed keywords (Sprint 6) — 300+ seeds curadas, sem repetir 90d
CREATE TABLE IF NOT EXISTS seo.seed_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL DEFAULT 'company-21go',
  seed text NOT NULL,                              -- ex: "protecao veicular zona oeste rj"
  category text CHECK (category IN ('carros','motos','frotas','educativo')),
  funnel_stage text CHECK (funnel_stage IN ('top','mid','bottom')),
  cluster_slug text,                               -- referencia ao cluster que pertence
  last_used_at timestamptz,
  priority int DEFAULT 5,                          -- 1-10
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, seed)
);

CREATE INDEX IF NOT EXISTS idx_seed_keywords_rotation ON seo.seed_keywords (company_id, category, last_used_at NULLS FIRST);

-- 5) Skill invocations log
CREATE TABLE IF NOT EXISTS seo.skill_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command text NOT NULL,
  args jsonb,
  invoked_by text,
  status text DEFAULT 'running',
  output jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int
);

-- 6) Seed inicial dos 3 clusters principais
INSERT INTO seo.clusters (slug, title, description, category, main_keywords) VALUES
  ('protecao-veicular-carros', 'Proteção Veicular para Carros',
   'Tudo sobre proteção patrimonial veicular para carros de passeio, SUVs, sedãs, hatchs',
   'carros', ARRAY['protecao veicular carros', 'protecao patrimonial veicular', 'associacao protecao carro']),
  ('protecao-veicular-motos', 'Proteção Veicular para Motos',
   'Tudo sobre proteção patrimonial veicular para motos, motociclistas, motoboys',
   'motos', ARRAY['protecao veicular motos', 'protecao moto', 'associacao protecao moto']),
  ('protecao-veicular-frotas', 'Proteção Veicular para Frotas',
   'Tudo sobre proteção patrimonial para frotas de carros e motos (delivery, app, empresas)',
   'frotas', ARRAY['protecao frota', 'protecao veicular delivery', 'frota uber 99 ifood'])
ON CONFLICT (company_id, slug) DO NOTHING;
