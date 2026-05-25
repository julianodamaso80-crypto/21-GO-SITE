-- =============================================================================
-- 120_super_banco_chat.sql
-- schema CHAT: conversations, messages, message_embeddings, contact_facts
-- Tudo que e conversa + memoria do agente
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- chat.conversations — 1 por (canal + jid + instance/inbox)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE chat.conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          text NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  contact_id          uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,

  -- Canal
  channel             text NOT NULL,
  -- valores: WHATSAPP_EVOLUTION, WHATSAPP_OFICIAL, INSTAGRAM, EMAIL, WEB
  evolution_instance  text,                     -- ex: 21gosite (canal Evolution)
  inbox_id            text,                     -- ex: WABA inbox (canal Meta Cloud)
  jid                 text,                     -- jid WhatsApp

  -- Estado
  status              text NOT NULL DEFAULT 'OPEN',  -- OPEN, RESOLVED, ARCHIVED
  unread_count        int NOT NULL DEFAULT 0,
  total_messages      int NOT NULL DEFAULT 0,

  -- Atribuicao
  assigned_to_id      text,                     -- crm.users.id (FK adicionada depois)
  agente_ia_ativo     boolean NOT NULL DEFAULT false,
  agente_ia_id        text,                     -- ai.agents.id

  -- Cache (denormalizado pra evitar join no hot path)
  contact_phone       text NOT NULL,
  contact_name        text,
  pushname            text,
  profile_pic_url     text,

  -- Timestamps
  first_inbound_at    timestamptz,
  first_outbound_at   timestamptz,
  last_inbound_at     timestamptz,              -- usado pra janela 24h Meta
  last_message_at     timestamptz NOT NULL DEFAULT now(),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Dedup: 1 conversa por (canal + jid + instancia/inbox)
-- Usar dois UNIQUE separados porque um eh por instance, outro por inbox_id
CREATE UNIQUE INDEX uq_conv_evolution
  ON chat.conversations(channel, jid, evolution_instance)
  WHERE jid IS NOT NULL AND evolution_instance IS NOT NULL;
CREATE UNIQUE INDEX uq_conv_inbox
  ON chat.conversations(channel, jid, inbox_id)
  WHERE jid IS NOT NULL AND inbox_id IS NOT NULL;

