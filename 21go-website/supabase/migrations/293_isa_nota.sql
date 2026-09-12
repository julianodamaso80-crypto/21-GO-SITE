-- =============================================================================
-- 293_isa_nota.sql
-- Anotação interna do contato (dono, 12/09/2026: "se eu clicar no lead e quiser
-- escrever algo também posso"). Aparece no card do funil e no painel; o cliente
-- NUNCA vê. Só coluna nova na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS nota text;

NOTIFY pgrst, 'reload schema';
