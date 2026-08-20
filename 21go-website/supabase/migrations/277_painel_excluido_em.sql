-- =============================================================================
-- 277_painel_excluido_em.sql
-- Separa "desativado" de "excluido".
--
-- Os dois sao soft delete no banco (apagar a linha soltaria o `vendedor_slug`
-- pra outra pessoa e reescreveria o historico de quem trouxe cada lead), mas na
-- tela precisam ser coisas diferentes: quem o dono DESATIVA continua listado,
-- podendo voltar; quem ele EXCLUI tem que sumir da lista, senao parece que o
-- botao nao funcionou.
--
-- O nome de quem foi excluido continua aparecendo na coluna "Trazido por" da
-- lista de leads: a consulta de leads le a tabela inteira, inclusive excluidos.
-- =============================================================================

ALTER TABLE public.painel_usuarios
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
