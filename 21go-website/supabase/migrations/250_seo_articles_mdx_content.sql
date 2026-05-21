-- Migration 250: armazena o MDX inline em seo.articles
-- Motivo: worker e site rodam em containers separados (Easypanel). Filesystem nao
-- e compartilhado. Persistir o conteudo no DB elimina dependencia de tmpdir e
-- torna a esteira resiliente a restart do worker entre Writer e Publisher.
ALTER TABLE seo.articles
  ADD COLUMN IF NOT EXISTS mdx_content text;

COMMENT ON COLUMN seo.articles.mdx_content IS
  'Conteudo MDX completo (frontmatter + body). Fonte da verdade pro Publisher commitar no GitHub.';
