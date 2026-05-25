-- =============================================================================
-- 100_super_banco_extensions.sql
-- Extensions + schemas + roles (rodar primeiro, no banco NOVO virgem)
-- Target: dsclaxtvcbbuxmtmpxpf.supabase.co
-- =============================================================================

-- ----- Extensions -----
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm"    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "unaccent"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector"     WITH SCHEMA extensions;

-- ----- Schemas -----
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS tracking;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS crm;

COMMENT ON SCHEMA core     IS 'Pessoas, veiculos, leads — fonte da verdade';
COMMENT ON SCHEMA chat     IS 'Conversas, mensagens, embeddings, fatos extraidos';
COMMENT ON SCHEMA ai       IS 'Agente IA: runs, actions, knowledge base, escalations';
COMMENT ON SCHEMA tracking IS 'Conversoes, UTMs, status do funil';
COMMENT ON SCHEMA ops      IS 'Auditoria de webhooks e integracoes';
COMMENT ON SCHEMA crm      IS 'Pipelines, phases, cards, users (frontend Kanban)';

-- ----- Permissions: PostgREST expoe public por padrao. Vamos expor TODOS os schemas via API. -----
-- (Supabase usa role 'authenticator' pra autenticar; 'authenticated' pra users logados; 'anon' pra anonimo)
GRANT USAGE ON SCHEMA core, chat, ai, tracking, ops, crm TO postgres, authenticator, authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, chat, ai, tracking, ops, crm GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, chat, ai, tracking, ops, crm GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, chat, ai, tracking, ops, crm GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- Anon e authenticated começam SEM permissão; vamos dar de tabela em tabela quando criar políticas RLS.

-- ----- Helper functions -----
-- Normalizador de telefone BR -> formato E164 sem '+' (ex: 5521994647230)
CREATE OR REPLACE FUNCTION public.normalize_phone(raw text) RETURNS text AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  -- Se começa com 55 e tem 12 ou 13 dígitos, já tá em formato E164
  IF length(digits) IN (12, 13) AND substring(digits, 1, 2) = '55' THEN
    RETURN digits;
  END IF;
  -- Se começa com 0, tira
  IF substring(digits, 1, 1) = '0' THEN
    digits := substring(digits, 2);
  END IF;
  -- Se tem 10 ou 11 dígitos (DDD + número), prepende 55
  IF length(digits) IN (10, 11) THEN
    RETURN '55' || digits;
  END IF;
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Normalizador de CPF -> só dígitos
CREATE OR REPLACE FUNCTION public.normalize_cpf(raw text) RETURNS text AS $$
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  RETURN NULLIF(regexp_replace(raw, '[^0-9]', '', 'g'), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- updated_at trigger genérico
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
