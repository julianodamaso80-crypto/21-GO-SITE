-- =============================================================================
-- 276_painel_consultor.sql
-- Painel do parceiro: o consultor ve os leads do site dele e quem trouxe cada
-- um; o divulgador ve so o que ele mesmo trouxe.
--
-- ⚠️ Banco compartilhado com o CRM. Tudo aqui e ADITIVO: nenhuma coluna
-- existente e tocada, nenhuma linha e reescrita fora do backfill explicito la
-- embaixo (que so preenche coluna nova).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.painel_usuarios (
  id             text PRIMARY KEY,
  company_id     text NOT NULL DEFAULT 'company-21go',

  -- De quem e o painel. Toda query filtra por isto, sempre tirado da SESSAO —
  -- nunca do host nem da URL.
  consultor_slug text NOT NULL,

  papel          text NOT NULL DEFAULT 'vendedor',   -- 'admin' | 'vendedor'
  nome           text NOT NULL,
  email          text NOT NULL,
  senha_hash     text NOT NULL,
  whatsapp       text,                                -- E.164 sem '+'

  -- O `<este>` de 21go.com.br/andersonagripino/<este>. Imutavel depois de
  -- emitido: a pessoa espalha o link em post e print, e trocar quebra tudo que
  -- ela ja divulgou.
  vendedor_slug  text NOT NULL,

  -- Sobe de 1 a cada exclusao, desativacao ou troca de senha. Como a sessao
  -- carrega este numero assinado, subir aqui mata toda sessao viva da pessoa no
  -- request seguinte — sem tabela de sessao, sem consulta extra.
  token_versao   integer NOT NULL DEFAULT 1,

  ativo          boolean NOT NULL DEFAULT true,

  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_login_em timestamptz
);

-- Um e-mail entra uma vez por painel. Dois cadastros do mesmo e-mail seriam
-- dois links concorrendo pela mesma pessoa, cada um contando metade.
CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_email
  ON public.painel_usuarios(consultor_slug, lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_vendedor
  ON public.painel_usuarios(consultor_slug, vendedor_slug);

CREATE INDEX IF NOT EXISTS ix_painel_usuarios_consultor
  ON public.painel_usuarios(consultor_slug) WHERE ativo;

-- ─── a posse do lead ────────────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consultor_slug text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vendedor_slug  text;

CREATE INDEX IF NOT EXISTS ix_leads_consultor_slug
  ON public.leads(consultor_slug, created_at DESC) WHERE consultor_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_leads_vendedor_slug
  ON public.leads(vendedor_slug, created_at DESC) WHERE vendedor_slug IS NOT NULL;

-- ─── backfill best-effort do historico ──────────────────────────────────────
-- O carimbo nao existia, mas a URL de entrada foi guardada. Vendedor historico
-- nao ha: o link nunca foi emitido, entao o painel do divulgador comeca zerado
-- e isso esta certo.
UPDATE public.leads
   SET consultor_slug = 'andersonagripino'
 WHERE consultor_slug IS NULL
   AND landing_page ILIKE '%/andersonagripino%';
