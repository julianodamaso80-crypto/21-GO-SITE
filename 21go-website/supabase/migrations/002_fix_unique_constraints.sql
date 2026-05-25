-- =============================================================================
-- 002_fix_unique_constraints.sql
-- Corrige ON CONFLICT trocando indices UNIQUE parciais por CONSTRAINTs UNIQUE
-- (parciais nao funcionam com PostgreSQL ON CONFLICT).
-- E forca reload do schema cache do PostgREST.
-- =============================================================================

-- ──────── conversations.(jid, evolution_instance) ────────
DROP INDEX IF EXISTS public.uq_conversations_jid_inst;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_jid_instance_key;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_jid_instance_key
  UNIQUE (jid, evolution_instance);

-- ──────── messages.(whatsapp_message_id, evolution_instance) ────────
DROP INDEX IF EXISTS public.uq_messages_wa_id_inst;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_wa_id_instance_key;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_wa_id_instance_key
  UNIQUE (whatsapp_message_id, evolution_instance);

-- ──────── webhook_inbound_log.(source, payload_hash) ────────
DROP INDEX IF EXISTS public.uq_wil_payload_hash;

ALTER TABLE public.webhook_inbound_log
  DROP CONSTRAINT IF EXISTS webhook_inbound_source_hash_key;

ALTER TABLE public.webhook_inbound_log
  ADD CONSTRAINT webhook_inbound_source_hash_key
  UNIQUE (source, payload_hash);

-- ──────── leads UNIQUEs (trk, event_id, quotation_code) ────────
-- Mantemos os indices parciais (trk/event_id/quotation_code) porque o codigo
-- nao usa ON CONFLICT com eles direto — usa upsert com onConflict='trk' que
-- precisa de UNIQUE constraint nativa (nao indice parcial).

DROP INDEX IF EXISTS public.uq_leads_trk;
DROP INDEX IF EXISTS public.uq_leads_event_id;
DROP INDEX IF EXISTS public.uq_leads_quotation_code;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_trk_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_trk_key UNIQUE (trk);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_event_id_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_event_id_key UNIQUE (event_id);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_quotation_code_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_quotation_code_key UNIQUE (quotation_code);

-- ──────── recarregar cache do PostgREST ────────
NOTIFY pgrst, 'reload schema';
