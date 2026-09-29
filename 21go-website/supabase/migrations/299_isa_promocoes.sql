-- Disparo da promocao "40% na ativacao" (dono, 29/09/2026) pelo template ativacao_atualizada_v18.
-- Uma linha por pessoa: quem entrou em contato de 01 a 24/09. O cron da Isa manda em ordem de
-- dia (lote_dia) e a Isa le daqui o valor antes e depois quando o cliente responde.
CREATE TABLE IF NOT EXISTS public.isa_promocoes (
  telefone        text PRIMARY KEY,
  campanha        text NOT NULL,
  nome            text,
  veiculo         text NOT NULL,
  valor_anterior  numeric(10,2) NOT NULL,
  valor_novo      numeric(10,2) NOT NULL,
  validade        date NOT NULL,
  -- 'site' = ativacao que o site mostrou; 'power' = a do card no Power (sem registro do site)
  origem_valor    text NOT NULL,
  lote_dia        date NOT NULL,
  ordem           integer NOT NULL DEFAULT 0,
  negotiation_code text,
  -- fila | enviando | enviada | pulada | falhou
  status          text NOT NULL DEFAULT 'fila',
  motivo          text,
  wamid           text,
  enviado_em      timestamptz,
  -- seguir | agora_nao | texto
  resposta        text,
  respondido_em   timestamptz,
  criada_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS isa_promocoes_fila ON public.isa_promocoes (status, lote_dia, ordem);
