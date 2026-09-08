-- =============================================================================
-- 284_sites_consultor_mensalidade.sql
-- O preco deixa de ser o mesmo pra todo mundo.
--
-- Ate aqui `MENSALIDADE = 80` (lib/precos.ts) valia pra todos, e o valor estava
-- escrito A MAO dentro das tres mensagens de cobranca. Com um consultor em R$
-- 100 (andersonagripino, ordem do dono 08/09/2026) isso viraria o pior tipo de
-- erro: a assinatura cobrando 100 e o WhatsApp dizendo 80.
--
-- Esta coluna e a fonte do que as MENSAGENS dizem. Quem cobra de fato continua
-- sendo a assinatura no Asaas — as duas tem que andar juntas, e por isso mudar
-- o valor de alguem e sempre dois passos: esta coluna e a assinatura la.
--
-- Default 80: quem ja existe e quem entrar pelo formulario segue no preco de
-- tabela, sem precisar de backfill.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS mensalidade numeric(10,2) NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.sites_consultor.mensalidade IS
  'O que as mensagens de cobranca dizem. Tem que bater com o value da assinatura no Asaas.';