CREATE INDEX ix_conv_contact   ON chat.conversations(contact_id);
CREATE INDEX ix_conv_phone     ON chat.conversations(contact_phone);
CREATE INDEX ix_conv_status    ON chat.conversations(status);
CREATE INDEX ix_conv_company   ON chat.conversations(company_id);
CREATE INDEX ix_conv_last_msg  ON chat.conversations(last_message_at DESC);
CREATE INDEX ix_conv_assigned  ON chat.conversations(assigned_to_id) WHERE assigned_to_id IS NOT NULL;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON chat.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- chat.messages — todas as mensagens (in + out)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE chat.messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            text NOT NULL,
  conversation_id       uuid NOT NULL REFERENCES chat.conversations(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,

  -- Direcao + remetente
  direction             text NOT NULL,           -- INBOUND, OUTBOUND
  sender_type           text NOT NULL,           -- CONTACT, HUMAN, AGENT_IA, SYSTEM
  sender_id             text,                    -- crm.users.id (HUMAN) ou ai.agent_runs.id (AGENT_IA)

  -- Conteudo
  message_type          text NOT NULL,
  -- TEXT, IMAGE, AUDIO, DOCUMENT, VIDEO, LOCATION, CONTACT, STICKER, REACTION, TEMPLATE, BUTTON
  content               text,                    -- texto principal
  caption               text,                    -- legenda de midia
  media_url             text,
  media_mime_type       text,
  media_filename        text,
  media_size_bytes      bigint,

  -- IDs externos
  whatsapp_message_id   text,                    -- key.id Evolution OU wamid Meta
  evolution_instance    text,
  inbox_id              text,
  jid                   text,
  pushname              text,

  -- Status (so faz sentido pra OUTBOUND)
  status                text NOT NULL DEFAULT 'PENDING',
  -- PENDING, SENT, SERVER_ACK, DELIVERED, READ, FAILED, RECEIVED
  failed_reason         text,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  read_at               timestamptz,

  -- Raw (debug)
  raw_payload           jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Idempotencia: msg unica por (whatsapp_message_id, instancia/inbox)
CREATE UNIQUE INDEX uq_msg_evolution
  ON chat.messages(whatsapp_message_id, evolution_instance)
  WHERE whatsapp_message_id IS NOT NULL AND evolution_instance IS NOT NULL;
CREATE UNIQUE INDEX uq_msg_inbox
  ON chat.messages(whatsapp_message_id, inbox_id)
  WHERE whatsapp_message_id IS NOT NULL AND inbox_id IS NOT NULL;

CREATE INDEX ix_msg_conv      ON chat.messages(conversation_id);
CREATE INDEX ix_msg_contact   ON chat.messages(contact_id);
CREATE INDEX ix_msg_created   ON chat.messages(created_at DESC);
CREATE INDEX ix_msg_direction ON chat.messages(direction);
CREATE INDEX ix_msg_status    ON chat.messages(status) WHERE direction = 'OUTBOUND';
CREATE INDEX ix_msg_jid       ON chat.messages(jid) WHERE jid IS NOT NULL;
CREATE INDEX ix_msg_sender    ON chat.messages(sender_type, sender_id);

-- Constraints
ALTER TABLE chat.messages ADD CONSTRAINT chk_msg_direction CHECK (direction IN ('INBOUND','OUTBOUND'));
ALTER TABLE chat.messages ADD CONSTRAINT chk_msg_sender CHECK (sender_type IN ('CONTACT','HUMAN','AGENT_IA','SYSTEM'));
ALTER TABLE chat.messages ADD CONSTRAINT chk_msg_status CHECK (
  status IN ('PENDING','SENT','SERVER_ACK','DELIVERED','READ','FAILED','RECEIVED')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- chat.message_embeddings — pgvector pro RAG (1 por mensagem)
-- text-embedding-3-small=1536 dim. Vamos com 1536 default.
-- Se mudarmos pra 3-large (3072) ou voyage-3 (1024), criar table separada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE chat.message_embeddings (
  message_id    uuid PRIMARY KEY REFERENCES chat.messages(id) ON DELETE CASCADE,
  embedding     extensions.vector(1536) NOT NULL,
  model         text NOT NULL DEFAULT 'text-embedding-3-small',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- HNSW index pra similarity search (mais rapido que IVFFlat em writes)
CREATE INDEX ix_msg_emb_hnsw ON chat.message_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- chat.contact_facts — Mem0-style: fatos extraidos das conversas
-- Ex: "Igor quer Honda CG 160", "objecao: prazo de carencia", "esposa tambem usa carro"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE chat.contact_facts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id         uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  company_id         text NOT NULL,

  fact               text NOT NULL,           -- frase extraida ou reformulada pelo LLM
  category           text NOT NULL,
  -- VEHICLE_INTEREST, OBJECTION, PERSONAL, FINANCIAL, COMPETITOR, PREFERENCE, CONTACT_INFO, OTHER
  confidence         float NOT NULL DEFAULT 1.0,    -- 0..1

  source_type        text NOT NULL,            -- AGENT_IA, HUMAN, INFERRED, IMPORTED
  source_message_id  uuid REFERENCES chat.messages(id) ON DELETE SET NULL,
  source_run_id      uuid,                     -- ai.agent_runs.id (FK em 130_ai)

  expires_at         timestamptz,              -- alguns fatos têm validade
  is_active          boolean NOT NULL DEFAULT true,
  superseded_by_id   uuid REFERENCES chat.contact_facts(id) ON DELETE SET NULL,

  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_facts_contact   ON chat.contact_facts(contact_id) WHERE is_active = true;
CREATE INDEX ix_facts_category  ON chat.contact_facts(category) WHERE is_active = true;
CREATE INDEX ix_facts_company   ON chat.contact_facts(company_id);
CREATE INDEX ix_facts_fact_trgm ON chat.contact_facts USING gin (fact extensions.gin_trgm_ops);
