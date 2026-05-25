-- =============================================================================
-- 160_super_banco_crm.sql
-- schema CRM: users, pipes, phases, cards, tasks, sinistros, oficinas, boletos,
-- nps_surveys, projetos, indicacoes, ouvidoria, vistorias
-- Tudo que e visualizacao/operacao do time (frontend Kanban)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.users — vendedores, gestores, operacao, admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.users (
  id              text PRIMARY KEY,
  company_id      text NOT NULL REFERENCES core.companies(id),
  email           text NOT NULL UNIQUE,
  password_hash   text NOT NULL,             -- bcrypt

  first_name      text NOT NULL,
  last_name       text NOT NULL,
  avatar_url      text,
  phone           text,

  role            text NOT NULL,             -- ADMIN, GESTOR, VENDEDOR, OPERACAO
  is_active       boolean NOT NULL DEFAULT true,

  -- IDs externos
  hinova_user_id  text,                       -- id no PowerCRM
  powercrm_pwrlnk text,                       -- ex: WDVMKnkq pra Leticya

  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_users_company ON crm.users(company_id);
CREATE INDEX ix_users_role    ON crm.users(company_id, role);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON crm.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Adiciona FK pendentes que apontam pra crm.users
ALTER TABLE core.leads
  ADD CONSTRAINT leads_vendedor_fk
  FOREIGN KEY (vendedor_id) REFERENCES crm.users(id) ON DELETE SET NULL;

ALTER TABLE chat.conversations
  ADD CONSTRAINT conv_assigned_fk
  FOREIGN KEY (assigned_to_id) REFERENCES crm.users(id) ON DELETE SET NULL;

ALTER TABLE ai.escalations
  ADD CONSTRAINT esc_assigned_fk
  FOREIGN KEY (assigned_to_id) REFERENCES crm.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.refresh_tokens — JWT refresh
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.refresh_tokens (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_rt_user ON crm.refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_rt_exp  ON crm.refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.pipes / phases / cards — Kanban
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.pipes (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES core.companies(id),
  name         text NOT NULL,
  description  text,
  icon         text,
  color        text NOT NULL DEFAULT '#1B4DA1',
  status       text NOT NULL DEFAULT 'ACTIVE',
  tags         text[],
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pipes_company ON crm.pipes(company_id);
CREATE TRIGGER pipes_updated_at BEFORE UPDATE ON crm.pipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE crm.phases (
  id           text PRIMARY KEY,
  company_id   text NOT NULL,
  pipe_id      text NOT NULL REFERENCES crm.pipes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#888888',
  position     int NOT NULL,
  probability  int NOT NULL DEFAULT 0,        -- 0..100
  is_won       boolean NOT NULL DEFAULT false,
  is_lost      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_phases_pipe ON crm.phases(pipe_id, position);
CREATE TRIGGER phases_updated_at BEFORE UPDATE ON crm.phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE crm.cards (
  id                text PRIMARY KEY,
  company_id        text NOT NULL,
  pipe_id           text NOT NULL REFERENCES crm.pipes(id),
  current_phase_id  text NOT NULL REFERENCES crm.phases(id),

  -- Vinculos opcionais (card pode ou nao ter lead/contato)
  lead_id           uuid REFERENCES core.leads(id) ON DELETE CASCADE,
  contact_id        uuid REFERENCES core.contacts(id) ON DELETE CASCADE,

  title             text NOT NULL,
  description       text,
  status            text NOT NULL DEFAULT 'OPEN',  -- OPEN, WON, LOST, ARCHIVED

  created_by_id     text NOT NULL REFERENCES crm.users(id),
  assigned_to_id    text REFERENCES crm.users(id),

  due_date          timestamptz,
  completed_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cards_phase     ON crm.cards(current_phase_id);
CREATE INDEX ix_cards_assigned  ON crm.cards(assigned_to_id);
CREATE INDEX ix_cards_lead      ON crm.cards(lead_id);
CREATE INDEX ix_cards_contact   ON crm.cards(contact_id);
CREATE INDEX ix_cards_company   ON crm.cards(company_id);
CREATE INDEX ix_cards_status    ON crm.cards(status);
CREATE TRIGGER cards_updated_at BEFORE UPDATE ON crm.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Field definitions + values customizaveis (parcialmente usado no CRM antigo)
CREATE TABLE crm.field_definitions (
  id            text PRIMARY KEY,
  company_id    text NOT NULL,
  pipe_id       text REFERENCES crm.pipes(id) ON DELETE CASCADE,
  name          text NOT NULL,
  field_type    text NOT NULL,           -- TEXT, NUMBER, DATE, BOOLEAN, SELECT, MULTISELECT
  options       jsonb,                    -- pra SELECT/MULTISELECT
  is_required   boolean NOT NULL DEFAULT false,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm.card_field_values (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     text NOT NULL REFERENCES crm.cards(id) ON DELETE CASCADE,
  field_id    text NOT NULL REFERENCES crm.field_definitions(id) ON DELETE CASCADE,
  value       jsonb,                       -- formato livre conforme field_type
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, field_id)
);
CREATE TRIGGER cfv_updated_at BEFORE UPDATE ON crm.card_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.tasks — atividades de venda (modulo Tarefas, criado em 2026-05-05)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  lead_id         uuid REFERENCES core.leads(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES core.contacts(id) ON DELETE CASCADE,
  card_id         text REFERENCES crm.cards(id) ON DELETE SET NULL,
  assigned_to_id  text NOT NULL REFERENCES crm.users(id),
  created_by_id   text NOT NULL REFERENCES crm.users(id),

  title           text NOT NULL,
  description     text,
  task_type       text NOT NULL,             -- LIGAR, WHATSAPP, EMAIL, REUNIAO, OUTRO
  priority        text NOT NULL DEFAULT 'NORMAL',  -- LOW, NORMAL, HIGH

  due_at          timestamptz NOT NULL,
  completed_at    timestamptz,
  status          text NOT NULL DEFAULT 'PENDING',  -- PENDING, COMPLETED, CANCELLED

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tasks_assigned ON crm.tasks(assigned_to_id, due_at) WHERE status = 'PENDING';
CREATE INDEX ix_tasks_lead     ON crm.tasks(lead_id);
CREATE INDEX ix_tasks_due      ON crm.tasks(due_at);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON crm.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.sinistros — abertura ao encerramento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.sinistros (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         text NOT NULL,
  contact_id         uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  vehicle_id         uuid NOT NULL REFERENCES core.vehicles(id) ON DELETE CASCADE,
  oficina_id         uuid,                       -- FK adicionada apos crm.oficinas
  responsavel_id     text REFERENCES crm.users(id) ON DELETE SET NULL,

  numero_sinistro    text UNIQUE,                 -- numero externo/interno
  tipo               text NOT NULL,               -- COLISAO, ROUBO, FURTO, INCENDIO, VIDROS, OUTRO
  descricao          text,
  data_ocorrencia    timestamptz NOT NULL,
  local_ocorrencia   jsonb,                       -- {endereco, lat, lng}

  status             text NOT NULL DEFAULT 'ABERTO',
  -- ABERTO, AVALIACAO, AGUARDANDO_DOCS, EM_REPARO, ENCERRADO, NEGADO
  valor_estimado_centavos bigint,
  valor_pago_centavos     bigint,
  encerrado_em       timestamptz,

  fotos_urls         text[],
  documentos_urls    text[],

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sin_contact   ON crm.sinistros(contact_id);
CREATE INDEX ix_sin_vehicle   ON crm.sinistros(vehicle_id);
CREATE INDEX ix_sin_status    ON crm.sinistros(status);
CREATE INDEX ix_sin_responsavel ON crm.sinistros(responsavel_id);
CREATE TRIGGER sin_updated_at BEFORE UPDATE ON crm.sinistros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.oficinas — rede credenciada
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.oficinas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text NOT NULL,
  nome         text NOT NULL,
  cnpj         text,
  telefone     text,
  email        text,
  endereco     jsonb,
  especialidades text[],                          -- ["FUNILARIA","MECANICA","VIDROS"]
  is_credenciada boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER oficinas_updated_at BEFORE UPDATE ON crm.oficinas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE crm.sinistros
  ADD CONSTRAINT sin_oficina_fk
  FOREIGN KEY (oficina_id) REFERENCES crm.oficinas(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.vistorias — feita pra novos veiculos antes de aceitar no plano
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.vistorias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  vehicle_id      uuid NOT NULL REFERENCES core.vehicles(id) ON DELETE CASCADE,
  vistoriador_id  text REFERENCES crm.users(id) ON DELETE SET NULL,

  agendada_para   timestamptz,
  realizada_em    timestamptz,
  status          text NOT NULL DEFAULT 'AGENDADA',  -- AGENDADA, REALIZADA, APROVADA, REJEITADA, CANCELADA

  fotos_urls      text[],
  observacoes     text,
  motivo_rejeicao text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_vist_vehicle ON crm.vistorias(vehicle_id);
CREATE INDEX ix_vist_status  ON crm.vistorias(status);
CREATE TRIGGER vist_updated_at BEFORE UPDATE ON crm.vistorias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.boletos — cobranças
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.boletos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         text NOT NULL,
  contact_id         uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,

  numero             text UNIQUE,
  valor_centavos     bigint NOT NULL,
  vencimento         date NOT NULL,
  pago_em            timestamptz,
  valor_pago_centavos bigint,
  status             text NOT NULL DEFAULT 'ABERTO',  -- ABERTO, PAGO, VENCIDO, CANCELADO
  url_pdf            text,
  linha_digitavel    text,
  hinova_boleto_id   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_bol_contact ON crm.boletos(contact_id);
CREATE INDEX ix_bol_status  ON crm.boletos(status);
CREATE INDEX ix_bol_venc    ON crm.boletos(vencimento) WHERE status = 'ABERTO';
CREATE TRIGGER bol_updated_at BEFORE UPDATE ON crm.boletos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.nps_surveys — pesquisas NPS automatizadas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.nps_surveys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  contact_id    uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,

  trigger_event text NOT NULL,                  -- POS_ONBOARDING, POS_SINISTRO, ANIVERSARIO_PLANO
  enviada_em    timestamptz,
  respondida_em timestamptz,
  score         int,                             -- 0..10
  comment       text,
  classificacao text,                            -- PROMOTOR(9-10), NEUTRO(7-8), DETRATOR(0-6)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_nps_contact ON crm.nps_surveys(contact_id);
CREATE INDEX ix_nps_score   ON crm.nps_surveys(score) WHERE respondida_em IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.indicacoes — Member Get Member
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.indicacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         text NOT NULL,
  indicador_id       uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  indicado_id        uuid REFERENCES core.contacts(id) ON DELETE SET NULL,
  indicado_lead_id   uuid REFERENCES core.leads(id) ON DELETE SET NULL,

  link_rastreavel    text NOT NULL UNIQUE,
  fechou             boolean NOT NULL DEFAULT false,
  fechou_em          timestamptz,
  desconto_aplicado_centavos bigint,

  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ind_indicador ON crm.indicacoes(indicador_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.ouvidoria — reclamações registradas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.ouvidoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  contact_id    uuid REFERENCES core.contacts(id) ON DELETE SET NULL,
  canal         text NOT NULL,                 -- WHATSAPP, EMAIL, RECLAME_AQUI, SITE
  assunto       text NOT NULL,
  descricao     text,
  status        text NOT NULL DEFAULT 'ABERTO',  -- ABERTO, EM_ANALISE, RESOLVIDO, ENCERRADO
  responsavel_id text REFERENCES crm.users(id),
  resolvido_em  timestamptz,
  resolucao     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ouv_updated_at BEFORE UPDATE ON crm.ouvidoria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.projetos — gestão de projetos da FlowAI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.projetos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  nome          text NOT NULL,
  descricao     text,
  status        text NOT NULL DEFAULT 'EM_ANDAMENTO',
  responsavel_id text REFERENCES crm.users(id),
  prazo         date,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER proj_updated_at BEFORE UPDATE ON crm.projetos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- crm.automacoes — fluxos de automação configurados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.automacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  nome          text NOT NULL,
  trigger_type  text NOT NULL,                  -- LEAD_CREATED, PHASE_CHANGED, NPS_DETRACTOR, ETC
  trigger_config jsonb NOT NULL DEFAULT '{}',
  actions       jsonb NOT NULL DEFAULT '[]',     -- lista de ações em ordem
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER aut_updated_at BEFORE UPDATE ON crm.automacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
