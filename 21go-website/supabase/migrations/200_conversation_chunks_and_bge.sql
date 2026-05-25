-- =============================================================================
-- 200_conversation_chunks_and_bge.sql
-- FASE 1.C — tabela ai.conversation_chunks
-- + ajuste de dimensão dos vetores pra BGE-M3 (1024-dim) em vez de 1536
-- =============================================================================

-- Knowledge: troca vector(1536) -> vector(1024) (BGE-M3)
-- Como ainda nao geramos embedding, drop+add e seguro
ALTER TABLE ai.knowledge_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE ai.knowledge_chunks ADD COLUMN embedding extensions.vector(1024);
DROP INDEX IF EXISTS ix_kc_emb_hnsw;
CREATE INDEX ix_kc_emb_hnsw ON ai.knowledge_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Mesmo pra chat.message_embeddings
ALTER TABLE chat.message_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE chat.message_embeddings ADD COLUMN embedding extensions.vector(1024);
DROP INDEX IF EXISTS ix_msg_emb_hnsw;
CREATE INDEX ix_msg_emb_hnsw ON chat.message_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);

-- Nova tabela: conversation_chunks (janelas de 4-8 msgs com metadata)
CREATE TABLE IF NOT EXISTS ai.conversation_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat.conversations(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES core.contacts(id) ON DELETE SET NULL,
  chunk_index     int NOT NULL,

  -- Conteudo: texto narrado das msgs (pra embed) + JSON cru
  content         text NOT NULL,
  messages_window jsonb NOT NULL,              -- array de msgs [{direction, content, created_at, sender_type}]

  -- Metadata pra filtros de RAG
  outcome         text NOT NULL DEFAULT 'in_progress',  -- won, lost, in_progress
  vehicle_type    text,                                  -- carro, moto, suv, especial, desconhecido
  objection_type  text,                                  -- preco, prazo, confianca, comparacao, outro (extraido depois)
  contains_price  boolean NOT NULL DEFAULT false,
  contains_fipe   boolean NOT NULL DEFAULT false,
  msg_count       int NOT NULL DEFAULT 0,

  embedding       extensions.vector(1024),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (conversation_id, chunk_index)
);

CREATE INDEX ix_cc_conv     ON ai.conversation_chunks(conversation_id);
CREATE INDEX ix_cc_contact  ON ai.conversation_chunks(contact_id);
CREATE INDEX ix_cc_outcome  ON ai.conversation_chunks(outcome);
CREATE INDEX ix_cc_vehicle  ON ai.conversation_chunks(vehicle_type);
CREATE INDEX ix_cc_emb_hnsw ON ai.conversation_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;
CREATE INDEX ix_cc_content_trgm ON ai.conversation_chunks
  USING gin (content extensions.gin_trgm_ops);
