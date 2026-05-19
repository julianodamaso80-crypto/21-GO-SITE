# seo-worker — 21Go

Orquestrador da operação SEO/blog automatizada da 21Go.

Serviço dedicado (Node 20 + TypeScript + Fastify + BullMQ + node-cron + Pino) que coordena 15 agentes especialistas. Roda no EasyPanel (projeto `social-21go`), isolado do site público.

## O que faz

| Quando | O que |
|---|---|
| Seg 06:00 | Pesquisa de palavra-chave (DataForSEO + GSC) → estratégia → briefings |
| Ter 07:00 | Análise GSC → recomendações + identifica artigos para atualizar |
| Diário 09:00 | Produz `DAILY_ARTICLE_LIMIT` rascunhos em `content/blog/_drafts/` (não publica) |
| Diário 03:00 | Snapshot diário de GSC + GA4 → `seo.metrics_daily` |
| A cada 15 min | Varre artigos publicados nas últimas 24h sem indexação completa e reenviapra Bing/IndexNow |
| Sob demanda | `POST /runs/publish` move rascunho → `content/blog/`, commita no GitHub, dispara rebuild |

**`AUTO_PUBLISH_ENABLED=false` por padrão** — nos primeiros 30 dias, nenhum artigo é publicado sem revisão humana.

## Stack

- Node 20 + TypeScript ESM (`tsx` em dev, `tsc` em build, `node` em prod)
- Fastify 5 — HTTP (healthz, runs, webhooks)
- BullMQ 5 — filas (5 filas, 1 worker por fila, concurrency=1)
- node-cron — scheduler
- ioredis — Redis client
- Pino — logger estruturado (JSON em prod, pretty em dev)
- Anthropic SDK — LLM dos agentes
- Octokit — commits MDX no GitHub
- Supabase JS — DB (schema `seo`)

## Como rodar local

```bash
cd BLOG/seo-worker
cp .env.example .env
# edite .env com suas chaves
npm install
npm run dev          # tsx watch (hot reload)
```

Testes individuais sem subir o servidor:

```bash
npm run test:connect       # ping redis + HEAD supabase + snapshot de credenciais
npm run test:dry-keywords  # roda Agente 01 em dry-run (depois da Fase 4)
npm run test:dry-draft     # gera 1 rascunho MDX em tmp/ (depois da Fase 5)
```

## Como testar (HTTP)

```bash
# Liveness
curl -s http://localhost:8080/healthz

# Readiness (verifica Redis)
curl -s http://localhost:8080/readyz

# Diagnóstico de credenciais (sem expor valores)
curl -s http://localhost:8080/diag

# Disparar rotina semanal manualmente
curl -X POST http://localhost:8080/runs/weekly \
  -H "Authorization: Bearer $TRIGGER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true}'

# Disparar produção diária
curl -X POST http://localhost:8080/runs/daily \
  -H "Authorization: Bearer $TRIGGER_SECRET" \
  -d '{"limit":1}'

# Publicar artigo específico (precisa AUTO_PUBLISH_ENABLED=true OU skip_human_review)
curl -X POST http://localhost:8080/runs/publish \
  -H "Authorization: Bearer $TRIGGER_SECRET" \
  -d '{"article_id":"<uuid>","skip_human_review":true}'
```

## Variáveis de ambiente

Ver `.env.example`. Resumo do que é obrigatório/opcional:

