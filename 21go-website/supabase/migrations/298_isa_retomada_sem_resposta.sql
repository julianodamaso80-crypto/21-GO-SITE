-- =============================================================================
-- 298_isa_retomada_sem_resposta.sql
-- Segunda mensagem: quem recebeu o resultado da simulacao e ficou 10 min sem
-- responder leva o template `duvida_valores_isa`. A coluna marca quem ja levou
-- — uma vez por pessoa. So coluna NOVA na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS retomada_sem_resposta_em timestamptz;

NOTIFY pgrst, 'reload schema';
