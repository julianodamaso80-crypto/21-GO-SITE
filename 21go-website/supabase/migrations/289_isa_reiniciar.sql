-- =============================================================================
-- 289_isa_reiniciar.sql
-- Comando /reiniciar dos numeros de teste do dono: a Isa passa a ignorar tudo
-- o que veio antes deste instante (historico e simulacoes). As mensagens nao
-- sao apagadas — continuam no painel. So coluna NOVA na tabela da Isa.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS reiniciada_em timestamptz;

NOTIFY pgrst, 'reload schema';
