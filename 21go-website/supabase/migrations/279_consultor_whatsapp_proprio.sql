-- =============================================================================
-- 279_consultor_whatsapp_proprio.sql
-- O consultor conecta o WhatsApp DELE por QR code, no proprio painel.
--
-- Ate agora o unico numero conectado era o da casa (`site4824`), e por isso o
-- site vendido nao podia disparar nada: a mensagem chegava ao cliente assinada
-- "consultora leticya" e roubava o lead que o consultor pagou pra ter
-- (REGRA 0.1). Com o chip dele conectado, o disparo passa a sair do numero
-- dele — some o motivo da proibicao.
--
-- A instancia e derivada do slug (`parceiro_<slug>`), mas fica gravada: se um
-- dia a regra de nome mudar, quem ja conectou continua apontando pro lugar
-- certo.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS evolution_instancia text;
ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS evolution_conectado_em timestamptz;
ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS evolution_numero text;
