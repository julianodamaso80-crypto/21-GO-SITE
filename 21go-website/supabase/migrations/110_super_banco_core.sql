-- =============================================================================
-- 110_super_banco_core.sql
-- schema CORE: companies, contacts, vehicles, leads, contact_temperature
-- Fonte da verdade do negocio (pessoa, carro, oportunidade comercial)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- core.companies — multi-tenant (1 hoje, preparado pra mais)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE core.companies (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  cnpj        text,
  email       text,
  phone       text,
  address     jsonb,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON core.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- core.contacts — pessoa unificada (lead + associado mesma entidade)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE core.contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               text NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,

  -- Identidade
  nome                     text NOT NULL,
  cpf                      text,             -- normalizado (so digitos), unique por company
  email                    text,

  -- Telefones (E164 sem '+', ex: 5521994647230)
  telefone                 text,
  whatsapp                 text,             -- pode ser igual a telefone

  -- Endereco
  cidade                   text,
  estado                   text,
  cep                      text,

  -- Status
  is_associado             boolean NOT NULL DEFAULT false,
  associado_desde          timestamptz,
  hinova_id                text,             -- ID externo PowerCRM/Hinova

  -- Atribuicao
  primeiro_contato_origem  text,             -- SITE, WHATSAPP, INDICACAO, INSTAGRAM
  primeiro_contato_em      timestamptz NOT NULL DEFAULT now(),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Dedup
  UNIQUE (company_id, telefone),
  UNIQUE (company_id, cpf)
);
CREATE INDEX ix_contacts_phone     ON core.contacts(telefone) WHERE telefone IS NOT NULL;
CREATE INDEX ix_contacts_whatsapp  ON core.contacts(whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX ix_contacts_cpf       ON core.contacts(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX ix_contacts_email     ON core.contacts(email) WHERE email IS NOT NULL;
CREATE INDEX ix_contacts_nome_trgm ON core.contacts USING gin (nome extensions.gin_trgm_ops);
CREATE INDEX ix_contacts_company   ON core.contacts(company_id);
CREATE INDEX ix_contacts_associado ON core.contacts(company_id, is_associado);
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON core.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- core.vehicles — carros do contato (FIPE em centavos pra evitar float)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE core.vehicles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            text NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,

  placa                 text NOT NULL,
  renavam               text,
  chassi                text,

  marca                 text NOT NULL,
  modelo                text NOT NULL,
  ano_fabricacao        int NOT NULL,
  ano_modelo            int NOT NULL,
  cor                   text,
  combustivel           text,
  tipo                  text NOT NULL,        -- CARRO, MOTO, CAMINHAO

  -- FIPE
  codigo_fipe           text,
  valor_fipe_centavos   bigint,
  fipe_consultado_em    timestamptz,

  -- Plano (se virou associado)
  plano                 text,                 -- BASICO, COMPLETO, PREMIUM
  valor_mensal_centavos bigint,
  tem_rastreador        boolean NOT NULL DEFAULT false,
  rastreador_marca      text,

  -- Vistoria
  vistoria_status       text,                 -- PENDENTE, AGENDADA, APROVADA, REJEITADA
  vistoria_data         timestamptz,

  ativo                 boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, placa)
);
CREATE INDEX ix_vehicles_contact ON core.vehicles(contact_id);
CREATE INDEX ix_vehicles_placa   ON core.vehicles(placa);
CREATE INDEX ix_vehicles_company ON core.vehicles(company_id);
CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON core.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- core.leads — oportunidade comercial (1 contact pode ter N leads no tempo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE core.leads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  text NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  contact_id                  uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  vehicle_id                  uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,

  -- Cotacao
  placa_interesse             text,
  marca_interesse             text,
  modelo_interesse            text,
  ano_interesse               int,
  valor_fipe_centavos         bigint,
  cotacao_plano               text,                       -- BASICO, COMPLETO, PREMIUM
  cotacao_valor_centavos      bigint,
  cotacao_enviada             boolean NOT NULL DEFAULT false,
  cotacao_data                timestamptz,
  pdf_url                     text,
  pdf_enviado                 boolean NOT NULL DEFAULT false,
  pdf_enviado_em              timestamptz,
  pdf_aberto                  boolean NOT NULL DEFAULT false,
  pdf_aberto_em               timestamptz,
  whatsapp_clicado            boolean NOT NULL DEFAULT false,
  whatsapp_clicado_em         timestamptz,

  -- Atributos do veiculo de cotacao (mesmo que ainda nao tenha core.vehicles)
  carro_app                   boolean NOT NULL DEFAULT false,
  leilao                      text,
  seguro_atual                text,

  -- Funil
  etapa_funil                 text NOT NULL DEFAULT 'NOVO',
  -- valores: NOVO, EM_CONTATO, COTACAO_ENVIADA, NEGOCIANDO, RELEASED_FOR_REGISTRATION, GANHO, PERDIDO
  motivo_perda                text,
  status                      text NOT NULL DEFAULT 'OPEN',  -- OPEN, WON, LOST

  -- Atribuicao
  vendedor_id                 text,                          -- crm.users.id (FK adicionada em 070_crm)
  qualificado_por             text,                          -- HUMANO, AGENTE_IA
  score_qualificacao          int NOT NULL DEFAULT 0,        -- 0..100
  agente_ia_run_id            uuid,                          -- ai.agent_runs.id (FK adicionada em 130_ai)

  -- Conversao
  data_conversao              timestamptz,
  valor_compra_centavos       bigint,
  produto_comprado            text,

  -- Hinova / PowerCRM
  hinova_lead_id              text,
  quotation_code              text,
  negotiation_code            text,
  liberado_cadastro           boolean NOT NULL DEFAULT false,
  liberado_cadastro_em        timestamptz,
  powercrm_payload            jsonb,

  -- Follow-up
  follow_up_enviado           boolean NOT NULL DEFAULT false,
  follow_up_data              timestamptz,
  reengajamento_enviado       boolean NOT NULL DEFAULT false,
  reengajamento_data          timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, quotation_code),
  UNIQUE (company_id, negotiation_code)
);
CREATE INDEX ix_leads_contact   ON core.leads(contact_id);
CREATE INDEX ix_leads_vehicle   ON core.leads(vehicle_id);
CREATE INDEX ix_leads_etapa     ON core.leads(etapa_funil);
CREATE INDEX ix_leads_status    ON core.leads(status);
CREATE INDEX ix_leads_vendedor  ON core.leads(vendedor_id);
CREATE INDEX ix_leads_created   ON core.leads(created_at DESC);
CREATE INDEX ix_leads_company   ON core.leads(company_id);
CREATE INDEX ix_leads_hinova    ON core.leads(hinova_lead_id) WHERE hinova_lead_id IS NOT NULL;
CREATE INDEX ix_leads_liberado  ON core.leads(liberado_cadastro) WHERE liberado_cadastro = true;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON core.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- core.contact_temperature — calculado por triggers/jobs (1 linha por contact)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE core.contact_temperature (
  contact_id              uuid PRIMARY KEY REFERENCES core.contacts(id) ON DELETE CASCADE,
  company_id              text NOT NULL,

  status                  text NOT NULL DEFAULT 'FRIO',
  -- FRIO (>30d sem mexer), MORNO (cotação aberta), QUENTE (msg <7d + pdf aberto), CLIENTE (associado), INATIVO (>180d)
  score                   int NOT NULL DEFAULT 0,           -- 0..100
  reason                  text,                              -- por que esse status

  -- Sinais
  ultima_mensagem_em      timestamptz,
  ultima_mensagem_direcao text,                              -- INBOUND, OUTBOUND
  total_msgs_inbound      int NOT NULL DEFAULT 0,
  total_msgs_outbound     int NOT NULL DEFAULT 0,
  cotacao_aberta          boolean NOT NULL DEFAULT false,
  pdf_aberto              boolean NOT NULL DEFAULT false,
  whatsapp_clicado        boolean NOT NULL DEFAULT false,

  computed_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_temp_status    ON core.contact_temperature(status);
CREATE INDEX ix_temp_company   ON core.contact_temperature(company_id, status);
CREATE INDEX ix_temp_score     ON core.contact_temperature(score DESC);
