# BLOG — Operação SEO Automatizada da 21Go

> Tudo o que toca a operação SEO/blog da 21Go vive aqui. Pasta criada em 2026-05-19 pra centralizar a esteira de 15 agentes especializados.

## O que é

Esta pasta agrupa **o orquestrador, a documentação e o controle** da operação automatizada de SEO da 21Go: pesquisa de palavras-chave, briefing, redação, revisão comercial/jurídica, SEO on-page, publicação como rascunho, sitemap, envio para Google/Bing/IndexNow e análise contínua via GSC + GA4.

Funciona como esteira:
1. **Pesquisa** (DataForSEO + GSC) → palavras-chave reais com volume/dificuldade
2. **Estratégia** → decide se vira artigo novo, atualização ou é rejeitado
3. **Anti-canibalização** → bloqueia conteúdo repetitivo (embedding + trigram)
4. **Briefing** → estrutura H1/H2, FAQs, links internos, CTA
5. **Redação** → MDX em `21go-website/content/blog/_drafts/`
6. **Revisão** → bloqueia frases proibidas ("cobertura garantida", "igual seguro" etc)
7. **SEO on-page** → meta title, slug, alt text, schema
8. **Publicação** → após aprovação humana, commita no GitHub e dispara rebuild EasyPanel
9. **Indexação** → sitemap + Google Search Console + Bing + IndexNow
10. **Análise contínua** → snapshot diário GSC + GA4, recomendações semanais

## Escopo

**A 21Go atende:** carros, motos, frotas de carros e/ou motos.
**A 21Go NÃO atende:** caminhão, carreta, ônibus, bitrem, cavalo mecânico, transporte rodoviário de carga, frete pesado.

`BLOG/seo-worker/src/lib/scope-guard.ts` mantém a blocklist permanente. Toda pauta passa pelo guard antes de virar artigo.

## Layout dos arquivos

```
BLOG/
├── README.md                                  # este arquivo (índice mestre)
└── seo-worker/                                # serviço Node 20 que orquestra tudo
    ├── Dockerfile                             # multi-stage, ~150MB, deploy EasyPanel
    ├── package.json
    ├── tsconfig.json
    ├── .env.example                           # docs das envs (sem valor real)
    ├── .gitignore
    ├── README.md                              # documentação técnica do worker
    └── src/
        ├── server.ts                          # entry — Fastify + scheduler + workers
        ├── config.ts                          # leitura/validação Zod
        ├── queue.ts                           # 5 filas BullMQ
        ├── scheduler.ts                       # node-cron (timezone São Paulo)
        ├── lib/
        │   ├── logger.ts                      # Pino estruturado (redact tokens)
        │   ├── redis.ts                       # ioredis client
        │   ├── mdx.ts                         # buildMdx/parseMdx/slugify
        │   ├── scope-guard.ts                 # blocklist + city-swap detector
        │   └── similarity.ts                  # embedding 384-dim + cosine
        ├── routes/
        │   ├── health.ts                      # /healthz /readyz /diag
        │   └── runs.ts                        # /runs/* (Bearer TRIGGER_SECRET)
        ├── workers/                           # consumidores das filas
        │   ├── index.ts
        │   ├── research.worker.ts
        │   ├── write.worker.ts
        │   ├── publish.worker.ts
        │   ├── analyze.worker.ts
        │   └── reporting.worker.ts
        ├── integrations/                      # adaptadores externos
        │   ├── anthropic.ts                   # LLM Claude
        │   ├── github.ts                      # Octokit
        │   ├── dataforseo.ts                  # keyword research + budget guard
        │   ├── google-auth.ts                 # OAuth/SA pra Google APIs
        │   ├── gsc.ts                         # Search Console
        │   ├── ga4.ts                         # Analytics Data API
        │   ├── bing.ts                        # Webmaster Tools
        │   ├── indexnow.ts                    # IndexNow protocol
        │   └── sitemap.ts                     # checker URL + robots
        ├── db/
        │   ├── supabase.ts                    # cliente service_role
        │   └── repositories/                  # 1 arquivo por tabela
        ├── agents/                            # OS 15 AGENTES (Fases 4-9)
        │   ├── 01-keyword-research.ts
        │   ├── 02-seo-strategist.ts
        │   ├── 03-anti-repetition.ts
        │   ├── ...                            # 04 a 15
        │   └── 15-reporting.ts
        └── scripts/
            └── test-connect.ts                # smoke-test offline
```

