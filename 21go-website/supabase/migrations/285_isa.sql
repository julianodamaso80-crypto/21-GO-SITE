-- =============================================================================
-- 285_isa.sql
-- Estado e historico da Isa, o robo de atendimento no 98004-0964 (Cloud API).
--
-- So tabelas NOVAS: o banco e o mesmo do CRM, entao nada aqui altera coluna ou
-- tabela existente. As mensagens continuam em conversations/messages
-- (evolution_instance = 'cloud_isa'); estas duas guardam o que e so da Isa.
--
-- RLS ligado e sem policy: so a service role (servidor) le e escreve. As tabelas
-- guardam telefone e o motivo de cada pausa — nao podem ficar abertas pra chave
-- anon como as tabelas antigas ficaram.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.isa_contatos (
  telefone            text PRIMARY KEY,           -- 55DDDNUMERO, como o from da Meta
  company_id          text NOT NULL DEFAULT 'company-21go',
  conversation_id     text,
  lead_id             text,
  nome                text,

  -- Liga/desliga por contato. Desligada = a Isa nao fala mais com esse cliente
  -- ate alguem religar no painel (ou ela mesma pausar num gatilho).
  ligada              boolean NOT NULL DEFAULT true,
  pausa_motivo        text,                        -- documento, associado, desconto_extra, robo, hostil, sem_preco, validador, manual
  pausa_por           text,                        -- isa | juliano | leticya
  pausada_em          timestamptz,
  transferido_em      timestamptz,

  entrada             text,                        -- popup | 5min | direto
  desconto50_em       timestamptz,                 -- os R$ 50 sao 1 vez por telefone
  desconto50_de       numeric(10,2),
  desconto50_para     numeric(10,2),
  aguardando_dono     text,                        -- desconto: esperando o 4240 responder
  genero              text,                        -- m | f, so quando aparece na conversa
  preco_da_tabela     boolean NOT NULL DEFAULT false,

  -- Fila: a Isa responde tudo que chegou depois de processado_ate. O lock evita
  -- dois workers (webhook + cron, ou os 2 containers do blue/green) respondendo
  -- a mesma conversa ao mesmo tempo.
  processado_ate      timestamptz,
  processando_desde   timestamptz,
  ultima_resposta_em  timestamptz,
  retomada_em         timestamptz,
  abordagem5min_em    timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.isa_eventos (
  id          bigserial PRIMARY KEY,
  telefone    text NOT NULL,
  tipo        text NOT NULL,                       -- gatilho, alerta, desconto, transferencia, validador, envio_falhou, ligou, desligou
  detalhe     jsonb,
  por         text,                                -- isa | juliano | leticya | sistema
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS isa_eventos_telefone_idx ON public.isa_eventos (telefone, created_at DESC);
CREATE INDEX IF NOT EXISTS isa_contatos_fila_idx ON public.isa_contatos (processado_ate) WHERE ligada;

ALTER TABLE public.isa_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.isa_eventos  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isa_contatos FROM anon, authenticated;
REVOKE ALL ON public.isa_eventos  FROM anon, authenticated;

COMMENT ON TABLE public.isa_contatos IS 'Estado da Isa por cliente (Cloud API 98004-0964). Mensagens ficam em messages com evolution_instance=cloud_isa.';
COMMENT ON TABLE public.isa_eventos  IS 'Por que a Isa fez cada coisa: gatilho, alerta, desconto, transferencia, validador.';

NOTIFY pgrst, 'reload schema';
