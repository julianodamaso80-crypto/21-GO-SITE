-- =============================================================================
-- 287_isa_versoes.sql
-- Cotacao sem placa: a Isa lista as versoes do modelo e o cliente responde com
-- o numero. As opcoes que ela mostrou ficam aqui ate ele escolher. So na tabela
-- da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS opcoes_versao jsonb;

NOTIFY pgrst, 'reload schema';