## Arquivos relacionados FORA de BLOG/

Por convenção do projeto, esses dois ficam no `21go-website/` (com as outras migrations/scripts do super-banco):

| Arquivo | O que é |
|---|---|
| [21go-website/supabase/migrations/230_seo_schema.sql](../21go-website/supabase/migrations/230_seo_schema.sql) | Schema `seo` no super-banco — 10 tabelas + 1 view + 1 função wrapper IMMUTABLE de `unaccent` |
| [21go-website/scripts/apply-seo-schema.js](../21go-website/scripts/apply-seo-schema.js) | Aplica a migration acima — suporta `--dry-run` (rollback automático) e `--apply` (executa de verdade). Exige `SUPABASE_NEW_DB_PASSWORD` no ambiente |

Quando você publica artigos, eles vão também pra `21go-website/content/blog/`:

| Pasta | Propósito |
|---|---|
| [21go-website/content/blog/](../21go-website/content/blog/) | 60 posts MDX existentes + novos artigos publicados (depois de aprovação humana) |
| `21go-website/content/blog/_drafts/` | Rascunhos gerados pela esteira (NÃO entram no build) — será criado na Fase 7 |

## Como o blog do site funciona hoje

- Stack: Next.js 15 + Tailwind 4 + MDX
- 60 posts em `content/blog/*.mdx` (frontmatter YAML: title, description, date, author, category, keywords, image)
- Rotas: `/blog` (hub) + `/blog/[slug]` (SSG via `generateStaticParams`)
- Parser: [21go-website/src/lib/blog.ts](../21go-website/src/lib/blog.ts) com `gray-matter`
- Sitemap: gerado por `next-sitemap` no `postbuild` → `public/sitemap-0.xml`
- Tracking: GTM já configurado (`NEXT_PUBLIC_GTM_ID`) + Meta Pixel (hardcoded em `MetaPixelScripts.tsx`)
- Schema.org: Organization + LocalBusiness + FAQPage existem; **falta Article schema dinâmico** (vai entrar na Fase 7)

## Os 15 agentes

| # | Agente | Trigger | Saída |
|---|---|---|---|
| 01 | KeywordResearch | cron seg 06:00 | `seo.keywords` |
| 02 | SEOStrategist | após 01 | `seo.topics.decision` |
| 03 | AntiRepetition | dentro de 02 | `seo.topics.anti_repetition_score` |
| 04 | Briefing | tópico aprovado | `seo.briefings` |
| 05 | Writer | briefing pronto | `.mdx` em `_drafts/` + `seo.articles` |
| 06 | LegalReviewer | após 05 | `seo.articles.review_status` |
| 07 | OnPageSEO | após 06 | atualiza MDX no `_drafts/` |
| 08 | DesignRepurpose | após 07 | `seo.articles.data` (sugestões de imagem + reaproveitamento) |
| 09 | Publisher | aprovação humana | move MDX, commita, dispara rebuild |
| 10 | Sitemap | pós-publish | log `seo.indexing_log` |
| 11 | GoogleIndexing | pós-publish | GSC sitemap + URL inspection |
| 12 | BingIndexNow | pós-publish | Bing + IndexNow |
| 13 | GSCAnalyst | cron ter 07:00 | `seo.recommendations` |
| 14 | ContentUpdater | após 13 | reabre artigo com versão nova |
| 15 | Reporting | diário 03:00 | `seo.metrics_daily` |

