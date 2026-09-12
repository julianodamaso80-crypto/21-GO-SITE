-- =============================================================================
-- 294_isa_venda.sql — auditoria da Isa, 12/09/2026
-- Tres colunas NOVAS na tabela da Isa (nada existente muda):
--   retomar_apos          — cliente se despediu ("ok obrigado", "vou pensar"): a retomada
--                           espera ate aqui em vez de chegar 1 h depois
--   pergunta_pendente     — "vou confirmar e ja te retorno": a pergunta que espera a resposta
--                           do dono (entra na aba "Precisa de voce" ate ser respondida)
--   aviso_fora_horario_em — aviso de "atendimento das 8h as 22h" ja enviado nesta noite
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS retomar_apos timestamptz;
ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS pergunta_pendente jsonb;
ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS aviso_fora_horario_em timestamptz;

NOTIFY pgrst, 'reload schema';
