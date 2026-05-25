-- =============================================================================
-- 220_leticya_v2_aux_tables.sql
-- Tabelas auxiliares para o agente Leticya v2:
--  · ai.followups            — fila de follow-ups (+1h, +24h, +72h, +7d)
--  · ai.consultant_candidates — funil paralelo do programa APN
--  · ai.lead_quotes          — registro de cotações/descontos oferecidos
--  · ai.rejected_vehicles    — catálogo de veículos bloqueados (com upsert)
--  · core.leads.cold_reason  — coluna pra marcar lead frio
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.followups — agenda de follow-ups automáticos do agente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.followups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES chat.conversations(id) ON DELETE SET NULL,
  company_id      text NOT NULL,

  scheduled_for   timestamptz NOT NULL,
  step            text NOT NULL,             -- '+1h', '+24h', '+72h', '+7d', 'custom'
  reason          text NOT NULL,             -- 'cotacao_enviada', 'vai_pensar', 'sem_resposta', etc.
  draft_message   text NOT NULL,             -- mensagem rascunho (NÃO dispara automático)

  status          text NOT NULL DEFAULT 'SCHEDULED',
  -- SCHEDULED, READY, SENT, SKIPPED, CANCELLED
  triggered_by_run_id uuid,                  -- ai.agent_runs.id
  sent_at         timestamptz,
  sent_by_id      text,                      -- crm.users.id quando humano dispara
  skipped_reason  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_followups_contact   ON ai.followups(contact_id);
