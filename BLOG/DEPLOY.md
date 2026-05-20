# DEPLOY — Operação SEO da 21Go no EasyPanel

> Guia operacional pra subir o `seo-worker` no EasyPanel + configurar as integrações no site público.

## Pré-requisitos

| Item | Onde pega |
|---|---|
| Acesso ao EasyPanel | http://167.71.31.77:3000/projects/social-21go |
| GitHub PAT fine-grained | github.com/settings/personal-access-tokens — escopo `Contents: write` + `Pull requests: write` em `julianodamaso80-crypto/21-GO-SITE` |
| OAuth Google (GSC + GA4) | Gerar refresh token com `cd BLOG/seo-worker && npm run google:auth` |
| GSC propriedade verificada | `https://21go.site/` no GSC com conta que tem permissão "Owner" ou "Full user" |
| GA4 propriedade ID | analytics.google.com → Admin → Property Details (campo "Property ID" — numérico, diferente do Measurement ID `G-XXX`) |
| Conta DataForSEO | dataforseo.com (USD 1-5 inicial pra teste) |
| Bing Webmaster API key | bing.com/webmasters → Settings → API Access |
| OpenRouter API key | openrouter.ai/keys |
| UUID v4 pra IndexNow | `node -e "console.log(crypto.randomUUID())"` |

## Passo a passo

### 1. Aplicar migration `230_seo_schema.sql` no Supabase

**Antes de qualquer deploy do worker.** A migration cria o schema `seo` no super-banco.

```bash
# dry-run (rollback automatico — apenas valida)
SUPABASE_NEW_DB_PASSWORD="<senha-do-banco>" \
  node 21go-website/scripts/apply-seo-schema.js --dry-run

# se OK, aplicar de verdade
SUPABASE_NEW_DB_PASSWORD="<senha-do-banco>" \
  node 21go-website/scripts/apply-seo-schema.js --apply
```

Output esperado no pós-check: 10 tabelas + 1 view + 1 função.

### 2. Gerar chave IndexNow

```bash
node -e "console.log(crypto.randomUUID())"
# saída exemplo: 7e3b2b9f-9c5e-4d8a-9d3c-c5a3f8a8b1d2
```

Cria o arquivo `21go-website/public/{UUID}.txt` com a UUID como **conteúdo** (não apenas no nome):

```bash
KEY="7e3b2b9f-9c5e-4d8a-9d3c-c5a3f8a8b1d2"
echo -n "$KEY" > "21go-website/public/$KEY.txt"
git add "21go-website/public/$KEY.txt"
git commit -m "feat(seo): adiciona chave IndexNow"
git push site seo-ops
```

### 3. Criar serviço `seo-worker` no EasyPanel

Painel: http://167.71.31.77:3000/projects/social-21go

| Campo | Valor |
|---|---|
| **Tipo** | App |
| **Nome** | `seo-worker` |
| **Source type** | GitHub |
| **Repo** | `julianodamaso80-crypto/21-GO-SITE` |
| **Branch** | `seo-ops` (após merge na master, mudar pra `master`) |
| **Build path** | `BLOG/seo-worker/` |
| **Build method** | Dockerfile (`BLOG/seo-worker/Dockerfile`) |
| **Porta interna** | 8080 |
| **Domínio público** | **NÃO configurar** — o worker é interno |
| **Healthcheck** | `GET /healthz` |

### 4. Configurar variáveis de ambiente (aba **Ambiente** do serviço)

