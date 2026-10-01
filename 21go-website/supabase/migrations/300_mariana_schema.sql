-- =============================================================================
-- 300_mariana_schema.sql
-- Banco da Mariana (a Isa do Gabriel Juliano, 21 96653-0011) — spec
-- docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md, secao 2.
--
-- NAO E APLICADA AUTOMATICAMENTE. Fase 2: aplicar a mao, uma vez, via DIRECT_URL,
-- depois de conferir que CRM e site estao 200. Nunca reset/push.
--
-- Aditiva: so cria o schema `mariana` e copias VAZIAS das tabelas por-bot da Isa.
-- `LIKE ... INCLUDING ALL` copia o esquema VIVO de producao (inclui as colunas
-- criadas fora das migracoes: resolvido_em, precisa_desde, visto_por, veiculo_doc),
-- defaults, PK e indices. conversations/messages/leads continuam em public,
-- separadas por evolution_instance = 'cloud_mariana'.
--
-- isa_eventos.id e bigserial: o INCLUDING DEFAULTS copiaria
-- nextval('public.isa_eventos_id_seq') e a Mariana gastaria a sequencia da Isa.
-- Por isso a sequencia propria logo abaixo.
--
-- RLS ligado e sem policy (so o servidor, pela conexao direta, le e escreve) e
-- nada pra anon/authenticated. O schema nao e exposto no PostgREST.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS mariana;
REVOKE ALL ON SCHEMA mariana FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS mariana.isa_contatos (LIKE public.isa_contatos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_eventos (LIKE public.isa_eventos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_config (LIKE public.isa_config INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_promocoes (LIKE public.isa_promocoes INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.consultor_recrutamento (LIKE public.consultor_recrutamento INCLUDING ALL);

CREATE SEQUENCE IF NOT EXISTS mariana.isa_eventos_id_seq OWNED BY mariana.isa_eventos.id;
ALTER TABLE mariana.isa_eventos ALTER COLUMN id SET DEFAULT nextval('mariana.isa_eventos_id_seq');

ALTER TABLE mariana.isa_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.consultor_recrutamento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA mariana FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mariana FROM anon, authenticated;

COMMIT;

-- Conferencia depois de aplicar (so leitura):
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'mariana' ORDER BY 1;
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema = 'mariana' AND table_name = 'isa_eventos' AND column_name = 'id';
--   -> nextval('mariana.isa_eventos_id_seq'::regclass)