CREATE INDEX IF NOT EXISTS ix_followups_due       ON ai.followups(scheduled_for) WHERE status='SCHEDULED';
CREATE INDEX IF NOT EXISTS ix_followups_status    ON ai.followups(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_followups_status') THEN
    ALTER TABLE ai.followups ADD CONSTRAINT chk_followups_status CHECK (
      status IN ('SCHEDULED','READY','SENT','SKIPPED','CANCELLED')
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='followups_updated_at') THEN
    CREATE TRIGGER followups_updated_at BEFORE UPDATE ON ai.followups
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.consultant_candidates — funil paralelo do programa APN (MLM)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.consultant_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid REFERENCES core.contacts(id) ON DELETE SET NULL,
  company_id      text NOT NULL,

  full_name       text,
  email           text,
  phone           text NOT NULL,
  city            text,
  state           text,

  previous_experience text,
  source          text,                      -- 'site_form', 'whatsapp_inbound', 'indicacao'

  status          text NOT NULL DEFAULT 'NEW',
  -- NEW, INVITED_GROUP, IN_TRAINING, ONBOARDED, COLD
  added_to_group_at timestamptz,
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_consultcand_phone   ON ai.consultant_candidates(phone);
CREATE INDEX IF NOT EXISTS ix_consultcand_status  ON ai.consultant_candidates(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='consultcand_updated_at') THEN
    CREATE TRIGGER consultcand_updated_at BEFORE UPDATE ON ai.consultant_candidates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.lead_quotes — registro de cotações/descontos oferecidos ao lead
-- (auditoria + memória pro próximo turno saber o que já foi prometido)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.lead_quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES chat.conversations(id) ON DELETE SET NULL,
  company_id      text NOT NULL,

  plan_id         text NOT NULL,
  fipe_value_brl  numeric(12,2) NOT NULL,
  monthly_brl     numeric(12,2) NOT NULL,
  activation_full_brl   numeric(12,2) NOT NULL DEFAULT 419.91,
  activation_offer_brl  numeric(12,2) NOT NULL,
  tracker_included      boolean NOT NULL DEFAULT true,
  profile_used    text NOT NULL,
  -- 'sem_boleto_sem_urgencia', 'sem_boleto_fecha_hoje',
  -- 'com_boleto', 'com_boleto_fecha_hoje', 'fipe_alta', 'so_rastreador'

  valid_until     timestamptz,
  status          text NOT NULL DEFAULT 'OFFERED',
  -- OFFERED, ACCEPTED, EXPIRED, REJECTED

  triggered_by_run_id uuid,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_quotes_contact      ON ai.lead_quotes(contact_id);
CREATE INDEX IF NOT EXISTS ix_quotes_valid        ON ai.lead_quotes(valid_until) WHERE status='OFFERED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='lead_quotes_updated_at') THEN
    CREATE TRIGGER lead_quotes_updated_at BEFORE UPDATE ON ai.lead_quotes
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.rejected_vehicles — catálogo de modelos bloqueados (sourced de conversas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.rejected_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern         text NOT NULL,             -- regex case-insensitive (ex: 'fiat\s+freemont')
  display_name    text NOT NULL,             -- "Fiat Freemont"
  category        text NOT NULL,             -- 'modelo', 'marca', 'ano_min', 'origem_leilao'
  reason          text NOT NULL,             -- razão pra rejeitar
  source          text NOT NULL DEFAULT 'observado_conversa',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rejected_active     ON ai.rejected_vehicles(is_active);

-- Seed inicial com a lista observada nas conversas
INSERT INTO ai.rejected_vehicles (pattern, display_name, category, reason, source)
VALUES
  ('fiat\s+freemont',            'Fiat Freemont',            'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('fiat\s+linea',               'Fiat Linea',               'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('fiat\s+idea',                'Fiat Idea',                'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('hyundai\s+veloster',         'Hyundai Veloster',         'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('ford\s+focus\s+2\.0',        'Ford Focus 2.0 16V antigos','modelo','Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('kia\s+cerato',               'Kia Cerato',               'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('caoa\s+chery\s+qq',          'Caoa Chery QQ',            'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('avelloz\s+xtremer',          'Avelloz Xtremer',          'modelo', 'Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('iveco',                      'Iveco (utilitários)',      'marca',  'Utilitários comerciais grandes não aceitos', 'observado_conversa'),
  ('palio\s+weekend\s+elx',      'Fiat Palio Weekend ELX antigos','modelo','Veículo não aceito pela política da 21Go', 'observado_conversa'),
  ('leilao|leilão|passagem.*leilao|remarcado', 'Leilão/Remarcado', 'origem_leilao', 'Veículos de leilão pesado ou chassi remarcado', 'observado_conversa')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- core.leads — coluna pra marcar lead frio com motivo (não estraga existentes)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='core' AND table_name='leads' AND column_name='cold_reason'
  ) THEN
    ALTER TABLE core.leads ADD COLUMN cold_reason text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='core' AND table_name='leads' AND column_name='cold_at'
  ) THEN
    ALTER TABLE core.leads ADD COLUMN cold_at timestamptz;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.agents — coluna pra versionar persona (A/B test)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ai' AND table_name='agents' AND column_name='persona_version'
  ) THEN
    ALTER TABLE ai.agents ADD COLUMN persona_version text NOT NULL DEFAULT 'v2';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ai' AND table_name='agents' AND column_name='ab_test_enabled'
  ) THEN
    ALTER TABLE ai.agents ADD COLUMN ab_test_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ai' AND table_name='agents' AND column_name='ab_split_percent'
  ) THEN
    ALTER TABLE ai.agents ADD COLUMN ab_split_percent int NOT NULL DEFAULT 50;
  END IF;
END $$;

UPDATE ai.agents SET persona_version='v2' WHERE id='pre-venda';

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.agent_runs — colunas pra tracking de A/B (assume tabela já existe)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='ai' AND table_name='agent_runs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='ai' AND table_name='agent_runs' AND column_name='persona_version'
    ) THEN
      ALTER TABLE ai.agent_runs ADD COLUMN persona_version text;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- View de métricas A/B (consolidação simples por versão)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW ai.v_ab_metrics AS
SELECT
  COALESCE(ar.persona_version, 'unknown') AS persona_version,
  COUNT(DISTINCT ar.conversation_id)::int AS conversas,
  COUNT(*)::int                          AS runs,
  AVG(ar.latency_ms)::int                AS avg_latency_ms,
  SUM(CASE WHEN ar.status='OK' THEN 1 ELSE 0 END)::int AS ok_runs,
  SUM(CASE WHEN ar.status='ESCALATED' THEN 1 ELSE 0 END)::int AS escalated_runs,
  COUNT(DISTINCT e.id)::int              AS escalations_total,
  COUNT(DISTINCT lq.id)::int             AS quotes_offered,
  SUM(CASE WHEN lq.status='ACCEPTED' THEN 1 ELSE 0 END)::int AS quotes_accepted
FROM ai.agent_runs ar
LEFT JOIN ai.escalations e
  ON e.triggered_by_run_id = ar.id
LEFT JOIN ai.lead_quotes lq
  ON lq.triggered_by_run_id = ar.id
GROUP BY COALESCE(ar.persona_version, 'unknown');

-- =============================================================================
-- FIM
-- =============================================================================