| Variável | Obrigatória? | Sem ela... |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | nada funciona |
| `REDIS_URL` | ✅ | filas e cron não rodam |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_MAIN` | ✅ | agentes LLM falham |
| `TRIGGER_SECRET` | ✅ | rotas `/runs/*` retornam 401 |
| `GITHUB_TOKEN`, `GITHUB_REPO` | só pra publicar | Publisher fica em pending |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | opcional | Agente 01 cai pra GSC/manual |
| `GOOGLE_*`, `GA4_*` | opcional | Sem GSC/GA4 analyst e reporting |
| `BING_API_KEY`, `INDEXNOW_KEY` | opcional | Sem submissão Bing/IndexNow |

**Nunca commitar `.env`.** Em produção, configurar no painel do EasyPanel.

## Configuração no EasyPanel

Projeto: `social-21go`. Criar serviço novo:

| Campo | Valor |
|---|---|
| Tipo | App |
| Nome | `seo-worker` |
| Source | GitHub (`julianodamaso80-crypto/21-GO-SITE`, branch `seo-ops` → depois `master`) |
| Build path | `BLOG/seo-worker/` |
| Build | Dockerfile (`BLOG/seo-worker/Dockerfile`) |
| Porta | 8080 |
| Domínio | sem domínio público (acessível só na rede interna do projeto) |
| Healthcheck | `GET /healthz` |
| Env vars | conforme `.env.example` (Aba **Ambiente** → preencher) |

Após criar, **Implantar**. Logs aparecem na aba **Logs**.

Para restart: aba do serviço → **Reiniciar**.

## Estrutura

```
BLOG/seo-worker/
├── Dockerfile                # multi-stage, ~150MB
├── package.json
├── tsconfig.json
├── .env.example
├── README.md (este arquivo)
└── src/
    ├── server.ts             # entry point — Fastify + scheduler + workers
    ├── config.ts             # leitura/validação Zod das envs
    ├── queue.ts              # 5 filas BullMQ
    ├── scheduler.ts          # node-cron jobs
    ├── lib/
    │   ├── logger.ts         # Pino com redact
    │   └── redis.ts          # ioredis client
    ├── routes/
    │   ├── health.ts         # /healthz, /readyz, /diag
    │   └── runs.ts           # /runs/* (precisa Bearer TRIGGER_SECRET)
    ├── workers/
    │   ├── index.ts          # inicializa todos os workers
    │   ├── research.worker.ts    # Fase 4 (stub)
    │   ├── write.worker.ts       # Fase 5 (stub)
    │   ├── publish.worker.ts     # Fase 8 (stub)
    │   ├── analyze.worker.ts     # Fase 9 (stub)
    │   └── reporting.worker.ts   # Fase 9 (stub)
    ├── agents/               # Fases 4-9
    ├── integrations/         # Fase 3 (DataForSEO, Anthropic, GSC, GA4, Bing, IndexNow, GitHub)
    ├── db/                   # repositories Supabase
    └── scripts/
        └── test-connect.ts   # smoke-test offline
```

## Segurança

- `.env` jamais commitado (gitignored)
- Tokens redactados nos logs (`redact: ['*.token','*.password','*.key','*.secret']`)
- Rotas `/runs/*` exigem `Bearer TRIGGER_SECRET`
- Container roda como user `app` não-root
- Tini como PID 1 (propaga SIGTERM, evita zumbis)

## Custo

- Anthropic: ~USD 1-3/dia em média (1 artigo/dia + análises semanais), depende dos modelos em `ANTHROPIC_MODEL_MAIN`/`ANTHROPIC_MODEL_LIGHT`
- DataForSEO: budget guard hard-stop em `DATAFORSEO_DAILY_BUDGET_USD` (default USD 2)
- GSC/GA4/Bing/IndexNow: gratuitos (dentro dos limites de quota)

Todo custo é logado em `seo.agent_runs.llm_cost_usd` e `seo.dataforseo_calls.cost_usd`.

## Status atual da implementação

| Fase | Componente | Status |
|---|---|---|
| 1 | Migration 230 | ✅ criada |
| 2 | Esqueleto worker | ✅ criado (este README) |
| 3 | Integrações | 🚧 pendente |
| 4 | Agentes 01-04 | 🚧 pendente |
| 5 | Agentes 05-08 | 🚧 pendente |
| 6 | Teste E2E rascunho | 🚧 pendente |
| 7 | Ganchos no site | 🚧 pendente |
| 8 | Agentes 09-12 | 🚧 pendente |
| 9 | Agentes 13-15 | 🚧 pendente |
| 10 | Doc EasyPanel | 🚧 pendente |
