-- =============================================================================
-- 140_super_banco_tracking.sql
-- schema TRACKING: lead_status_history, utm_attribution, conversion_events_log
-- Tudo que e atribuicao + conversoes (Google Ads / Meta CAPI / GA4 MP)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- tracking.lead_status_history — trail append-only do funil
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tracking.lead_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES core.leads(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  source       text NOT NULL,              -- POWERCRM_WEBHOOK, MANUAL, AGENT_IA, API
  changed_by   text,                        -- crm.users.id ou ai.agent_runs.id ou 'webhook:powercrm'
  raw_payload  jsonb,
  changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_lsh_lead    ON tracking.lead_status_history(lead_id, changed_at DESC);
CREATE INDEX ix_lsh_changed ON tracking.lead_status_history(changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- tracking.utm_attribution — UTMs + click IDs por lead
-- 1 registro por lead (gerado no momento do form)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tracking.utm_attribution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL UNIQUE REFERENCES core.leads(id) ON DELETE CASCADE,

  -- IDs unicos de tracking (todos com UNIQUE quando nao-nulos)
  trk             text,                    -- nosso ID interno
  event_id        text,                    -- pra dedup conversoes
  ga_client_id    text,                    -- GA4 _ga
  external_id     text,                    -- Meta CAPI external_id (hash do email/telefone)

  -- Click IDs
  fbp             text,                    -- Meta browser ID (cookie _fbp)
  fbc             text,                    -- Meta click ID (cookie _fbc)
  gclid           text,                    -- Google Ads click ID
  fbclid          text,                    -- Meta Ads click ID
  gbraid          text,                    -- Google Ads (iOS sem cookies)
  wbraid          text,                    -- Google Ads (web-to-app)

  -- UTMs
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,

  -- Contexto da sessao
  referrer        text,
  landing_page    text,
  ip_address      inet,
  user_agent      text,

  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_utm_trk        ON tracking.utm_attribution(trk) WHERE trk IS NOT NULL;
CREATE UNIQUE INDEX uq_utm_event_id   ON tracking.utm_attribution(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX ix_utm_gclid             ON tracking.utm_attribution(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX ix_utm_fbclid            ON tracking.utm_attribution(fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX ix_utm_source_medium     ON tracking.utm_attribution(utm_source, utm_medium);

-- ─────────────────────────────────────────────────────────────────────────────
-- tracking.conversion_events_log — append-only de envios pra Conversion APIs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tracking.conversion_events_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL REFERENCES core.leads(id) ON DELETE CASCADE,

  destino          text NOT NULL,                  -- GOOGLE_ADS, META_CAPI, GA4_MP
  event_name       text NOT NULL,                  -- Lead, Purchase, AddToCart
  event_id         text,                            -- pra dedup com Meta

  payload          jsonb NOT NULL,
  response_status  int,
  response_body    jsonb,
  success          boolean NOT NULL,
  error_message    text,

  sent_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cev_lead    ON tracking.conversion_events_log(lead_id, sent_at DESC);
CREATE INDEX ix_cev_dest    ON tracking.conversion_events_log(destino, success);
CREATE INDEX ix_cev_event   ON tracking.conversion_events_log(event_name, sent_at DESC);
