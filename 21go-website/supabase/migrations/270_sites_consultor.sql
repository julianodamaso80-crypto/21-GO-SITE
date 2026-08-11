-- =============================================================================
-- 270_sites_consultor.sql
-- Um site por consultor: 21go.com.br/<slug>. Mesmo codigo, mesmo container — o
-- que muda por consultor e o PowerLink (pra cotacao nascer no nome dele) e o
-- WhatsApp (pro cliente falar direto com ele).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sites_consultor (
  id           text PRIMARY KEY,
  company_id   text NOT NULL DEFAULT 'company-21go',

  -- O slug e IMUTAVEL depois de emitido. O consultor imprime cartao, sobe
  -- anuncio e manda o link no grupo — mudar isso depois quebra tudo que ele ja
  -- espalhou. Trocar de slug = cancelar e emitir outro, nunca UPDATE.
  slug         text NOT NULL UNIQUE,

  -- Os tres campos que o consultor digita no formulario. Guardados como ele
  -- digitou, porque sao o que foi conferido contra o Power na hora da venda.
  nome         text NOT NULL,
  email        text NOT NULL,
  whatsapp     text NOT NULL,              -- E.164 sem '+', ex: 5521999999999

  -- O que faz a cotacao nascer no nome dele: vai como `slsmnNwId` no
  -- /api/quotation/add. Sem isso o lead nasce no dono do token de integracao.
  powerlink_id text NOT NULL,
  -- O nome que o PROPRIO Power devolveu junto com o powerlink. Guardado pra
  -- auditoria: se um dia os leads de alguem cairem no lugar errado, esta coluna
  -- diz se o erro entrou na venda ou depois dela.
  power_nome   text,

  asaas_customer_id     text,
  asaas_subscription_id text,

  -- ativo | inadimplente | cancelado. So `ativo` serve o site; os outros dois
  -- caem na pagina "indisponivel" (o link continua valendo, ver middleware).
  status       text NOT NULL DEFAULT 'pendente',
  proximo_vencimento date,
  cancelado_em timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- O middleware bate nesta tabela a cada request de site de consultor: o lookup
-- por slug tem que ser indice, nao scan.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sites_consultor_slug ON public.sites_consultor(slug);

-- Um consultor, um site. Duas assinaturas pro mesmo e-mail seria cobranca
-- dobrada e dois links concorrendo pelo mesmo Power.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sites_consultor_email
  ON public.sites_consultor(lower(email));

CREATE INDEX IF NOT EXISTS ix_sites_consultor_status
  ON public.sites_consultor(status);

-- Fila da cobranca: quem vence hoje e quem ja passou dos 5 dias.
CREATE INDEX IF NOT EXISTS ix_sites_consultor_vencimento
  ON public.sites_consultor(proximo_vencimento)
  WHERE status IN ('ativo', 'inadimplente');
