-- =============================================================================
-- 150_super_banco_ops.sql
-- schema OPS: webhook_inbound_log, outbound_event_log, audit_logs, plate_lookups
-- Auditoria + observabilidade de integracoes
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ops.webhook_inbound_log — todo webhook recebido (Evolution, PowerCRM, Meta)
-- Idempotencia por (source, payload_hash)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ops.webhook_inbound_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,                 -- POWERCRM, EVOLUTION, META_CLOUD, GOOGLE_ADS
  path          text,
  headers       jsonb,
  payload       jsonb,
  payload_hash  text,                          -- sha256 do body bruto

  status        text NOT NULL DEFAULT 'received',  -- received, processed, error, duplicate
  lead_id       uuid REFERENCES core.leads(id) ON DELETE SET NULL,
  contact_id    uuid REFERENCES core.contacts(id) ON DELETE SET NULL,
  message_id    uuid REFERENCES chat.messages(id) ON DELETE SET NULL,

  processed_at  timestamptz,
  error         text,
  retry_count   int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, payload_hash)
);
CREATE INDEX ix_wil_lead    ON ops.webhook_inbound_log(lead_id);
CREATE INDEX ix_wil_contact ON ops.webhook_inbound_log(contact_id);
CREATE INDEX ix_wil_status  ON ops.webhook_inbound_log(status);
CREATE INDEX ix_wil_created ON ops.webhook_inbound_log(created_at DESC);
CREATE INDEX ix_wil_source  ON ops.webhook_inbound_log(source, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ops.outbound_event_log — toda chamada pra API externa
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ops.outbound_event_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES core.leads(id) ON DELETE SET NULL,
  contact_id        uuid REFERENCES core.contacts(id) ON DELETE SET NULL,

  kind              text NOT NULL,
  -- POWERCRM_CREATE_LEAD, POWERCRM_UPDATE_LEAD, POWERCRM_GET_NEGOTIATION,
  -- EVOLUTION_SEND_TEXT, EVOLUTION_SEND_PDF, EVOLUTION_SEND_IMAGE, EVOLUTION_PRESENCE,
  -- META_CLOUD_SEND_TEXT, META_CLOUD_SEND_TEMPLATE, META_CLOUD_SEND_IMAGE,
  -- GOOGLE_ADS_LEAD, GOOGLE_ADS_PURCHASE,
  -- META_CAPI_LEAD, META_CAPI_PURCHASE,
  -- GA4_MP_LEAD, GA4_MP_PURCHASE,
  -- ANTHROPIC_COMPLETION, OPENAI_COMPLETION, OPENAI_EMBEDDING,
  -- APIBRASIL_FIPE, APIBRASIL_PLACA

  request_payload   jsonb,
  response_payload  jsonb,
  status_code       int,
  latency_ms        int,
  error             text,

  -- Custo (pra LLMs e APIs pagas)
  cost_usd_cents    int,

  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_oel_lead    ON ops.outbound_event_log(lead_id, created_at DESC);
CREATE INDEX ix_oel_kind    ON ops.outbound_event_log(kind, created_at DESC);
CREATE INDEX ix_oel_created ON ops.outbound_event_log(created_at DESC);
CREATE INDEX ix_oel_errors  ON ops.outbound_event_log(kind) WHERE error IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ops.audit_logs — quem fez o que (ações sensiveis no CRM)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ops.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text NOT NULL,
  actor_type   text NOT NULL,           -- USER, AGENT_IA, SYSTEM, WEBHOOK
  actor_id     text,                     -- crm.users.id ou ai.agent_runs.id
  action       text NOT NULL,            -- LEAD_CREATED, LEAD_UPDATED, LEAD_DELETED, USER_LOGIN, SETTINGS_CHANGED, ETC
  resource     text NOT NULL,            -- 'core.leads', 'crm.users', etc
  resource_id  text,
  diff         jsonb,                     -- {before:{}, after:{}}
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_actor    ON ops.audit_logs(actor_type, actor_id);
CREATE INDEX ix_audit_resource ON ops.audit_logs(resource, resource_id);
CREATE INDEX ix_audit_action   ON ops.audit_logs(action, created_at DESC);
CREATE INDEX ix_audit_company  ON ops.audit_logs(company_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ops.plate_lookups — cache de consultas por placa (APIBrasil cobra por consulta)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ops.plate_lookups (
  placa            text PRIMARY KEY,
  marca            text,
  modelo           text,
  ano              int,
  combustivel      text,
  cor              text,
  chassi           text,
  renavam          text,
  fipe_codigo      text,
  fipe_valor_centavos bigint,
  raw_payload      jsonb,
  source           text NOT NULL,         -- APIBRASIL, FIPE_PARALLELUM, POWERCRM
  consulted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz             -- TTL (ex: 30 dias)
);
CREATE INDEX ix_plate_expires ON ops.plate_lookups(expires_at) WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ops.whatsapp_instances — instancias Evolution + inboxes Meta Cloud configuradas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ops.whatsapp_instances (
  id                  text PRIMARY KEY,             -- ex: 21gosite, 21GO2
  company_id          text NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  channel             text NOT NULL,                 -- WHATSAPP_EVOLUTION, WHATSAPP_OFICIAL
  display_name        text,
  phone_number        text NOT NULL,                 -- E164

  -- Evolution
  evolution_api_url   text,
  evolution_api_key   text,                          -- pode estar cifrado
  evolution_webhook_token text,

  -- Meta Cloud
  waba_id             text,
  phone_number_id     text,
  access_token_enc    text,
  app_secret_enc      text,

  status              text NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, PAUSED, DISCONNECTED
  is_default          boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_wa_company ON ops.whatsapp_instances(company_id);
CREATE TRIGGER wa_updated_at BEFORE UPDATE ON ops.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
