-- Os planos que o cliente VIU na simulacao, como o PowerCRM os devolveu.
--
-- Sem esta coluna o PDF nao tinha como reproduzir a tela: `/api/pdfs/<leadId>` regenera o
-- documento a partir do lead, e o lead so guardava o plano ESCOLHIDO (`cotacao_plano`,
-- `cotacao_valor`). Os outros tres planos do comparativo eram recalculados pela tabela local,
-- adivinhando a categoria pelo nome do modelo — e esse e o PDF que o cliente do consultor abre.
--
-- Formato: [{ "id": "vip", "name": "VIP", "monthly": 418.88, "popular": true }, ...]
-- O preco e o do Power, com o desconto de leilao ja aplicado, sem os extras de carro de
-- aplicativo e danos a terceiros (esses o PDF soma na hora, igual a tela).
alter table public.leads
  add column if not exists cotacao_planos jsonb;

comment on column public.leads.cotacao_planos is
  'Planos exibidos na simulacao, como vieram do PowerCRM (id/name/monthly). Fonte do comparativo do PDF.';
