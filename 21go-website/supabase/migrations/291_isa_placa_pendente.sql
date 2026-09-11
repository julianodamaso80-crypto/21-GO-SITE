-- =============================================================================
-- 291_isa_placa_pendente.sql
-- Placa que o cliente mandou e ainda nao foi cotada: antes dos valores a Isa
-- pergunta leilao e aplicativo juntos (dono, 11/09/2026) e guarda a placa aqui
-- ate ele responder. So coluna NOVA na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS placa_pendente text;

NOTIFY pgrst, 'reload schema';