## Como acompanhar o progresso da implementação

| Fase | Status | Commit |
|---|---|---|
| 0 — Validação técnica | ✅ | — |
| 0b — Remove vercel.json/railway.json | ✅ | `f997a46` |
| 0c — Branch `seo-ops` | ✅ | — |
| 1 — Migration 230 + script dry-run | ✅ | `3959bbf` |
| 2 — Esqueleto worker | ✅ | `7953b63` |
| 3 — Integrações base | ✅ | `19dbb2c` |
| 3.5 — Reorganização BLOG/ | ✅ | `3560c2b` |
| 4-5 — Agentes 01-08 (pesquisa + produção) | ✅ | `f5d1598` |
| 6 — Teste E2E (stub mode) | ✅ | `23c5970` |
| 7 — Ganchos no site | ✅ | `7d5001a` |
| 8 — Agentes 09-12 (publicação) | ✅ | `07b1f86` |
| 9 — Agentes 13-15 (análise) | ✅ | `7f071b4` |
| 10 — Doc EasyPanel | ✅ | ver [DEPLOY.md](DEPLOY.md) |

**Implementação 100% completa em código.** Próximos passos são de configuração: aplicar migration + setar envs no EasyPanel. Ver [DEPLOY.md](DEPLOY.md) pra guia técnico e **[ACTIVATION.md](ACTIVATION.md) pro runbook conservador de ativação** (1 briefing → 1 rascunho → validar humano → publisher → indexação).

## Correções aplicadas após review (2026-05-20)

Após primeira passada, ajustes obrigatórios:

| Mudança | Estado |
|---|---|
| LLM via OpenRouter (não Anthropic SDK direto) — mesmo padrão do agente Leticya | ✅ |
| Modelos lidos de `AI_MODEL_GENERATOR` + `AI_MODEL_CLASSIFIER` (convenção já existente no `.env`) com fallbacks documentados | ✅ |
| Google: OAuth-only (Service Account removido). Script `npm run google:auth` pra gerar refresh token | ✅ |
| Publisher: branch + Pull Request, **sem auto-merge na master**. Status `awaiting_pr_merge` adicionado | ✅ |
| Cron de 15min agora detecta merge humano + dispara indexação automaticamente | ✅ |
| Article JSON-LD via `<script type="application/ld+json">` (não em `generateMetadata`) | ✅ |
| Migration dry-run obrigatório com pré-checks (extensions, schema, FK, seed) | ✅ |
| IndexNow: chave UUID gerada + servida em `21go-website/public/{KEY}.txt` | ✅ |
| Custo LLM `null` (OpenRouter cobra com markup — não inventar valor local) | ✅ |

## Regras absolutas

1. **`AUTO_PUBLISH_ENABLED=false`** nos primeiros 30 dias — só rascunho
2. **Não inventar dados** — se API não respondeu, retorna `null`/`error`, não um número fake
3. **Não publicar** nada que mencione caminhão/carreta/ônibus/carga
4. **Não criar artigo "{tema} em {cidade}"** sem dor específica
5. **Custo da Anthropic** registrado em `seo.agent_runs.llm_cost_usd`
6. **Custo da DataForSEO** registrado em `seo.dataforseo_calls.cost_usd` com budget guard hard-stop

## Próximos passos pendentes do usuário

1. Aprovar aplicação da migration 230 no Supabase (rodar dry-run primeiro: `SUPABASE_NEW_DB_PASSWORD=xxx node 21go-website/scripts/apply-seo-schema.js --dry-run`)
2. Criar PAT fine-grained no GitHub (`Contents: write` + `Pull requests: write`)
3. Liberar Service Account Google ou OAuth refresh token (GSC + GA4)
4. Criar conta DataForSEO + carregar USD 1-5 inicial
5. Pegar Bing Webmaster Tools API key
6. Confirmar limite mensal aceitável de gasto Anthropic
