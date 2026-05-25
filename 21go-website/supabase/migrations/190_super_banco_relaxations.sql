-- =============================================================================
-- 190_super_banco_relaxations.sql
-- Relaxa NOT NULLs que estavam mais rigidos que o banco antigo:
--   - chat.conversations.contact_phone (algumas convs antigas nao tem)
--   - crm.boletos.vencimento (boletos legados sem data setada)
-- =============================================================================

ALTER TABLE chat.conversations ALTER COLUMN contact_phone DROP NOT NULL;
ALTER TABLE crm.boletos ALTER COLUMN vencimento DROP NOT NULL;
