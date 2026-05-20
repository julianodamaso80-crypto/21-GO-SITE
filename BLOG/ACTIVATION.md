# ACTIVATION — Runbook de ativação conservadora

> Ordem de ativação da operação SEO da 21Go. **Lineares, validáveis a cada etapa.** Não pular nenhuma. Nada vai pra produção sem revisão humana nos primeiros 30 dias.

## Fase 1 — Dry-run da migration

**Objetivo:** confirmar que `230_seo_schema.sql` está sintaticamente correto contra o super-banco real, sem aplicar nada.

```bash
cd "c:/Users/damas/Documents/PROJETOS/21 GO/21 GO - SITE"

# Lê SUPABASE_NEW_DB_PASSWORD do ambiente (já está no .env raiz)
set -a; source .env; set +a
node 21go-website/scripts/apply-seo-schema.js --dry-run
```

**O que esperar:**
- Pré-check confirma: `core` existe, `extensions` existe, `company-21go` seed, `set_updated_at()` existe, `vector/pg_trgm/unaccent` instalados, schema `seo` NÃO existe ainda
- BEGIN → executa DDL → lista tabelas criadas dentro da transação → ROLLBACK → "DRY-RUN OK"
- Se algum pré-check falhar, abortar.

**Critério de saída:** dry-run termina com "DRY-RUN OK em XXXms".

## Fase 2 — Apply migration

**Objetivo:** criar schema `seo` em produção.

```bash
node 21go-website/scripts/apply-seo-schema.js --apply
```

**Validação manual no Supabase Studio:**
```sql
-- Esperado: 10 tabelas + 1 view + 1 função
SELECT table_name FROM information_schema.tables WHERE table_schema='seo' ORDER BY 1;
SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND proname='seo_immutable_unaccent';
```

**Critério de saída:** 10 tabelas listadas + 1 função wrapper criada.

## Fase 3 — Deploy do worker no EasyPanel

**Objetivo:** subir o `seo-worker` no projeto `social-21go`.

Passos completos: [DEPLOY.md](DEPLOY.md). Resumo:
1. Criar serviço `seo-worker` (source GitHub branch `seo-ops`, build path `BLOG/seo-worker/`, Dockerfile)
2. Colar envs no painel (a maioria já está no `.env` raiz — copia direto)
3. Implantar
4. Adicionar no serviço `site`: `SEO_TRIGGER_SECRET` + `SEO_WORKER_URL=http://seo-worker:8080`
5. Re-deploy do `site`

**Validação:**
```bash
curl -s https://21go.site/api/seo/trigger
# Esperado: { "endpoint": "/api/seo/trigger", "configured": true, ... }
```

**Critério de saída:** worker rodando (status verde no EasyPanel) + `/api/seo/trigger` GET retorna `configured:true`.

## Fase 4 — Smoke test (sem custo)

**Objetivo:** validar conectividade do worker SEM gastar token LLM.

No console do EasyPanel ou via terminal local com envs setadas:
```bash
cd BLOG/seo-worker
npm run test:connect
```

**O que esperar:**
- `redis ping` retorna PONG
- `credentials snapshot` mostra todas as integrações com `true`
- `supabase HEAD core.companies` retorna 200

**Critério de saída:** todos os 3 checks passam.

## Fase 5 — Disparar 1 ciclo de pesquisa (DataForSEO + GSC + briefings)

**Objetivo:** gerar keywords reais, topics aprovados e briefings — sem ainda escrever artigos.

```bash
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer $SEO_TRIGGER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"kind":"weekly","limit":5}'
```

Aguardar 5-10 min (LLM + DataForSEO + GSC).

**Validação no Supabase Studio:**
```sql
SELECT count(*) AS total, status FROM seo.keywords WHERE company_id='company-21go' GROUP BY status;
SELECT decision, count(*) FROM seo.topics WHERE company_id='company-21go' GROUP BY decision;
SELECT count(*) FROM seo.briefings;
SELECT agent_id, status, error FROM seo.agent_runs ORDER BY started_at DESC LIMIT 20;
```

**Critério de saída:**
- Tem keywords inseridas (nenhuma de caminhão/ônibus)
- Tem decisões variadas em `topics` (não 100% APROVAR — strategist deve rejeitar algumas)
- Tem briefings criados
- `agent_runs` sem `status='error'` excessivo

## Fase 6 — Gerar 1 rascunho MDX

**Objetivo:** produzir UM artigo completo em rascunho.

```bash
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer $SEO_TRIGGER_SECRET" \
  -d '{"kind":"daily","limit":1}'
```

Aguardar 3-5 min.

**Validação:**
```sql
SELECT id, slug, status, review_status, mdx_path, word_count, read_time_min
FROM seo.articles
ORDER BY created_at DESC LIMIT 5;
```

**Critério de saída:**
- 1 row com `status='in_review'` e `review_status` ∈ `('APROVADO', 'APROVADO_COM_AJUSTES')`
- `mdx_path` aponta pra `21go-website/content/blog/_drafts/<slug>.mdx`
- `word_count` entre `WORDS_PER_ARTICLE_MIN` e `WORDS_PER_ARTICLE_MAX`

