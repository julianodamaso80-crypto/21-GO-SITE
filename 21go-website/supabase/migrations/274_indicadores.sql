-- =============================================================================
-- 274_indicadores.sql
-- Member Get Member rastreavel: saber QUEM indicou QUEM.
--
-- Antes disto o /indique so abria uma conversa no WhatsApp pedindo "quero meu
-- link" — o link era criado na mao, quando era criado, e nada ligava o amigo
-- que fechou a quem trouxe ele. Sem esse elo, o desconto de 10% depende de
-- alguem lembrar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.indicadores (
  -- Codigo curto que vai na URL (?ind=xxxxx). Curto porque vai ser ditado no
  -- WhatsApp e lido em print de celular.
  codigo       text PRIMARY KEY,

  nome         text NOT NULL,
  whatsapp     text NOT NULL,              -- E.164 sem '+'

  -- De qual site ele pegou o link. Num site de consultor, a indicacao nasce
  -- dentro do funil DAQUELE consultor — e o lead indicado tem que continuar
  -- caindo no Power dele, nao no da casa.
  consultor_slug text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso   timestamptz
);

-- Uma pessoa, um codigo. Pedir o link duas vezes tem que devolver o MESMO
-- codigo, senao ela espalha dois links e as indicacoes ficam divididas entre os
-- dois — cada um contando metade do desconto que ela ganhou.
CREATE UNIQUE INDEX IF NOT EXISTS ux_indicadores_whatsapp
  ON public.indicadores(whatsapp);

CREATE INDEX IF NOT EXISTS ix_indicadores_consultor
  ON public.indicadores(consultor_slug);

-- ─── o elo no lead ──────────────────────────────────────────────────────────
-- Guarda o CODIGO (e nao o id) porque e o que viaja na URL e no cookie: se um
-- dia o codigo for digitado errado, da pra ver o valor cru que chegou.
ALTER TABLE public.lead_attribution
  ADD COLUMN IF NOT EXISTS indicado_por text;

CREATE INDEX IF NOT EXISTS ix_lead_attribution_indicado_por
  ON public.lead_attribution(indicado_por)
  WHERE indicado_por IS NOT NULL;
