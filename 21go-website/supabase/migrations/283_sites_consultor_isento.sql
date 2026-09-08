-- =============================================================================
-- 283_sites_consultor_isento.sql
-- Site que existe mas nao se cobra.
--
-- A conta da casa (`leticyathayene`) nao foi vendida: ela e o site da propria
-- 21Go, criado pelo mesmo formulario so pra ter slug e PowerLink. Cobrar dela
-- os R$ 80 e mandar aviso de vencimento pro numero da casa e ruido — e, no D+2,
-- o cron cortaria o proprio site da operacao.
--
-- Ordem do dono (08/09/2026): vitalicia, para sempre.
--
-- ⚠️ `isento` NAO poe ninguem no ar. Quem ativa continua sendo o webhook do
-- Asaas com pagamento confirmado (REGRA 0). Isto so tira do ciclo de COBRANCA
-- quem ja esta ativo — nunca use como atalho pra liberar quem nao pagou.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS isento boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sites_consultor.isento IS
  'Fora do ciclo de cobranca: o cron nao avisa e nao corta. Nao ativa ninguem.';
