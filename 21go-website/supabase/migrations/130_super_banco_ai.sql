-- =============================================================================
-- 130_super_banco_ai.sql
-- schema AI: agents, agent_runs, agent_actions, escalations, knowledge_chunks
-- Tudo do agente IA: config, execucoes, tool calls, escalations, RAG da base
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.agents — config dos agentes (substitui a tabela ai_agents do banco antigo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.agents (
  id                    text PRIMARY KEY,                  -- pre-venda, pos-venda, sinistros, retencao, ...
  name                  text NOT NULL,                      -- "Leticya"
  display_name          text NOT NULL,                      -- "Leticya — Atendente Virtual 21Go"
  domain                text NOT NULL,                      -- PRE_VENDA, POS_VENDA, SINISTRO, RETENCAO, GESTAO, OPERACAO, FINANCEIRO, TRAFEGO, CRESCIMENTO, SEO, CHIEF
  persona_description   text NOT NULL,                      -- system prompt da persona
  framework             text,                                -- CLOSER, AIDA, SPIN, etc

  default_model         text NOT NULL DEFAULT 'claude-sonnet-4-6',
  supervisor_model      text,                                -- claude-opus-4-7
  classifier_model      text,                                -- claude-haiku-4-5-20251001

  temperature           float NOT NULL DEFAULT 0.75,
  max_tokens            int NOT NULL DEFAULT 1024,

  -- Glossarios (compliance SUSEP)
  glossary_required     text[],                              -- ["protecao","cota","rateio"]
  glossary_forbidden    text[],                              -- ["seguro","apolice","indenizacao"]

  -- Variabilidade humanizada
  greetings             text[],                              -- 10+ formas de cumprimentar
  closings              text[],                              -- 10+ formas de despedir

  -- Escalation triggers
  escalation_keywords   text[],                              -- "cancelar","reclamacao","sinistro","desconto"

  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON ai.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.agent_runs — cada execucao do agente (Langfuse-style)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.agent_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text NOT NULL REFERENCES ai.agents(id),
  conversation_id       uuid REFERENCES chat.conversations(id) ON DELETE CASCADE,
  contact_id            uuid REFERENCES core.contacts(id) ON DELETE CASCADE,
  trigger_message_id    uuid REFERENCES chat.messages(id) ON DELETE SET NULL,

  -- Modelos usados (constelacao)
  classifier_model      text,
  generator_model       text NOT NULL,
  supervisor_model      text,

  -- Classificacao (output do classifier)
  classified_intent     text,           -- COTACAO, OBJECAO, DUVIDA, SAUDACAO, SINISTRO, FORA_DO_ESCOPO
  classified_sentiment  text,           -- POSITIVO, NEUTRO, NEGATIVO
  classified_urgency    text,           -- BAIXA, NORMAL, ALTA

  -- Metricas
  total_tokens_input    int NOT NULL DEFAULT 0,
  total_tokens_output   int NOT NULL DEFAULT 0,
  total_cost_usd_cents  int NOT NULL DEFAULT 0,         -- custo em centavos USD
  latency_ms            int NOT NULL DEFAULT 0,

  -- Estado final
  status                text NOT NULL DEFAULT 'PENDING',
  -- PENDING, SUCCESS, FAILED, ESCALATED, BLOCKED_BY_SUPERVISOR, ABORTED
  error                 text,

  -- Inputs/outputs (debug + replay)
  input_messages        jsonb,                              -- historico passado pro modelo
  rag_chunks            jsonb,                              -- chunks de knowledge_chunks usados
  facts_injected        jsonb,                              -- contact_facts injetados no contexto
  output_message        text,                                -- resposta final enviada ao cliente
  supervisor_verdict    text,                                -- APROVADO, BLOQUEADO, AJUSTADO
  supervisor_reason     text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz
);
CREATE INDEX ix_runs_conv       ON ai.agent_runs(conversation_id);
CREATE INDEX ix_runs_contact    ON ai.agent_runs(contact_id);
CREATE INDEX ix_runs_status     ON ai.agent_runs(status);
CREATE INDEX ix_runs_created    ON ai.agent_runs(created_at DESC);
CREATE INDEX ix_runs_agent      ON ai.agent_runs(agent_id, created_at DESC);

-- Adicionar a FK de chat.contact_facts.source_run_id agora que ai.agent_runs existe
ALTER TABLE chat.contact_facts
  ADD CONSTRAINT contact_facts_source_run_fk
  FOREIGN KEY (source_run_id) REFERENCES ai.agent_runs(id) ON DELETE SET NULL;

-- E core.leads.agente_ia_run_id
ALTER TABLE core.leads
  ADD CONSTRAINT leads_agente_run_fk
  FOREIGN KEY (agente_ia_run_id) REFERENCES ai.agent_runs(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.agent_actions — tool calls feitas durante uma run
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.agent_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES ai.agent_runs(id) ON DELETE CASCADE,

  step          int NOT NULL,                  -- ordem dentro da run (1, 2, 3...)
  tool_name     text NOT NULL,
  -- Tools previstas: getLeadByPhone, getContactByPhone, calcularFIPE, gerarCotacao,
  -- gerarPDF, enviarPDF, salvarLead, atualizarStatusFunil, buscarConhecimento,
  -- buscarConversasSimilares, registrarFato, escalarHumano, marcarFollowUp
  input         jsonb,
  output        jsonb,

  status        text NOT NULL,                 -- SUCCESS, FAILED, RETRYING
  error         text,
  latency_ms    int,

  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_actions_run  ON ai.agent_actions(run_id, step);
CREATE INDEX ix_actions_tool ON ai.agent_actions(tool_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.escalations — quando passou pra humano
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.escalations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            uuid NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
  conversation_id       uuid REFERENCES chat.conversations(id) ON DELETE CASCADE,
  triggered_by_run_id   uuid REFERENCES ai.agent_runs(id) ON DELETE SET NULL,

  reason                text NOT NULL,
  -- SINISTRO, CANCELAMENTO, OBJECAO_FORTE, VALOR_ALTO, FORA_DA_BASE,
  -- USER_REQUESTED, COMPLIANCE_BLOCK, RECLAMACAO, JURIDICO
  urgency               text NOT NULL DEFAULT 'NORMAL',  -- LOW, NORMAL, HIGH, CRITICAL

  notes                 text,
  context               jsonb,                            -- snapshot ultimas N msgs + facts relevantes

  status                text NOT NULL DEFAULT 'PENDING',  -- PENDING, ASSIGNED, RESOLVED
  assigned_to_id        text,                              -- crm.users.id (FK depois)
  resolved_at           timestamptz,
  resolution_notes      text,

  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_esc_status   ON ai.escalations(status, urgency);
CREATE INDEX ix_esc_contact  ON ai.escalations(contact_id);
CREATE INDEX ix_esc_created  ON ai.escalations(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.knowledge_chunks — RAG da base 21Go (planos, FAQ, condicoes gerais, scripts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.knowledge_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,
  -- PLANOS, FAQ, CONDICOES_GERAIS, SCRIPTS_OBJECAO, GLOSSARIO, COMPLIANCE_SUSEP, ABOUT_21GO
  source_doc_id   text,                                    -- ID externo do doc original
  chunk_index     int NOT NULL,                            -- ordem dentro do doc

  content         text NOT NULL,
  embedding       extensions.vector(1536),

  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {titulo, secao, tags, version}

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_kc_source       ON ai.knowledge_chunks(source);
CREATE INDEX ix_kc_emb_hnsw     ON ai.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;
CREATE INDEX ix_kc_content_trgm ON ai.knowledge_chunks USING gin (content extensions.gin_trgm_ops);
CREATE TRIGGER kc_updated_at BEFORE UPDATE ON ai.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ai.message_variations — banco de aberturas/fechamentos rotacionados
-- (anti-robô: nunca responder igual ao mesmo input)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ai.message_variations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     text NOT NULL REFERENCES ai.agents(id) ON DELETE CASCADE,
  category     text NOT NULL,                              -- GREETING, ACKNOWLEDGE, THINKING, FAREWELL, ASK_PHONE, ASK_PLATE, ETC
  text         text NOT NULL,
  weight       int NOT NULL DEFAULT 100,                   -- pesagem na sortei aleatorio
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_var_agent_cat ON ai.message_variations(agent_id, category) WHERE is_active = true;