```ini
# Runtime
NODE_ENV=production
PORT=8080
LOG_LEVEL=info
COMPANY_ID=company-21go
TZ=America/Sao_Paulo

# Supabase (super-banco)
SUPABASE_URL=https://dsclaxtvcbbuxmtmpxpf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT>

# Redis interno (mesma rede do projeto)
REDIS_URL=redis://redis-social:6379

# LLM via OpenRouter (mesmo provider do agente Leticya)
OPENROUTER_API_KEY=<sk-or-v1-...>
AI_MODEL_GENERATOR=anthropic/claude-sonnet-4.6   # tier MAIN
AI_MODEL_CLASSIFIER=anthropic/claude-haiku-4.5    # tier LIGHT

# DataForSEO (opcional — sem isso Agente 01 cai pra GSC+manual)
DATAFORSEO_LOGIN=<login>
DATAFORSEO_PASSWORD=<senha>
DATAFORSEO_DAILY_BUDGET_USD=2

# Google OAuth (GSC + GA4) — modo oficial
# Pra gerar GOOGLE_REFRESH_TOKEN: cd BLOG/seo-worker && npm run google:auth
GOOGLE_CLIENT_ID=<client_id>
GOOGLE_CLIENT_SECRET=<client_secret>
GOOGLE_REFRESH_TOKEN=<refresh_token>

GSC_SITE_URL=https://21go.site/
GA4_PROPERTY_ID=<numero — ex 123456789, diferente do GA4_MEASUREMENT_ID>

# Bing + IndexNow
BING_API_KEY=<key>
BING_SITE_URL=https://21go.site/
INDEXNOW_KEY=<UUID gerado no passo 2>
INDEXNOW_KEY_LOCATION=https://21go.site/<UUID>.txt

# GitHub
GITHUB_TOKEN=<PAT fine-grained>
GITHUB_REPO=julianodamaso80-crypto/21-GO-SITE
GITHUB_BRANCH_BASE=master
GITHUB_AUTHOR_NAME=21Go SEO Bot
GITHUB_AUTHOR_EMAIL=seo-bot@21go.site

# Seguranca + comportamento
TRIGGER_SECRET=<gerar com `openssl rand -hex 32`>
AUTO_PUBLISH_ENABLED=false
DAILY_ARTICLE_LIMIT=1
WEEKLY_KEYWORD_LIMIT=20
WORDS_PER_ARTICLE_MIN=900
WORDS_PER_ARTICLE_MAX=2200
```

Clica **Salvar** → **Implantar** (rebuild).

### 5. Configurar envs no serviço `site` (o site público que já roda)

Aba **Ambiente** do serviço `site` no EasyPanel — adicionar 2 envs:

```ini
SEO_WORKER_URL=http://seo-worker:8080
SEO_TRIGGER_SECRET=<mesmo valor do TRIGGER_SECRET do worker>
```

**Implantar** o serviço `site` pra essas envs entrarem em runtime.

### 6. Validar deploy

```bash
# (do seu laptop) — pegar URL pública/IP do worker (se ele tiver)
# se NÃO tem domínio público, usar dentro do EasyPanel: aba Logs do worker

# Healthcheck (via site público)
curl -s https://21go.site/api/seo/trigger
# → { "endpoint": "/api/seo/trigger", "method": "POST", "valid_kinds": [...], "configured": true }

# Disparar dry-run de pesquisa semanal
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer <SEO_TRIGGER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"weekly","dry_run":true}'
# → { "ok": true, "worker_status": 202, "worker_response": { "enqueued": "seo:research", "jobId": "..." } }
```

Olhar a aba **Logs** do `seo-worker` no EasyPanel — deve ter linhas estruturadas em JSON.

### 7. Primeiro ciclo real (sem dry-run)

```bash
# 1. Disparar pesquisa real
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer <SEO_TRIGGER_SECRET>" \
  -d '{"kind":"weekly","limit":10}'

# 2. Aguardar 5-10 min (LLM + DataForSEO + GSC). Logs no EasyPanel mostram progresso.

# 3. Conferir o que entrou no banco (Supabase Studio):
#    SELECT count(*) FROM seo.keywords;
#    SELECT count(*) FROM seo.topics GROUP BY decision;
#    SELECT count(*) FROM seo.briefings;

# 4. Disparar produção diária
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer <SEO_TRIGGER_SECRET>" \
  -d '{"kind":"daily","limit":1}'

# 5. Aguardar 3-5 min. Conferir:
#    SELECT id, title, slug, status, review_status FROM seo.articles ORDER BY created_at DESC LIMIT 5;

# 6. Revisar o MDX gerado em GitHub (a esteira ainda NÃO commita — fica em _drafts local do container).
#    Pra puxar pra sua máquina: a rota /api/seo/trigger não retorna conteúdo; abra o Supabase
#    e veja seo.articles.mdx_path — o arquivo está dentro do container do worker.
#    Pra extrair, use o terminal do EasyPanel (Console do container) e:
#       cat /repo/21go-website/content/blog/_drafts/{slug}.mdx
```

### 8. Publicar manualmente (após revisar) — abre PR, NÃO mergea

```bash
# Pega article_id no Supabase Studio
curl -X POST https://21go.site/api/seo/trigger \
  -H "Authorization: Bearer <SEO_TRIGGER_SECRET>" \
  -d '{"kind":"publish","article_id":"<uuid>","skip_human_review":true}'
```

