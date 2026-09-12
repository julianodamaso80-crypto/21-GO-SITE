-- =============================================================================
-- 292_isa_funil.sql
-- Funil (kanban) do atendimento da Isa — pedido do dono em 11/09/2026, pra a
-- Leticya organizar quem está conversando por etapa e arrastar pra onde quiser.
--   etapa:    escolha MANUAL (vence a etapa automática); NULL = automática
--   etapa_em: quando alguém arrastou o card
-- Só colunas NOVAS na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS etapa text;
ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS etapa_em timestamptz;

NOTIFY pgrst, 'reload schema';
