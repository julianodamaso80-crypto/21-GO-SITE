-- =============================================================================
-- 272_sites_consultor_avisos.sql
-- Marcas de "ja avisei" — o cron roda todo dia e nao pode remandar a mesma
-- mensagem toda vez que rodar. Sem isto, o consultor receberia o aviso de
-- vencimento uma vez por dia ate pagar, o que e assedio e queima o numero.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS aviso_vencimento_em   timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_cancelamento_em timestamptz,
  -- Guarda a data que o aviso cobriu. Assinatura e mensal: no mes seguinte a
  -- data muda e o aviso pode (deve) sair de novo.
  ADD COLUMN IF NOT EXISTS aviso_vencimento_ref  date;

-- Quem o cron precisa olhar todo dia.
CREATE INDEX IF NOT EXISTS ix_sites_consultor_cobranca
  ON public.sites_consultor(status, proximo_vencimento)
  WHERE status IN ('pendente', 'ativo', 'inadimplente');