O Publisher (Agente 09) vai:
1. Criar branch `seo/publish-{slug}-{timestamp}` no repo via Octokit
2. Commitar MDX nessa branch (NÃO na master)
3. Abrir Pull Request da branch → master com body explicativo
4. Atualizar `seo.articles.status='awaiting_pr_merge'` + `pr_url` + `pr_branch`

**Você** revisa o PR no GitHub UI e mergea quando aprovar. Sem merge automático.

Após o merge:
1. EasyPanel detecta push na master e rebuilda o serviço `site`
2. Cron de 15 em 15 minutos no worker detecta que a URL retorna 200
3. Article vira `status='published'` automaticamente
4. Agentes 10-12 disparam (sitemap + GSC + Bing + IndexNow), tudo logado em `seo.indexing_log`

## Operação contínua

### Cron jobs automáticos (já agendados no worker)

| Cron | Quando | O que |
|---|---|---|
| Seg 06:00 | toda segunda | pesquisa semanal (DataForSEO + GSC + briefings) |
| Ter 07:00 | toda terça | análise GSC + recomendações |
| Diário 09:00 | todo dia | gera 1 rascunho |
| Diário 03:00 | todo dia | snapshot métricas |
| A cada 15min | sempre | recheck indexação pendente |

**Não precisa fazer nada manualmente** após configurar — o scheduler do worker dispara sozinho.

### Restart do worker

EasyPanel → projeto `social-21go` → serviço `seo-worker` → botão **Reiniciar**.

### Logs

EasyPanel → serviço `seo-worker` → aba **Logs**. JSON estruturado, busca por:
- `"level":50` → erros
- `"agent_id":"05-writer"` → execuções do Writer
- `"cost":` → custo Anthropic por chamada

### Custos esperados

| Item | Aprox/mês |
|---|---|
| OpenRouter (1 artigo/dia + análises) | USD 30-60 (com markup OpenRouter sobre Anthropic) |
| DataForSEO (budget USD 2/dia) | USD 30-60 |
| EasyPanel (worker container) | já incluído no plano atual |
| Supabase | já incluído |
| Bing / GSC / IndexNow / GA4 | gratuitos |

`seo.agent_runs` registra `llm_input_tokens` + `llm_output_tokens` por chamada.
`llm_cost_usd` fica **NULL** — OpenRouter cobra com markup variável, não calculo localmente pra não inventar valor. Pra obter custo real, consultar `https://openrouter.ai/api/v1/generation/{id}` em job batch (não implementado nesta fase).

`seo.dataforseo_calls.cost_usd` registra custo real reportado pela API. Budget guard hard-stop em `DATAFORSEO_DAILY_BUDGET_USD`.

## Rollback

| Cenário | Como reverter |
|---|---|
| Worker está fazendo besteira | EasyPanel → `seo-worker` → **Parar** |
| Publicou artigo errado | `git revert <commit>` no repo + reflete em rebuild |
| Quer apagar todo schema seo | `DROP SCHEMA seo CASCADE; DROP FUNCTION public.seo_immutable_unaccent(text);` |
| Quer voltar versão de artigo | `SELECT mdx_content FROM seo.article_versions WHERE article_id='...' ORDER BY version DESC LIMIT 5;` |

## Quando habilitar AUTO_PUBLISH

**Apenas após** validar manualmente uns 10-15 artigos em rascunho e confirmar qualidade. Aí muda no EasyPanel:

```
AUTO_PUBLISH_ENABLED=true
```

A partir daí, Agente 09 publica sem confirmação humana **apenas pra artigos APROVADOS** pelo Reviewer (06). Artigos `APROVADO_COM_AJUSTES` ainda exigem `skip_human_review:true`. Artigos `REPROVADO` nunca publicam.

## Quando precisa de help

1. Logs do worker em JSON → buscar `"level":50` ou `"err":`
2. `seo.agent_runs` no Supabase → cada execução com `status='error'` tem `error` text
3. `seo.indexing_log` → status real das submissões pra Google/Bing/IndexNow
4. `/api/seo/trigger` (GET) → mostra se as envs estão configuradas
5. `GET /healthz` no worker → liveness
6. `GET /readyz` no worker → checa Redis
7. `GET /diag` no worker → snapshot de credenciais (sem expor valores)
