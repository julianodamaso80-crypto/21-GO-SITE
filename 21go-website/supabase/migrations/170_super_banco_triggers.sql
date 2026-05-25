-- =============================================================================
-- 170_super_banco_triggers.sql
-- Triggers cross-schema:
--   1. Atualizar conversation.last_message_at + total_messages ao inserir message
--   2. Recalcular contact_temperature ao inserir message OU mudar lead.etapa_funil
--   3. Normalizar telefone/cpf ao inserir contact
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Atualiza conversation ao inserir message
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.fn_update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat.conversations
  SET
    last_message_at  = COALESCE(NEW.sent_at, NEW.created_at, now()),
    total_messages   = total_messages + 1,
    last_inbound_at  = CASE
      WHEN NEW.direction = 'INBOUND'
        THEN COALESCE(NEW.sent_at, NEW.created_at, now())
      ELSE last_inbound_at
    END,
    first_inbound_at = CASE
      WHEN NEW.direction = 'INBOUND' AND first_inbound_at IS NULL
        THEN COALESCE(NEW.sent_at, NEW.created_at, now())
      ELSE first_inbound_at
    END,
    first_outbound_at = CASE
      WHEN NEW.direction = 'OUTBOUND' AND first_outbound_at IS NULL
        THEN COALESCE(NEW.sent_at, NEW.created_at, now())
      ELSE first_outbound_at
    END,
    unread_count = CASE
      WHEN NEW.direction = 'INBOUND'
        THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_msg_update_conversation
  AFTER INSERT ON chat.messages
  FOR EACH ROW EXECUTE FUNCTION chat.fn_update_conversation_on_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Normaliza telefone/cpf ao inserir/atualizar contact
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_normalize_contact_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telefone := public.normalize_phone(NEW.telefone);
  NEW.whatsapp := public.normalize_phone(NEW.whatsapp);
  NEW.cpf      := public.normalize_cpf(NEW.cpf);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_normalize
  BEFORE INSERT OR UPDATE OF telefone, whatsapp, cpf ON core.contacts
  FOR EACH ROW EXECUTE FUNCTION core.fn_normalize_contact_fields();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Mantem core.contact_temperature em dia
