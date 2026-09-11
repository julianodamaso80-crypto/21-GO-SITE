-- =============================================================================
-- 288_isa_config.sql
-- Estado global da Isa que nao e de um cliente: desde quando a mensagem dos
-- 5 min esta ligada (so lead novo daqui pra frente — ligar a chave nao pode
-- disparar pra quem simulou ontem) e se ela foi suspensa pela qualidade do
-- numero na Meta (YELLOW/RED). So tabela NOVA, RLS ligado e sem policy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.isa_config (
  chave       text PRIMARY KEY,
  valor       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.isa_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isa_config FROM anon, authenticated;

COMMENT ON TABLE public.isa_config IS 'Estado global da Isa: 5min (ligado_em, suspenso_em, motivo) e qualidade (rating, verificado_em).';

NOTIFY pgrst, 'reload schema';
