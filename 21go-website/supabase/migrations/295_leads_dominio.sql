-- 295_leads_dominio.sql — dono, 13/09/2026: "a Isa so pode atender leads dos .site".
-- O lead nao gravava de qual site veio (pdf_url vazio; origem e igual no .site e no .com.br), e a
-- mensagem dos 5 min nao tinha como separar. Coluna NOVA, nada existente muda. Ja aplicada.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dominio text;
NOTIFY pgrst, 'reload schema';