--    Recalcula quando: nova message inbound | lead muda etapa | virou associado
--    Score: 0-100 (ver regras abaixo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_recompute_temperature(p_contact_id uuid)
RETURNS void AS $$
DECLARE
  v_company_id text;
  v_msgs_in    int := 0;
  v_msgs_out   int := 0;
  v_last_msg   timestamptz;
  v_last_dir   text;
  v_pdf_aberto boolean := false;
  v_wa_clicado boolean := false;
  v_cot_enviada boolean := false;
  v_is_assoc   boolean := false;
  v_status     text := 'FRIO';
  v_score      int := 0;
  v_reason     text := '';
  v_dias_msg   int;
BEGIN
  -- Pega company + flag associado
  SELECT company_id, is_associado INTO v_company_id, v_is_assoc
  FROM core.contacts WHERE id = p_contact_id;
  IF v_company_id IS NULL THEN RETURN; END IF;

  -- Conta msgs
  SELECT
    count(*) FILTER (WHERE direction = 'INBOUND'),
    count(*) FILTER (WHERE direction = 'OUTBOUND'),
    max(created_at),
    (array_agg(direction ORDER BY created_at DESC))[1]
  INTO v_msgs_in, v_msgs_out, v_last_msg, v_last_dir
  FROM chat.messages WHERE contact_id = p_contact_id;

  -- Sinais do funil
  SELECT
    bool_or(pdf_aberto),
    bool_or(whatsapp_clicado),
    bool_or(cotacao_enviada)
  INTO v_pdf_aberto, v_wa_clicado, v_cot_enviada
  FROM core.leads WHERE contact_id = p_contact_id;

  v_dias_msg := COALESCE(EXTRACT(DAY FROM (now() - v_last_msg))::int, 9999);

  -- Regras (em ordem, primeira que casa ganha)
  IF v_is_assoc THEN
    v_status := 'CLIENTE';
    v_score := 100;
    v_reason := 'Associado ativo';
  ELSIF v_dias_msg > 180 THEN
    v_status := 'INATIVO';
    v_score := 5;
    v_reason := 'Sem interacao ha mais de 180 dias';
  ELSIF v_dias_msg <= 7 AND v_msgs_in > 0 AND COALESCE(v_pdf_aberto, false) THEN
    v_status := 'QUENTE';
    v_score := 90;
    v_reason := 'Mensagem recente + PDF aberto';
  ELSIF v_dias_msg <= 7 AND v_msgs_in > 0 THEN
    v_status := 'QUENTE';
    v_score := 75;
    v_reason := 'Mensagem inbound recente';
  ELSIF v_dias_msg <= 30 AND COALESCE(v_cot_enviada, false) THEN
    v_status := 'MORNO';
    v_score := 50;
    v_reason := 'Cotacao enviada nos ultimos 30 dias';
  ELSIF v_dias_msg <= 30 THEN
    v_status := 'MORNO';
    v_score := 35;
    v_reason := 'Mensagem nos ultimos 30 dias';
  ELSE
    v_status := 'FRIO';
    v_score := 15;
    v_reason := 'Sem interacao recente';
  END IF;

  INSERT INTO core.contact_temperature (
    contact_id, company_id, status, score, reason,
    ultima_mensagem_em, ultima_mensagem_direcao,
    total_msgs_inbound, total_msgs_outbound,
    cotacao_aberta, pdf_aberto, whatsapp_clicado,
    computed_at
  ) VALUES (
    p_contact_id, v_company_id, v_status, v_score, v_reason,
    v_last_msg, v_last_dir,
    COALESCE(v_msgs_in, 0), COALESCE(v_msgs_out, 0),
    COALESCE(v_cot_enviada, false), COALESCE(v_pdf_aberto, false), COALESCE(v_wa_clicado, false),
    now()
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    status                  = EXCLUDED.status,
    score                   = EXCLUDED.score,
    reason                  = EXCLUDED.reason,
    ultima_mensagem_em      = EXCLUDED.ultima_mensagem_em,
    ultima_mensagem_direcao = EXCLUDED.ultima_mensagem_direcao,
    total_msgs_inbound      = EXCLUDED.total_msgs_inbound,
    total_msgs_outbound     = EXCLUDED.total_msgs_outbound,
    cotacao_aberta          = EXCLUDED.cotacao_aberta,
    pdf_aberto              = EXCLUDED.pdf_aberto,
    whatsapp_clicado        = EXCLUDED.whatsapp_clicado,
    computed_at             = now();
END;
$$ LANGUAGE plpgsql;

-- Triggers que disparam recompute
CREATE OR REPLACE FUNCTION core.fn_temperature_on_message()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM core.fn_recompute_temperature(NEW.contact_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_temp_on_message
  AFTER INSERT ON chat.messages
  FOR EACH ROW EXECUTE FUNCTION core.fn_temperature_on_message();

CREATE OR REPLACE FUNCTION core.fn_temperature_on_lead_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM core.fn_recompute_temperature(NEW.contact_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_temp_on_lead
  AFTER INSERT OR UPDATE OF etapa_funil, status, cotacao_enviada, pdf_aberto, whatsapp_clicado
  ON core.leads
  FOR EACH ROW EXECUTE FUNCTION core.fn_temperature_on_lead_change();

CREATE OR REPLACE FUNCTION core.fn_temperature_on_associado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_associado IS DISTINCT FROM OLD.is_associado THEN
    PERFORM core.fn_recompute_temperature(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_temp_on_associado
  AFTER UPDATE OF is_associado ON core.contacts
  FOR EACH ROW EXECUTE FUNCTION core.fn_temperature_on_associado_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Trail de mudanças de etapa do funil (lead_status_history)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tracking.fn_log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.etapa_funil IS DISTINCT FROM OLD.etapa_funil THEN
    INSERT INTO tracking.lead_status_history (
      lead_id, from_status, to_status, source, changed_at
    ) VALUES (
      NEW.id, OLD.etapa_funil, NEW.etapa_funil, 'TRIGGER', now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_lead_status
  AFTER UPDATE OF etapa_funil ON core.leads
  FOR EACH ROW EXECUTE FUNCTION tracking.fn_log_lead_status_change();
