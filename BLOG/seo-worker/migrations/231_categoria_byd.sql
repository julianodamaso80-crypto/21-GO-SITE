-- 231 — adiciona a categoria 'byd' (2026-08-03)
--
-- Cluster proprio pra BYD porque o slot diario do write.worker filtra por
-- seo.topics.category. Sem isso, pauta de BYD cairia em 'carros' e disputaria o
-- mesmo slot do conteudo tradicional.
--
-- Aditivo e reversivel: so amplia o dominio dos CHECKs, nenhuma linha existente
-- deixa de ser valida.
--
-- Rollback:
--   UPDATE seo.keywords SET category='carros' WHERE category='byd';
--   UPDATE seo.topics   SET category='carros' WHERE category='byd';
--   UPDATE seo.articles SET category='carros' WHERE category='byd';
--   e recriar os CHECKs sem 'byd'.

BEGIN;

ALTER TABLE seo.keywords DROP CONSTRAINT IF EXISTS keywords_category_check;
ALTER TABLE seo.keywords ADD CONSTRAINT keywords_category_check
  CHECK (category = ANY (ARRAY['carros'::text, 'motos'::text, 'frotas'::text, 'educativo'::text, 'byd'::text]));

ALTER TABLE seo.topics DROP CONSTRAINT IF EXISTS topics_category_check;
ALTER TABLE seo.topics ADD CONSTRAINT topics_category_check
  CHECK (category = ANY (ARRAY['carros'::text, 'motos'::text, 'frotas'::text, 'educativo'::text, 'byd'::text]));

ALTER TABLE seo.articles DROP CONSTRAINT IF EXISTS articles_category_check;
ALTER TABLE seo.articles ADD CONSTRAINT articles_category_check
  CHECK (category = ANY (ARRAY['carros'::text, 'motos'::text, 'frotas'::text, 'educativo'::text, 'byd'::text]));

-- clusters e seed_keywords tem o mesmo dominio; sem elas o topical cluster de BYD
-- nao poderia ser registrado depois.
ALTER TABLE seo.clusters DROP CONSTRAINT IF EXISTS clusters_category_check;
ALTER TABLE seo.clusters ADD CONSTRAINT clusters_category_check
  CHECK (category = ANY (ARRAY['carros'::text, 'motos'::text, 'frotas'::text, 'educativo'::text, 'byd'::text]));

ALTER TABLE seo.seed_keywords DROP CONSTRAINT IF EXISTS seed_keywords_category_check;
ALTER TABLE seo.seed_keywords ADD CONSTRAINT seed_keywords_category_check
  CHECK (category = ANY (ARRAY['carros'::text, 'motos'::text, 'frotas'::text, 'educativo'::text, 'byd'::text]));

COMMIT;
