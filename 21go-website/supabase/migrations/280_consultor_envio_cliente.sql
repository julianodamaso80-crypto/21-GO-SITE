-- =============================================================================
-- 280_consultor_envio_cliente.sql
-- O consultor decide se a cotacao vai direto pro cliente pelo numero DELE.
--
-- Comeca DESLIGADO de proposito. Disparo automatico e o padrao que faz numero
-- ser derrubado pelo WhatsApp, e o chip aqui e o dele — quem assume esse risco
-- tem que ser ele, num clique consciente, nao um default nosso.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS enviar_ao_cliente boolean NOT NULL DEFAULT false;
