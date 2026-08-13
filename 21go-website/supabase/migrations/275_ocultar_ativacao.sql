-- =============================================================================
-- 275_ocultar_ativacao.sql
-- Esconder a taxa de ativacao no site de um consultor especifico.
--
-- Pedido do dono (12/08/2026) para `paivarj21go`: o consultor prefere nao
-- mostrar o valor de ativacao pro cliente e tratar isso na conversa. E opcao
-- POR CONSULTOR, nao global — o resto dos sites continua mostrando.
--
-- Só esconde da vista: o valor continua sendo calculado igual e nada muda na
-- cotacao que vai pro Power.
-- =============================================================================

ALTER TABLE public.sites_consultor
  ADD COLUMN IF NOT EXISTS ocultar_ativacao boolean NOT NULL DEFAULT false;
