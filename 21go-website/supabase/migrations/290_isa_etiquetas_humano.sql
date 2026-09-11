-- =============================================================================
-- 290_isa_etiquetas_humano.sql
-- Painel/app da Isa (pedido do dono, 11/09/2026):
--   - etiquetas por contato (falta documento, vistoria, quente, frio...) pra
--     filtrar no painel e no CRM;
--   - humano_em: quando alguem do time respondeu pelo painel. A Isa nao manda
--     nada por cima dessa mensagem ate o cliente responder.
-- So colunas NOVAS na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS humano_em timestamptz;

NOTIFY pgrst, 'reload schema';
