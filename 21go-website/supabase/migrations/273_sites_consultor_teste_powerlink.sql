-- =============================================================================
-- 273_sites_consultor_teste_powerlink.sql
-- A prova de que o site do consultor manda o lead pro Power DELE.
--
-- Regra do dono (12/08/2026): o link so pode ser enviado no WhatsApp depois de
-- confirmado que uma cotacao de teste caiu no Power daquela pessoa. Se nao cair,
-- nao manda — arruma ate cair.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS teste_ok          boolean,
  ADD COLUMN IF NOT EXISTS teste_em          timestamptz,
  ADD COLUMN IF NOT EXISTS teste_tentativas  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teste_negociacao  text,
  ADD COLUMN IF NOT EXISTS teste_motivo      text,
  -- Enquanto for NULL, o consultor NAO recebeu o link. E o que impede o mesmo
  -- link de ser mandado duas vezes quando o cron reprocessa.
  ADD COLUMN IF NOT EXISTS link_enviado_em   timestamptz;

-- A fila do cron: pago, mas ainda sem prova de que o lead cai no lugar certo.
CREATE INDEX IF NOT EXISTS ix_sites_consultor_sem_teste
  ON public.sites_consultor(status)
  WHERE status = 'ativo' AND link_enviado_em IS NULL;
