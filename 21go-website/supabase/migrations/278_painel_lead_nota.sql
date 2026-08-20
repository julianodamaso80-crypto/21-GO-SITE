-- =============================================================================
-- 278_painel_lead_nota.sql
-- O dono do painel precisa AGIR sobre o lead, nao so olhar: anotar o que
-- combinou, corrigir um nome digitado errado e tirar da vista o que e teste.
--
-- Excluir e OCULTAR, nunca DELETE: a mesma linha alimenta o funil do PowerCRM e
-- o historico de quem indicou. Some da tela do painel e continua existindo.
-- =============================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nota_painel text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS oculto_painel_em timestamptz;
