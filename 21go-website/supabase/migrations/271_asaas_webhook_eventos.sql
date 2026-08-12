-- =============================================================================
-- 271_asaas_webhook_eventos.sql
-- Idempotencia do webhook do Asaas.
--
-- O Asaas entrega "at least once": o MESMO evento chega mais de uma vez sempre
-- que a resposta demora ou falha. Sem esta tabela, uma reentrega de
-- PAYMENT_OVERDUE reiniciaria a contagem dos 5 dias e o site de um inadimplente
-- ficaria no ar pra sempre.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.asaas_eventos (
  -- O `id` do evento, como o Asaas manda (evt_...). PK de proposito: o INSERT
  -- e a trava. Se der conflito, o evento ja foi processado.
  id           text PRIMARY KEY,
  tipo         text NOT NULL,
  payment_id   text,
  customer_id  text,
  subscription_id text,
  payload      jsonb NOT NULL,
  processado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_asaas_eventos_tipo ON public.asaas_eventos(tipo, processado_em DESC);
CREATE INDEX IF NOT EXISTS ix_asaas_eventos_sub  ON public.asaas_eventos(subscription_id);
