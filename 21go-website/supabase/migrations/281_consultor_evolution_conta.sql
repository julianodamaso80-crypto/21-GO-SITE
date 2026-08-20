-- =============================================================================
-- 281_consultor_evolution_conta.sql
-- A conta de WhatsApp do consultor pode viver em OUTRO servidor Evolution.
--
-- O painel cria instancia na Evolution onde temos a chave global, mas o dono
-- conectou o numero do Anderson numa segunda Evolution, com o nome `anderson`.
-- Sem guardar url e chave, o codigo so saberia falar com a primeira.
--
-- A chave e o token DA INSTANCIA (nao a global do servidor): serve pra enviar
-- por ela e nada mais.
-- =============================================================================

ALTER TABLE public.sites_consultor ADD COLUMN IF NOT EXISTS evolution_url text;
ALTER TABLE public.sites_consultor ADD COLUMN IF NOT EXISTS evolution_chave text;