## Fase 7 — Validar o MDX manualmente

**Objetivo:** confirmar qualidade editorial.

O arquivo está **dentro do container do worker no EasyPanel**. Pra ler:
1. EasyPanel → serviço `seo-worker` → aba **Console**
2. `cat /repo/21go-website/content/blog/_drafts/{slug}.mdx`

Ou via Supabase, copiar o `mdx_path`, e ler do FS local depois de pull/clone.

**Checklist editorial:**
- [ ] Título claro e específico (não clickbait)
- [ ] Não menciona caminhão / carreta / ônibus
- [ ] Não usa "cobertura garantida" / "igual seguro"
- [ ] Tem CTA pro consultor / cotação
- [ ] FAQs no fim
- [ ] Tom honesto, sem inventar regras/coberturas
- [ ] Cita "proteção patrimonial veicular" corretamente

**Critério de saída:** vc aprova o conteúdo. Se reprovar, marca `seo.articles.status='archived'` no Supabase e ajusta prompt do Writer.

## Fase 8 — Publisher (abrir PR no GitHub)

**Objetivo:** dispara Publisher 09 → abre PR pra master.

```bash
# Pega article_id no Supabase
ARTICLE_ID="<uuid-do-rascunho-aprovado>"

curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer $SEO_TRIGGER_SECRET" \
  -d "{\"kind\":\"publish\",\"article_id\":\"$ARTICLE_ID\",\"skip_human_review\":true}"
```

**O que acontece:**
1. Publisher cria branch `seo/publish-<slug>-<timestamp>`
2. Commita MDX em `21go-website/content/blog/{slug}.mdx` (sem `_drafts`)
3. Abre PR pra master no GitHub
4. Article fica `status='awaiting_pr_merge'` + `pr_url`

**Validação:**
- Email/notificação do GitHub com o novo PR
- `seo.articles.pr_url` populado

**Próxima ação (humana):**
1. Você revisa o PR no GitHub UI
2. Se OK, **Squash and merge** na master
3. EasyPanel detecta push e rebuilda o site

## Fase 9 — Indexação automática (cron de 15 em 15 min)

**Objetivo:** após o merge, o cron detecta a URL live, marca `published` e dispara Agentes 10-12.

**Sem ação manual.** Aguardar até 20 min após o merge.

**Validação:**
```sql
SELECT status, published_at FROM seo.articles WHERE id='<article_id>';
-- Esperado: status='published', published_at preenchido

SELECT channel, action, response_status, occurred_at
FROM seo.indexing_log
WHERE article_id='<article_id>'
ORDER BY occurred_at DESC;
-- Esperado: 4 linhas (sitemap, google_gsc, bing_wmt, indexnow) com response_status 2xx
```

**Critério de saída:** artigo está live + indexação submetida em todos os canais. Status real de indexação no Google demora dias/semanas — não esperar imediato.

## Fase 10 — Monitorar

**Cron já automatizado:**
- Seg 06:00 → pesquisa semanal (DataForSEO + GSC + briefings)
- Ter 07:00 → análise GSC + recomendações
- Diário 09:00 → produz 1 rascunho
- Diário 03:00 → snapshot métricas
- A cada 15 min → recheck indexação pendente

**Logs:** EasyPanel → `seo-worker` → aba **Logs**. JSON estruturado — filtra por `"level":50` (erros) ou `"agent_id":"..."`.

**Métricas semanais no Supabase:**
```sql
SELECT * FROM seo.v_article_performance ORDER BY clicks_30d DESC NULLS LAST LIMIT 20;
SELECT type, count(*) FROM seo.recommendations WHERE status='open' GROUP BY type;
```

**Quando habilitar AUTO_PUBLISH?** Após **10-15 rascunhos validados manualmente** com qualidade consistente:
1. EasyPanel → `seo-worker` → **Ambiente** → `AUTO_PUBLISH_ENABLED=true`
2. Re-implantar

A partir daí, Publisher abre PR automaticamente (sem `skip_human_review`). Você ainda mergea cada PR manualmente — `AUTO_PUBLISH_ENABLED=true` apenas remove o veto em quem PODE abrir PR, não substitui o merge.

## Rollback de qualquer fase

| Cenário | Ação |
|---|---|
| Quer parar tudo | EasyPanel → `seo-worker` → **Parar** |
| Reverter migration | `DROP SCHEMA seo CASCADE; DROP FUNCTION public.seo_immutable_unaccent(text);` |
| Reverter publicação | Fecha o PR sem merge OU `git revert <commit>` se já mergeou |
| Reverter rascunho ruim | Marca `seo.articles.status='archived'` + remove `mdx_path` do FS |
| Limpar fila Redis | Console do `redis-social`: `redis-cli FLUSHDB` (cuidado — afeta outras filas se houver) |
