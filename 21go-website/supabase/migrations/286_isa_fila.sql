-- =============================================================================
-- 286_isa_fila.sql
-- Completa a 285: as duas colunas que a fila da Isa precisa. So na tabela dela.
--
-- ultimo_inbound_em: gravado pelo webhook (relogio do banco) a cada mensagem NOVA
-- do cliente. A Isa responde quando ele passa de processado_ate e ja faz ~10 s
-- que o cliente parou de digitar — e assim que as mensagens picadas viram uma
-- resposta so, e o controle sobrevive a deploy (nao e timer em memoria).
--
-- janela_ate: ultimo_inbound_em + 24 h. Fora dela a Meta so aceita template;
-- o painel mostra quanto falta e bloqueia texto livre depois disso.
-- =============================================================================

ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS ultimo_inbound_em timestamptz;
ALTER TABLE public.isa_contatos ADD COLUMN IF NOT EXISTS janela_ate        timestamptz;

CREATE INDEX IF NOT EXISTS isa_contatos_pendentes_idx
  ON public.isa_contatos (ultimo_inbound_em)
  WHERE ultimo_inbound_em IS NOT NULL;

NOTIFY pgrst, 'reload schema';
