-- 296_leads_power_responsavel.sql — dono, 14/09/2026: "placa presa com outro consultor" nao vai pra Isa.
-- O Power cria a cotacao mesmo assim, mas a negociacao nasce com o responsibleId do outro consultor.
-- Coluna NOVA, nada existente muda. Ja aplicada.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS power_responsavel text;
NOTIFY pgrst, 'reload schema';
