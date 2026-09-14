-- =============================================================================
-- 297_consultor_recrutamento.sql
-- Quem chegou pelo botao "Quero Ser Consultor" do /seja-consultor e ja foi
-- respondido pelo 4824: guarda so o suficiente pra nao repetir mensagem.
-- Tabela NOVA — nada existente e tocado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.consultor_recrutamento (
  telefone          text PRIMARY KEY,
  nome              text,
  boas_vindas_em    timestamptz,
  aviso_virtual_em  timestamptz,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
