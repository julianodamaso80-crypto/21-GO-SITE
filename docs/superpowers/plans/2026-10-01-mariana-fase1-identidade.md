# Mariana Fase 1: identidade e schema no código (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar do código tudo que hoje está fixo como "Isa / Leticya / 4824 / schema public / cloud_isa" e passar a ler de uma identidade do bot (env do servidor, padrão = Isa de hoje), para que a mesma imagem rode a Mariana (Gabriel Juliano) na Fase 2 sem mudar nada da Isa.

**Architecture:** um módulo puro `src/lib/isa/identidade.regras.ts` define o tipo `IdentidadeBot`, monta a identidade a partir de um objeto de env (`identidadeDoAmbiente`) e recusa identidade que embola com a casa; o servidor lê `process.env` uma vez em `src/lib/isa/identidade.ts` (`IDENTIDADE`, `TAB`, `ETIQUETAS_DO_BOT`, `FUNIL_DO_BOT`). As funções `.regras.ts` recebem a identidade (ou um pedaço dela) por parâmetro opcional cujo padrão é o valor de hoje da Isa, então os testes atuais continuam passando sem mudança. Todo SQL das tabelas por-bot passa a usar `TAB.*` (schema da identidade) e toda gravação/consulta de mensagem usa `IDENTIDADE.instancia`.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5.9, `pg` direto (`sql()` de `banco.ts`), testes `node --test` com type stripping do Node 24 (`npm run test:painel`), Python 3 só para um script de troca mecânica (apagado depois).

**Spec:** `docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md` (seções 1, 2 lado código, 3 e 4). Inventário de pontos: `21go-website/.superpowers-mariana-inventario.md` (linhas reconferidas neste worktree, que já tem o commit da etiqueta Urgente).

## Global Constraints

- **Isa intocada:** sem nenhum env novo, os textos, o prompt, os templates, os resultados de SQL e o comportamento da Isa ficam iguais. `npm run test:painel` (hoje: 342 testes, 0 falhas) tem que passar **sem editar nenhum teste existente**.
- **Typecheck:** `npx tsc --noEmit` hoje já tem 10 erros antigos, só em `src/components/cinema/ScrollCinema.tsx` e `src/app/api/vehicle/lead/route.ts`. Critério: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"` não imprime nada. `npm run lint` não está configurado (abre o assistente interativo do ESLint): não rodar.
- **Identidade:** valores vêm do env do servidor, com o valor de hoje da Isa/casa como padrão. Funções `.regras.ts` nunca leem `process.env`: recebem a identidade por parâmetro (o painel no navegador importa algumas delas).
- **`.regras.ts` só podem ter `import type` entre si** (os testes atuais importam esses arquivos direto, sem o resolvedor do Next; import de valor sem extensão quebra o `node --test`).
- **Valores da Mariana:** bot "Mariana", número 5521966530011 ("96653-0011"); humano "Gabriel" / completo "Gabriel Juliano", masculino, telefone 5521990954964 ("+55 21 99095-4964", "21 99095-4964"), apelido "Gabriel"; PowerLink `XDmAbx6D`; alertas para 5521990954964 (`ISA_ALERTA_PARA`); schema `mariana`; instância `cloud_mariana`; WABA `1387797460178079`; phone id `1308557115675774` (`WA_PHONE_ID`, já é env); etiquetas = as da Isa com `leticya` trocada por `gabriel` ("Falando com Gabriel", mesma posição e cor) e sem `guilherme`; "escolheu plano" vai para a coluna `gabriel`; origem dos leads criados pela IA `mariana_whatsapp`; prefixo de `trk` `mariana`; fonte de leads dos 5 min `dominio = '21go.app'`; promoção 40% e vigia-BYD só da casa.
- **Fora desta fase:** container, Caddy, DNS, script de cron, webhook da WABA, arquivo de env (Fase 2); CRM (Fase 3); gravação de lead em `/api/parceiro/lead` e abordagem do 21go.app (Fase 4). Nenhum push, nenhum deploy, nenhuma escrita em banco. A DDL do schema `mariana` é só um arquivo, **não executado**.
- **Testes novos:** variantes Mariana em arquivos NOVOS (nunca editar os antigos), conferindo Gabriel/Mariana e a ausência de Leticya/4824/21go.site onde couber.
- **Commits:** em português, `tipo(escopo): descrição`, cada um terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (usar dois `-m`). Só os arquivos da tarefa.
- **Estilo:** diffs cirúrgicos, comentários sem acento e em português como no resto de `src/lib/isa/`, sem refatorar código vizinho. Código morto que já existia (ex.: `NUMERO_4824` em `dono.regras.ts`) fica.
- **Diretório de trabalho:** todos os comandos rodam em `C:/Users/damas/Documents/PROJETOS/21 GO/wt-mariana-f1/21go-website` (o app Next). Os arquivos do working tree estão em CRLF (`core.autocrlf=true`); o Edit tool e o script Python abaixo preservam isso.

---

## Mapa de arquivos

**Novos**
- `src/lib/isa/identidade.regras.ts` — tipo `IdentidadeBot`, `identidadeDoAmbiente`, validação contra mistura com a casa, tabelas por schema, filtro de leads do bot, atendimento do PDF, indicação, nomes de cumprimento, `painelDoBot`.
- `src/lib/isa/identidade.ts` — `IDENTIDADE`, `TAB`, `ETIQUETAS_DO_BOT`, `FUNIL_DO_BOT` (servidor, `server-only`).
- `supabase/migrations/300_mariana_schema.sql` — DDL aditiva do schema `mariana` (não executada).
- `testes/isa/_mariana.ts` — env do container da Mariana (fixture e referência da Fase 2) e a identidade montada.
- `testes/isa/identidade.test.ts`, `testes/isa/identidade-servidor.test.ts`, `testes/isa/etiquetas-mariana.test.ts`, `testes/isa/funil-mariana.test.ts`, `testes/isa/dono-mariana.test.ts`, `testes/isa/entrega-mariana.test.ts`, `testes/consultor/recrutamento-mariana.test.ts`, `testes/isa/prompt-mariana.test.ts`, `testes/isa/validador-mariana.test.ts`, `testes/isa/venda-mariana.test.ts`, `testes/isa/schema-do-bot.test.ts`, `testes/isa/abordagem-mariana.test.ts`, `testes/isa/pdf-mariana.test.ts`, `testes/power/fila-mariana.test.ts`, `testes/isa/painel-mariana.test.ts`, `testes/isa/ddl-mariana.test.ts`.

**Modificados**
- Regras puras: `src/lib/isa/etiquetas.regras.ts`, `src/lib/isa/funil.regras.ts`, `src/lib/isa/dono.regras.ts`, `src/lib/isa/entrega.regras.ts`, `src/lib/consultor-recrutamento.regras.ts`, `src/lib/isa/prompt.regras.ts`, `src/lib/isa/validador.regras.ts`, `src/lib/isa/venda.regras.ts`, `src/lib/power-fila.regras.ts`.
- Servidor: `src/lib/isa/{banco,abordagem,acoes,alertas,cerebro,cloud,desconto-auto,fatos,orcamento,painel-dados,promocao,relatorio,virada-do-dia,worker}.ts`, `src/lib/consultor-recrutamento.ts`, `src/lib/supabase-store.ts`, `src/lib/pdf-quote.ts`.
- Rotas: `src/app/api/atendimento/{etiquetas,nota,reabrir,resolvido,responder,responder-arquivo,responder-audio,transferir,eu,funil,contatos}/route.ts`, `src/app/api/webhooks/whatsapp-bot/route.ts`, `src/app/api/pdfs/[leadId]/route.ts`, `src/app/api/cron/power-pendentes/route.ts`, `src/app/api/cron/vigia-byd/route.ts`.
- Painel: `src/components/isa/PainelIsa.tsx`.

**Ordem:** 1 (identidade) → 2 (etiquetas/funil) → 3 e 4 (textos puros) → 5 (SQL/instância) → 6 e 7 (fiação no servidor) → 8 (PDF) → 9 (fila do Power) → 10 (painel) → 11 (DDL) → 12 (verificação final). As tarefas 6 e 7 editam linhas que a 5 já mexeu; respeite a ordem.

---

### Task 1: Módulo de identidade (puro + servidor)

**Files:**
- Create: `src/lib/isa/identidade.regras.ts`
- Create: `src/lib/isa/identidade.ts`
- Create: `testes/isa/_mariana.ts`
- Test: `testes/isa/identidade.test.ts`, `testes/isa/identidade-servidor.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (em `identidade.regras.ts`):
  - `type GeneroHumano = 'm' | 'f'`
  - `interface HumanoDoBot { id: string; nome: string; nomeCompleto: string; genero: GeneroHumano; telefone: string; telefoneBonito: string; telefoneCurto: string; apelido: string }`
  - `interface FonteDeLeads { origens: readonly string[] | null; dominios: readonly string[] }`
  - `interface IdentidadeBot { nome: string; numero: string; numeroBonito: string; humano: HumanoDoBot; donoPor: string; powerlink: string; waba: string; instancia: string; schema: string; siteUrl: string; painelUrl: string; leadOrigem: string; trkPrefixo: string; fonte5min: FonteDeLeads; semEtiquetas: readonly string[]; daCasa: boolean }`
  - `const INSTANCIA_DA_CASA = 'cloud_isa'`, `const WABA_DA_CASA = '932143313296745'`, `const POWERLINK_DA_CASA = 'WDVMKnkq'`, `const LEADS_DE_PARCEIRO: { origens: readonly string[]; dominios: readonly string[] }`
  - `telefoneBonitoDe(t: string): string`, `telefoneCurtoDe(t: string): string`, `numeroBonitoDe(t: string): string`
  - `identidadeDoAmbiente(env: Record<string, string | undefined>): IdentidadeBot` (lança `Error` se `errosDaIdentidade` não vier vazio)
  - `errosDaIdentidade(id: IdentidadeBot): string[]`
  - `const IDENTIDADE_ISA: IdentidadeBot`
  - `interface TabelasDoBot { contatos: string; eventos: string; config: string; promocoes: string; recrutamento: string }`, `tabelasDoBot(schema: string): TabelasDoBot`
  - `interface FiltroDeLeads { incluirOrigens: string[] | null; incluirDominios: string[]; excluirOrigens: string[]; excluirDominios: string[] }`, `leadsDoBot(id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>): FiltroDeLeads`
  - `leadEhDoBot(lead: { origem?: string | null; dominio?: string | null }, id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>): boolean`
  - `atendimentoDoPdf(lead: { origem?: string | null; dominio?: string | null }, id: IdentidadeBot): { nome: string; whatsappUrl: string } | null`
  - `indicacaoDoBot(id: { humano: Pick<HumanoDoBot, 'genero' | 'nomeCompleto'> }): string`
  - `nomesDoCumprimento(id: { nome: string; humano: { nome: string } }): string[]`
- Produces (em `identidade.ts`): `const IDENTIDADE: IdentidadeBot`, `const TAB: TabelasDoBot`.
- Produces (em `testes/isa/_mariana.ts`): `const ENV_MARIANA: Record<string, string>`, `const MARIANA: IdentidadeBot`.

- [ ] **Step 1: Escrever a fixture da Mariana**

Create `testes/isa/_mariana.ts`:

```ts
/*
 * O env do container da Mariana (Gabriel Juliano). Fixture dos testes de variante e referencia
 * pro /opt/site21go/.env-mariana da Fase 2 — o que nao esta aqui fica no padrao da Isa.
 * Nao termina em .test.ts de proposito: o `node --test` nao roda isto sozinho.
 */
import { identidadeDoAmbiente } from '../../src/lib/isa/identidade.regras.ts'

export const ENV_MARIANA: Record<string, string> = {
  BOT_NOME: 'Mariana',
  BOT_NUMERO: '5521966530011',
  BOT_HUMANO_ID: 'gabriel',
  BOT_HUMANO_NOME: 'Gabriel',
  BOT_HUMANO_NOME_COMPLETO: 'Gabriel Juliano',
  BOT_HUMANO_GENERO: 'm',
  BOT_HUMANO_TELEFONE: '5521990954964',
  BOT_HUMANO_APELIDO: 'Gabriel',
  BOT_DONO_POR: 'gabriel',
  POWERCRM_DEFAULT_SLSMN_NW_ID: 'XDmAbx6D',
  WA_WABA_ID: '1387797460178079',
  WA_PHONE_ID: '1308557115675774',
  ISA_ALERTA_PARA: '5521990954964',
  BOT_INSTANCIA: 'cloud_mariana',
  BOT_SCHEMA: 'mariana',
  BOT_SITE_URL: 'https://mariana.21go.site',
  BOT_LEAD_ORIGEM: 'mariana_whatsapp',
  BOT_TRK_PREFIXO: 'mariana',
  BOT_LEADS_5MIN_ORIGENS: '*',
  BOT_LEADS_5MIN_DOMINIOS: '21go.app',
  BOT_SEM_ETIQUETAS: 'guilherme',
}

export const MARIANA = identidadeDoAmbiente(ENV_MARIANA)
```

- [ ] **Step 2: Escrever o teste puro que falha**

Create `testes/isa/identidade.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  identidadeDoAmbiente,
  IDENTIDADE_ISA,
  tabelasDoBot,
  leadsDoBot,
  leadEhDoBot,
  atendimentoDoPdf,
  indicacaoDoBot,
  nomesDoCumprimento,
  telefoneBonitoDe,
  telefoneCurtoDe,
  numeroBonitoDe,
  LEADS_DE_PARCEIRO,
} from '../../src/lib/isa/identidade.regras.ts'
import { ENV_MARIANA, MARIANA } from './_mariana.ts'

test('sem env nenhum, a identidade e a Isa de hoje, valor por valor', () => {
  assert.deepEqual(identidadeDoAmbiente({}), {
    nome: 'Isa',
    numero: '5521980040964',
    numeroBonito: '98004-0964',
    humano: {
      id: 'leticya',
      nome: 'Leticya',
      nomeCompleto: 'Leticya Thayene',
      genero: 'f',
      telefone: '5521969454824',
      telefoneBonito: '+55 21 96945-4824',
      telefoneCurto: '21 96945-4824',
      apelido: '4824',
    },
    donoPor: 'juliano',
    powerlink: 'WDVMKnkq',
    waba: '932143313296745',
    instancia: 'cloud_isa',
    schema: 'public',
    siteUrl: 'https://21go.site',
    painelUrl: 'https://21go.site/painel',
    leadOrigem: 'isa_whatsapp',
    trkPrefixo: 'isa',
    fonte5min: {
      origens: ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro'],
      dominios: ['21go.site', '21goconsultoraleticya.site'],
    },
    semEtiquetas: [],
    daCasa: true,
  })
  assert.deepEqual(IDENTIDADE_ISA, identidadeDoAmbiente({}))
})

test('a casa continua respeitando o env que ja existia (WA_WABA_ID, POWERCRM_DEFAULT_SLSMN_NW_ID)', () => {
  const id = identidadeDoAmbiente({ WA_WABA_ID: '111', POWERCRM_DEFAULT_SLSMN_NW_ID: 'abc' })
  assert.equal(id.waba, '111')
  assert.equal(id.powerlink, 'abc')
  assert.equal(id.daCasa, true)
})

test('Mariana: Gabriel, schema mariana, instancia cloud_mariana, WABA e Power dele', () => {
  assert.equal(MARIANA.nome, 'Mariana')
  assert.equal(MARIANA.numero, '5521966530011')
  assert.equal(MARIANA.numeroBonito, '96653-0011')
  assert.deepEqual(MARIANA.humano, {
    id: 'gabriel',
    nome: 'Gabriel',
    nomeCompleto: 'Gabriel Juliano',
    genero: 'm',
    telefone: '5521990954964',
    telefoneBonito: '+55 21 99095-4964',
    telefoneCurto: '21 99095-4964',
    apelido: 'Gabriel',
  })
  assert.equal(MARIANA.donoPor, 'gabriel')
  assert.equal(MARIANA.powerlink, 'XDmAbx6D')
  assert.equal(MARIANA.waba, '1387797460178079')
  assert.equal(MARIANA.instancia, 'cloud_mariana')
  assert.equal(MARIANA.schema, 'mariana')
  assert.equal(MARIANA.siteUrl, 'https://mariana.21go.site')
  assert.equal(MARIANA.painelUrl, 'https://mariana.21go.site/painel')
  assert.equal(MARIANA.leadOrigem, 'mariana_whatsapp')
  assert.equal(MARIANA.trkPrefixo, 'mariana')
  assert.deepEqual(MARIANA.fonte5min, { origens: null, dominios: ['21go.app'] })
  assert.deepEqual(MARIANA.semEtiquetas, ['guilherme'])
  assert.equal(MARIANA.daCasa, false)
})

test('identidade que embola com a casa nao sobe', () => {
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_SCHEMA: 'public' }), /schema/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, WA_WABA_ID: '' }), /WABA/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, POWERCRM_DEFAULT_SLSMN_NW_ID: '' }), /Power/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_HUMANO_TELEFONE: '' }), /humano/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_LEAD_ORIGEM: '' }), /origem/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_TRK_PREFIXO: '' }), /trk/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_NUMERO: '' }), /numero/)
  // a instancia da casa nunca sai do schema public
  assert.throws(() => identidadeDoAmbiente({ BOT_SCHEMA: 'mariana' }), /casa/)
  // so valor seguro entra no SQL
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_SCHEMA: 'mariana; drop table x' }), /schema/)
  assert.throws(() => identidadeDoAmbiente({ ...ENV_MARIANA, BOT_INSTANCIA: "x' or 1=1" }), /instancia/)
})

test('telefone: bonito, curto e o numero do proprio bot', () => {
  assert.equal(telefoneBonitoDe('5521969454824'), '+55 21 96945-4824')
  assert.equal(telefoneCurtoDe('5521990954964'), '21 99095-4964')
  assert.equal(numeroBonitoDe('5521980040964'), '98004-0964')
  assert.equal(numeroBonitoDe('5521966530011'), '96653-0011')
  assert.equal(telefoneBonitoDe('abc'), 'abc')
})

test('tabelas por-bot qualificadas pelo schema', () => {
  assert.deepEqual(tabelasDoBot('public'), {
    contatos: 'public.isa_contatos',
    eventos: 'public.isa_eventos',
    config: 'public.isa_config',
    promocoes: 'public.isa_promocoes',
    recrutamento: 'public.consultor_recrutamento',
  })
  assert.equal(tabelasDoBot(MARIANA.schema).contatos, 'mariana.isa_contatos')
  assert.equal(tabelasDoBot(MARIANA.schema).recrutamento, 'mariana.consultor_recrutamento')
})

test('leads do bot: a Isa ve todos menos os da Mariana; a Mariana so os dela', () => {
  assert.deepEqual(leadsDoBot(IDENTIDADE_ISA), {
    incluirOrigens: null,
    incluirDominios: [],
    excluirOrigens: ['mariana_whatsapp'],
    excluirDominios: ['21go.app'],
  })
  assert.deepEqual(leadsDoBot(MARIANA), {
    incluirOrigens: ['mariana_whatsapp'],
    incluirDominios: ['21go.app'],
    excluirOrigens: [],
    excluirDominios: [],
  })
  // as marcas de parceiro sao exatamente as da Mariana
  assert.deepEqual([...LEADS_DE_PARCEIRO.origens], [MARIANA.leadOrigem])
  assert.deepEqual([...LEADS_DE_PARCEIRO.dominios], [...MARIANA.fonte5min.dominios])

  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.site' }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'isa_whatsapp', dominio: null }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'power_crm' }, IDENTIDADE_ISA), true)
  assert.equal(leadEhDoBot({ origem: 'mariana_whatsapp', dominio: null }, IDENTIDADE_ISA), false)
  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.app' }, IDENTIDADE_ISA), false)
  assert.equal(leadEhDoBot({ origem: 'mariana_whatsapp' }, MARIANA), true)
  assert.equal(leadEhDoBot({ origem: 'qualquer', dominio: '21go.app' }, MARIANA), true)
  assert.equal(leadEhDoBot({ origem: 'site_organico', dominio: '21go.site' }, MARIANA), false)
})

test('PDF: lead da Mariana sai com o Gabriel; na Isa nada muda', () => {
  assert.equal(atendimentoDoPdf({ origem: 'mariana_whatsapp' }, IDENTIDADE_ISA), null)
  assert.equal(atendimentoDoPdf({ origem: 'site_organico', dominio: '21go.site' }, IDENTIDADE_ISA), null)
  assert.deepEqual(atendimentoDoPdf({ origem: 'mariana_whatsapp' }, MARIANA), {
    nome: 'Gabriel Juliano',
    whatsappUrl: 'https://wa.me/5521990954964',
  })
  assert.deepEqual(atendimentoDoPdf({ origem: 'x', dominio: '21go.app' }, MARIANA)?.whatsappUrl, 'https://wa.me/5521990954964')
  assert.equal(atendimentoDoPdf({ origem: 'site_organico', dominio: '21go.site' }, MARIANA), null)
})

test('indicacao do "Quero ser consultor" e nomes que viram cumprimento', () => {
  assert.equal(indicacaoDoBot(IDENTIDADE_ISA), 'da consultora Leticya Thayene')
  assert.equal(indicacaoDoBot(MARIANA), 'do consultor Gabriel Juliano')
  assert.deepEqual(nomesDoCumprimento(IDENTIDADE_ISA), ['isa', 'leticya'])
  assert.deepEqual(nomesDoCumprimento(MARIANA), ['mariana', 'gabriel'])
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test testes/isa/identidade.test.ts`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` apontando `src/lib/isa/identidade.regras.ts`.

- [ ] **Step 4: Implementar o módulo puro**

Create `src/lib/isa/identidade.regras.ts`:

```ts
/**
 * Identidade do robo de atendimento: tudo o que muda da Isa (casa, 98004-0964, Leticya) pra
 * Mariana (Gabriel Juliano, 96653-0011). Spec: docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md.
 *
 * Logica pura, sem `process.env`: o painel no navegador tambem importa este arquivo e la o env do
 * servidor nao chega. O servidor monta a identidade em `identidade.ts`.
 *
 * Regra-mae (dono, 01/10/2026): sem env nenhum, cada valor e o de hoje da Isa, byte a byte.
 */

export type GeneroHumano = 'm' | 'f'

/** Quem assume a conversa quando o bot transfere (Leticya na Isa, Gabriel na Mariana). */
export interface HumanoDoBot {
  /** id da etiqueta e da coluna "Falando com ..." (e pra onde vai quem escolheu plano) */
  id: string
  nome: string
  nomeCompleto: string
  genero: GeneroHumano
  /** 55 + DDD + numero */
  telefone: string
  /** "+55 21 96945-4824": o que vai pro cliente, clicavel no WhatsApp */
  telefoneBonito: string
  /** "21 96945-4824": a resposta pronta do "posso te ligar?" */
  telefoneCurto: string
  /** Como o painel e os alertas chamam a transferencia ("4824" na Isa) */
  apelido: string
}

export interface FonteDeLeads {
  /** null = qualquer origem */
  origens: readonly string[] | null
  dominios: readonly string[]
}

export interface IdentidadeBot {
  nome: string
  /** numero do bot, 55 + DDD + numero */
  numero: string
  /** "98004-0964" */
  numeroBonito: string
  humano: HumanoDoBot
  /** rotulo `por` dos eventos quando o dono responde pelo WhatsApp de alertas */
  donoPor: string
  powerlink: string
  waba: string
  /** conversations/messages.evolution_instance */
  instancia: string
  /** schema das tabelas por-bot (isa_contatos, isa_eventos, isa_config, isa_promocoes, consultor_recrutamento) */
  schema: string
  /** base dos links de PDF que o bot manda */
  siteUrl: string
  painelUrl: string
  /** leads.origem do que a IA cria */
  leadOrigem: string
  trkPrefixo: string
  /** de onde vem quem recebe a mensagem dos 5 min */
  fonte5min: FonteDeLeads
  /** etiquetas da Isa que este bot nao usa */
  semEtiquetas: readonly string[]
  /** so a Isa, na instancia da casa: promocao 40%, vigia-BYD */
  daCasa: boolean
}

export const INSTANCIA_DA_CASA = 'cloud_isa'
export const WABA_DA_CASA = '932143313296745'
export const POWERLINK_DA_CASA = 'WDVMKnkq'
const NUMERO_DA_CASA = '5521980040964'
const TELEFONE_DA_LETICYA = '5521969454824'
const ORIGEM_DA_ISA = 'isa_whatsapp'
const TRK_DA_ISA = 'isa'
// Origens que o formulario do site grava (deriveOrigem). Fica de fora o que o CRM espelha
// (power_crm, manual, seja_consultor) e o que a propria Isa cria (isa_whatsapp).
const ORIGENS_DO_SITE = ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro']
// Os .site da casa (o mesmo DOMINIOS_DA_CASA de popup.regras.ts).
const DOMINIOS_DA_CASA = ['21go.site', '21goconsultoraleticya.site']

/**
 * Marcas dos leads de bot de parceiro (hoje so a Mariana): a Isa nunca usa esses leads como
 * simulacao do cliente. Os valores sao os do env da Mariana (testes/isa/_mariana.ts confere).
 */
export const LEADS_DE_PARCEIRO: { origens: readonly string[]; dominios: readonly string[] } = {
  origens: ['mariana_whatsapp'],
  dominios: ['21go.app'],
}

type Ambiente = Record<string, string | undefined>

const separar = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const partesDoTelefone = (t: string) => t.match(/^55(\d{2})(\d{4,5})(\d{4})$/)

/** 5521969454824 -> "+55 21 96945-4824" */
export function telefoneBonitoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : t
}

/** 5521969454824 -> "21 96945-4824" */
export function telefoneCurtoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `${m[1]} ${m[2]}-${m[3]}` : t
}

/** 5521980040964 -> "98004-0964" (como o numero do bot aparece nos textos de hoje) */
export function numeroBonitoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `${m[2]}-${m[3]}` : t
}

export function identidadeDoAmbiente(env: Ambiente): IdentidadeBot {
  const v = (chave: string, padrao: string) => (env[chave] || '').trim() || padrao
  const numero = v('BOT_NUMERO', NUMERO_DA_CASA)
  const telefone = v('BOT_HUMANO_TELEFONE', TELEFONE_DA_LETICYA)
  const instancia = v('BOT_INSTANCIA', INSTANCIA_DA_CASA)
  const siteUrl = v('BOT_SITE_URL', 'https://21go.site').replace(/\/+$/, '')
  const origens5min = v('BOT_LEADS_5MIN_ORIGENS', ORIGENS_DO_SITE.join(','))
  const id: IdentidadeBot = {
    nome: v('BOT_NOME', 'Isa'),
    numero,
    numeroBonito: numeroBonitoDe(numero),
    humano: {
      id: v('BOT_HUMANO_ID', 'leticya'),
      nome: v('BOT_HUMANO_NOME', 'Leticya'),
      nomeCompleto: v('BOT_HUMANO_NOME_COMPLETO', 'Leticya Thayene'),
      genero: v('BOT_HUMANO_GENERO', 'f') === 'm' ? 'm' : 'f',
      telefone,
      telefoneBonito: telefoneBonitoDe(telefone),
      telefoneCurto: telefoneCurtoDe(telefone),
      apelido: v('BOT_HUMANO_APELIDO', '4824'),
    },
    donoPor: v('BOT_DONO_POR', 'juliano'),
    powerlink: v('POWERCRM_DEFAULT_SLSMN_NW_ID', POWERLINK_DA_CASA),
    waba: v('WA_WABA_ID', WABA_DA_CASA),
    instancia,
    schema: v('BOT_SCHEMA', 'public'),
    siteUrl,
    painelUrl: `${siteUrl}/painel`,
    leadOrigem: v('BOT_LEAD_ORIGEM', ORIGEM_DA_ISA),
    trkPrefixo: v('BOT_TRK_PREFIXO', TRK_DA_ISA),
    fonte5min: {
      origens: origens5min === '*' ? null : separar(origens5min),
      dominios: separar(v('BOT_LEADS_5MIN_DOMINIOS', DOMINIOS_DA_CASA.join(','))),
    },
    semEtiquetas: separar(env.BOT_SEM_ETIQUETAS || ''),
    daCasa: instancia === INSTANCIA_DA_CASA,
  }
  const erros = errosDaIdentidade(id)
  if (erros.length) throw new Error(`identidade do bot invalida: ${erros.join('; ')}`)
  return id
}

/**
 * O que nao pode: valor que vai pro SQL fora do formato, e bot que nao e a casa usando qualquer
 * coisa da casa (schema, WABA, Power, telefone da Leticya, marca de lead). Melhor o container nao
 * subir do que responder cliente do Gabriel no banco da Isa (dono: "banco diferente pra nao embolar").
 */
export function errosDaIdentidade(id: IdentidadeBot): string[] {
  const erros: string[] = []
  if (!/^[a-z_][a-z0-9_]*$/.test(id.schema)) erros.push(`schema invalido: ${id.schema}`)
  if (!/^[a-z0-9_]+$/.test(id.instancia)) erros.push(`instancia invalida: ${id.instancia}`)
  if (!/^[a-z]+$/.test(id.trkPrefixo)) erros.push(`prefixo de trk invalido: ${id.trkPrefixo}`)
  if (id.daCasa) {
    if (id.schema !== 'public') erros.push(`a instancia da casa (${INSTANCIA_DA_CASA}) usa o schema public`)
    return erros
  }
  if (id.schema === 'public') erros.push('schema public e da Isa')
  if (id.waba === WABA_DA_CASA) erros.push('WABA da Isa')
  if (id.powerlink === POWERLINK_DA_CASA) erros.push(`Power da Leticya (${POWERLINK_DA_CASA})`)
  if (id.humano.telefone === TELEFONE_DA_LETICYA) erros.push('telefone do humano e o da Leticya')
  if (id.leadOrigem === ORIGEM_DA_ISA) erros.push('origem de lead da Isa')
  if (id.trkPrefixo === TRK_DA_ISA) erros.push('prefixo de trk da Isa')
  if (id.numero === NUMERO_DA_CASA) erros.push('numero do bot e o da Isa')
  return erros
}

export const IDENTIDADE_ISA: IdentidadeBot = identidadeDoAmbiente({})

export interface TabelasDoBot {
  contatos: string
  eventos: string
  config: string
  promocoes: string
  recrutamento: string
}

/** As tabelas por-bot no schema do bot. O schema ja passou pelo formato em errosDaIdentidade. */
export function tabelasDoBot(schema: string): TabelasDoBot {
  return {
    contatos: `${schema}.isa_contatos`,
    eventos: `${schema}.isa_eventos`,
    config: `${schema}.isa_config`,
    promocoes: `${schema}.isa_promocoes`,
    recrutamento: `${schema}.consultor_recrutamento`,
  }
}

export interface FiltroDeLeads {
  /** null = sem filtro de inclusao (a Isa ve todo lead sem consultor) */
  incluirOrigens: string[] | null
  incluirDominios: string[]
  excluirOrigens: string[]
  excluirDominios: string[]
}

/**
 * Quais leads sao "do bot" quando ele procura a simulacao do cliente (leadDoCliente) e no PDF.
 * A Isa: todos os de sempre, menos os de bot de parceiro. A Mariana: so os que ela criou e os do
 * site do Gabriel (spec, secao 2: "leadDoCliente passa a olhar so os leads da fonte do bot").
 */
export function leadsDoBot(id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>): FiltroDeLeads {
  if (id.daCasa) {
    return {
      incluirOrigens: null,
      incluirDominios: [],
      excluirOrigens: [...LEADS_DE_PARCEIRO.origens],
      excluirDominios: [...LEADS_DE_PARCEIRO.dominios],
    }
  }
  return { incluirOrigens: [id.leadOrigem], incluirDominios: [...id.fonte5min.dominios], excluirOrigens: [], excluirDominios: [] }
}

/** O mesmo filtro de leadsDoBot, em JS (o SQL esta em fatos.ts). */
export function leadEhDoBot(
  lead: { origem?: string | null; dominio?: string | null },
  id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>,
): boolean {
  const f = leadsDoBot(id)
  const origem = lead.origem ?? ''
  const dominio = lead.dominio ?? ''
  if (f.excluirOrigens.includes(origem) || f.excluirDominios.includes(dominio)) return false
  return f.incluirOrigens === null || f.incluirOrigens.includes(origem) || f.incluirDominios.includes(dominio)
}

/**
 * O PDF de um lead da Mariana sai com o rodape e o botao do Gabriel, nunca os da casa (spec,
 * secao 3). Na Isa: sempre null, o PDF de sempre.
 */
export function atendimentoDoPdf(
  lead: { origem?: string | null; dominio?: string | null },
  id: IdentidadeBot,
): { nome: string; whatsappUrl: string } | null {
  if (id.daCasa || !leadEhDoBot(lead, id)) return null
  return { nome: id.humano.nomeCompleto, whatsappUrl: `https://wa.me/${id.humano.telefone}` }
}

/** "da consultora Leticya Thayene" / "do consultor Gabriel Juliano" — o "Quero ser consultor". */
export function indicacaoDoBot(id: { humano: Pick<HumanoDoBot, 'genero' | 'nomeCompleto'> }): string {
  return `${id.humano.genero === 'f' ? 'da consultora' : 'do consultor'} ${id.humano.nomeCompleto}`
}

/** Nomes que, sozinhos ou num "oi", sao so cumprimento ("oi isa", "leticya?"). */
export function nomesDoCumprimento(id: { nome: string; humano: { nome: string } }): string[] {
  return [id.nome, id.humano.nome].map((n) =>
    n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  )
}
```

- [ ] **Step 5: Rodar o teste puro e ver passar**

Run: `node --test testes/isa/identidade.test.ts`
Expected: PASS, 9 testes, 0 falhas.

- [ ] **Step 6: Escrever o teste do lado servidor que falha**

Create `testes/isa/identidade-servidor.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarResolvedorDoNext } from '../_shim/resolver.ts'
import { ENV_MARIANA } from './_mariana.ts'

ligarResolvedorDoNext()
// Cada arquivo de teste roda em processo proprio: mexer no env aqui nao vaza pros outros.
Object.assign(process.env, ENV_MARIANA)

test('no container da Mariana o servidor le a identidade dela e o schema mariana', async () => {
  const { IDENTIDADE, TAB } = await import('../../src/lib/isa/identidade.ts')
  assert.equal(IDENTIDADE.nome, 'Mariana')
  assert.equal(IDENTIDADE.instancia, 'cloud_mariana')
  assert.equal(TAB.contatos, 'mariana.isa_contatos')
  assert.equal(TAB.eventos, 'mariana.isa_eventos')
  assert.equal(TAB.config, 'mariana.isa_config')
  assert.equal(TAB.promocoes, 'mariana.isa_promocoes')
  assert.equal(TAB.recrutamento, 'mariana.consultor_recrutamento')
})
```

Run: `node --test testes/isa/identidade-servidor.test.ts`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` em `src/lib/isa/identidade.ts`.

- [ ] **Step 7: Implementar o módulo do servidor**

Create `src/lib/isa/identidade.ts`:

```ts
import 'server-only'
import { identidadeDoAmbiente, tabelasDoBot, type IdentidadeBot, type TabelasDoBot } from '@/lib/isa/identidade.regras'

/**
 * A identidade deste container (Isa na casa, Mariana no container dela), lida UMA vez do env.
 * Identidade que embola com a casa derruba o import de proposito (errosDaIdentidade): melhor nao
 * subir do que responder cliente do Gabriel no schema da Isa.
 */
export const IDENTIDADE: IdentidadeBot = identidadeDoAmbiente(process.env)

/** Tabelas por-bot qualificadas pelo schema da identidade. Unico valor de identidade interpolado em SQL. */
export const TAB: TabelasDoBot = tabelasDoBot(IDENTIDADE.schema)
```

- [ ] **Step 8: Rodar os dois testes, a suíte e o typecheck**

Run: `node --test testes/isa/identidade.test.ts testes/isa/identidade-servidor.test.ts`
Expected: PASS (10 testes).

Run: `npm run test:painel`
Expected: todos passam (342 antigos + 10 novos), 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 9: Commit**

```bash
git add src/lib/isa/identidade.regras.ts src/lib/isa/identidade.ts testes/isa/_mariana.ts testes/isa/identidade.test.ts testes/isa/identidade-servidor.test.ts
git commit -m "feat(mariana): identidade do bot configuravel, padrao Isa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Etiquetas e funil por identidade

**Files:**
- Modify: `src/lib/isa/etiquetas.regras.ts:44-80` (de `const IDS` até `etiquetasParaGravar`)
- Modify: `src/lib/isa/funil.regras.ts:24-106` (de `const IDS` até `etapaDoCard`)
- Modify: `src/lib/isa/identidade.ts` (exportar `ETIQUETAS_DO_BOT`, `FUNIL_DO_BOT`)
- Test: `testes/isa/etiquetas-mariana.test.ts`, `testes/isa/funil-mariana.test.ts`

**Interfaces:**
- Consumes: `IdentidadeBot`, `IDENTIDADE_ISA`, `IDENTIDADE` (Task 1); `MARIANA` (fixture).
- Produces (etiquetas.regras.ts):
  - `etiquetasDoBot(bot: { humano: { id: string; nome: string }; semEtiquetas: readonly string[] }): Etiqueta[]`
  - `normalizarEtiquetas(lista: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[]`
  - `etiquetasForaDaFila(etiquetas: readonly Etiqueta[] = ETIQUETAS): string[]` (e `ETIQUETAS_FORA_DA_FILA` continua existindo = `etiquetasForaDaFila()`)
  - `etiquetaValida(id: string | null | undefined, etiquetas: readonly Etiqueta[] = ETIQUETAS): boolean`
  - `etiquetasParaGravar(pedidas: unknown, gravadas: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[]`
- Produces (funil.regras.ts):
  - `interface FunilDoBot { etapas: readonly Etapa[]; humanoId: string }`, `const FUNIL_PADRAO: FunilDoBot`
  - `funilDoBot(bot: { humano: { id: string; nome: string }; semEtiquetas: readonly string[] }): FunilDoBot`
  - `ehEtapa(id, f: FunilDoBot = FUNIL_PADRAO)`, `etapaCompativel(id, f = FUNIL_PADRAO)`, `etiquetasAoMover(atuais, destino, f = FUNIL_PADRAO)`, `etapaDoCard(c, f = FUNIL_PADRAO)`
- Produces (identidade.ts): `ETIQUETAS_DO_BOT: readonly Etiqueta[]`, `FUNIL_DO_BOT: FunilDoBot`.

- [ ] **Step 1: Escrever os testes que falham**

Create `testes/isa/etiquetas-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETIQUETAS,
  ETIQUETAS_FORA_DA_FILA,
  etiquetasDoBot,
  etiquetasForaDaFila,
  normalizarEtiquetas,
  etiquetaValida,
  etiquetasParaGravar,
} from '../../src/lib/isa/etiquetas.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

test('na Isa a lista e a de sempre', () => {
  assert.deepEqual(etiquetasDoBot(IDENTIDADE_ISA), ETIQUETAS)
  assert.deepEqual(etiquetasForaDaFila(), [...ETIQUETAS_FORA_DA_FILA])
})

test('Mariana: Gabriel no lugar da Leticya, mesma posicao e cor, e sem Guilherme', () => {
  const lista = etiquetasDoBot(MARIANA)
  assert.deepEqual(
    lista.map((e) => e.id),
    ['urgente', 'quente', 'gabriel', 'pensando', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'],
  )
  const gabriel = lista.find((e) => e.id === 'gabriel')
  const leticya = ETIQUETAS.find((e) => e.id === 'leticya')
  assert.equal(gabriel?.nome, 'Falando com Gabriel')
  assert.equal(gabriel?.cor, leticya?.cor)
  assert.equal(gabriel?.claro, leticya?.claro)
  assert.ok(!lista.some((e) => /Leticya|Guilherme/.test(e.nome)))
})

test('Mariana: as regras da lista usam a lista dela', () => {
  const lista = etiquetasDoBot(MARIANA)
  assert.deepEqual([...etiquetasForaDaFila(lista)].sort(), ['consultor', 'documento', 'fechou', 'frio', 'gabriel', 'pensando', 'vistoria'])
  assert.deepEqual(normalizarEtiquetas(['leticya', 'gabriel', 'guilherme', 'frio'], lista), ['gabriel', 'frio'])
  assert.equal(etiquetaValida('gabriel', lista), true)
  assert.equal(etiquetaValida('leticya', lista), false)
  assert.equal(etiquetaValida('guilherme', lista), false)
  assert.deepEqual(etiquetasParaGravar(['gabriel'], ['avaria'], lista), ['gabriel', 'avaria'])
})
```

Create `testes/isa/funil-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAPAS,
  FUNIL_PADRAO,
  funilDoBot,
  ehEtapa,
  etapaCompativel,
  etapaDoCard,
  etiquetasAoMover,
} from '../../src/lib/isa/funil.regras.ts'
import { etiquetasDoBot } from '../../src/lib/isa/etiquetas.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const base = { etapa: null, escolheuPlano: false, mandouDocumento: false }

test('na Isa o funil e o de sempre', () => {
  assert.deepEqual(funilDoBot(IDENTIDADE_ISA), FUNIL_PADRAO)
  assert.equal(FUNIL_PADRAO.etapas, ETAPAS)
  assert.equal(FUNIL_PADRAO.humanoId, 'leticya')
})

test('Mariana: colunas = etiquetas dela, com Gabriel e sem Guilherme', () => {
  const f = funilDoBot(MARIANA)
  assert.deepEqual(
    f.etapas.map((e) => e.id),
    ['simulou', 'urgente', 'quente', 'gabriel', 'pensando', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'],
  )
  const tags = etiquetasDoBot(MARIANA)
  assert.deepEqual(f.etapas.map((e) => e.id).filter((id) => id !== 'simulou'), tags.map((t) => t.id))
  for (const e of f.etapas) {
    if (e.id === 'simulou') continue
    assert.equal(e.rotulo, tags.find((t) => t.id === e.id)?.nome, e.id)
  }
  assert.equal(ehEtapa('gabriel', f), true)
  assert.equal(ehEtapa('leticya', f), false)
  assert.equal(ehEtapa('guilherme', f), false)
})

test('Mariana: quem escolheu plano vai pro Gabriel, como na Isa vai pra Leticya', () => {
  const f = funilDoBot(MARIANA)
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true }, f), 'gabriel')
  assert.equal(etapaDoCard({ ...base, escolheuPlano: true, mandouDocumento: true }, f), 'documento')
  assert.equal(etapaCompativel('escolheu', f), 'gabriel')
  assert.equal(etapaCompativel('leticya', f), null)
  assert.equal(etapaCompativel('perdido', f), 'frio')
  assert.deepEqual(etiquetasAoMover(['gabriel'], 'fechou', f), ['gabriel', 'fechou'])
  assert.deepEqual(etiquetasAoMover(['gabriel', 'documento', 'fechou'], 'documento', f), ['gabriel', 'documento'])
  assert.equal(etapaDoCard({ ...base, etiquetas: ['gabriel', 'documento'] }, f), 'documento')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/isa/etiquetas-mariana.test.ts testes/isa/funil-mariana.test.ts`
Expected: FAIL com `SyntaxError: The requested module ... does not provide an export named 'etiquetasDoBot'` (e `FUNIL_PADRAO` no funil).

- [ ] **Step 3: Implementar em `etiquetas.regras.ts`**

Adicionar no topo, logo depois do bloco de comentário inicial (antes de `export interface Etiqueta`):

```ts
import type { IdentidadeBot } from './identidade.regras'
```

Substituir a linha 44 (o `IDS` deixa de ser usado; no lugar dele entra `etiquetasDoBot`):

```ts
const IDS = new Set(ETIQUETAS.map((e) => e.id))
```

por:

```ts
/**
 * A lista de um bot: a da Isa, com "Falando com <humano>" no lugar de "Falando com Leticya" (mesma
 * posicao e cor) e sem as etiquetas que ele nao usa. Mariana (dono, 01/10/2026): Gabriel no lugar
 * da Leticya e sem Guilherme. Na Isa devolve a lista de sempre.
 */
export function etiquetasDoBot(bot: { humano: Pick<IdentidadeBot['humano'], 'id' | 'nome'>; semEtiquetas: readonly string[] }): Etiqueta[] {
  return ETIQUETAS.filter((e) => !bot.semEtiquetas.includes(e.id)).map((e) =>
    e.id === 'leticya' ? { ...e, id: bot.humano.id, nome: `Falando com ${bot.humano.nome}` } : e,
  )
}
```

Substituir, mais abaixo:

```ts
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const pedidas = new Set(lista.filter((x): x is string => typeof x === 'string' && IDS.has(x)))
  return ETIQUETAS.map((e) => e.id).filter((id) => pedidas.has(id))
}
```

por:

```ts
export function normalizarEtiquetas(lista: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  if (!Array.isArray(lista)) return []
  const ids = new Set(etiquetas.map((e) => e.id))
  const pedidas = new Set(lista.filter((x): x is string => typeof x === 'string' && ids.has(x)))
  return etiquetas.map((e) => e.id).filter((id) => pedidas.has(id))
}
```

Substituir:

```ts
export const ETIQUETAS_FORA_DA_FILA: readonly string[] = ETIQUETAS.map((e) => e.id).filter((id) => id !== 'quente' && id !== 'urgente')

export function etiquetaValida(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}
```

por:

```ts
export function etiquetasForaDaFila(etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  return etiquetas.map((e) => e.id).filter((id) => id !== 'quente' && id !== 'urgente')
}

export const ETIQUETAS_FORA_DA_FILA: readonly string[] = etiquetasForaDaFila()

export function etiquetaValida(id: string | null | undefined, etiquetas: readonly Etiqueta[] = ETIQUETAS): boolean {
  return !!id && etiquetas.some((e) => e.id === id)
}
```

Substituir:

```ts
export function etiquetasParaGravar(pedidas: unknown, gravadas: unknown): string[] {
  const escolhidas = normalizarEtiquetas(pedidas)
```

por:

```ts
export function etiquetasParaGravar(pedidas: unknown, gravadas: unknown, etiquetas: readonly Etiqueta[] = ETIQUETAS): string[] {
  const escolhidas = normalizarEtiquetas(pedidas, etiquetas)
```

- [ ] **Step 4: Implementar em `funil.regras.ts`**

Adicionar no topo, depois do comentário inicial (antes de `export interface Etapa`):

```ts
import type { IdentidadeBot } from './identidade.regras'
```

Substituir:

```ts
const IDS = new Set(ETAPAS.map((e) => e.id))

export function ehEtapa(id: string | null | undefined): boolean {
  return !!id && IDS.has(id)
}
```

por:

```ts
/** As colunas de um bot e a coluna de quem escolheu plano (a do humano dele). */
export interface FunilDoBot {
  etapas: readonly Etapa[]
  humanoId: string
}

export const FUNIL_PADRAO: FunilDoBot = { etapas: ETAPAS, humanoId: 'leticya' }

/** Mesma troca de etiquetasDoBot: Gabriel no lugar da Leticya, sem as etiquetas que o bot nao usa. */
export function funilDoBot(bot: { humano: Pick<IdentidadeBot['humano'], 'id' | 'nome'>; semEtiquetas: readonly string[] }): FunilDoBot {
  return {
    etapas: ETAPAS.filter((e) => !bot.semEtiquetas.includes(e.id)).map((e) =>
      e.id === 'leticya' ? { ...e, id: bot.humano.id, rotulo: `Falando com ${bot.humano.nome}` } : e,
    ),
    humanoId: bot.humano.id,
  }
}

export function ehEtapa(id: string | null | undefined, f: FunilDoBot = FUNIL_PADRAO): boolean {
  return !!id && f.etapas.some((e) => e.id === id)
}
```

Substituir:

```ts
const EQUIVALENTE: Record<string, string> = {
  novo: 'simulou',
  escolheu: 'leticya',
  documentos: 'documento',
  fechado: 'fechou',
  perdido: 'frio',
}

/** A coluna atual de uma etapa gravada, ou null se for lixo/vazia (cai na automatica). */
export function etapaCompativel(id: string | null | undefined): string | null {
  if (!id) return null
  const atual = EQUIVALENTE[id] ?? id
  return IDS.has(atual) ? atual : null
}
```

por:

```ts
const EQUIVALENTE: Record<string, string> = {
  novo: 'simulou',
  // escolheu: a coluna do humano do bot (etapaCompativel)
  documentos: 'documento',
  fechado: 'fechou',
  perdido: 'frio',
}

/** A coluna atual de uma etapa gravada, ou null se for lixo/vazia (cai na automatica). */
export function etapaCompativel(id: string | null | undefined, f: FunilDoBot = FUNIL_PADRAO): string | null {
  if (!id) return null
  const atual = id === 'escolheu' ? f.humanoId : (EQUIVALENTE[id] ?? id)
  return ehEtapa(atual, f) ? atual : null
}
```

Substituir:

```ts
function etapaDasEtiquetas(etiquetas: readonly string[] | null | undefined): string | null {
  const ordem = ETAPAS.map((e) => e.id)
```

por:

```ts
function etapaDasEtiquetas(etiquetas: readonly string[] | null | undefined, f: FunilDoBot): string | null {
  const ordem = f.etapas.map((e) => e.id)
```

Substituir:

```ts
export function etiquetasAoMover(atuais: readonly string[] | null | undefined, destino: string): string[] {
  const ordem = ETAPAS.map((e) => e.id)
```

por:

```ts
export function etiquetasAoMover(atuais: readonly string[] | null | undefined, destino: string, f: FunilDoBot = FUNIL_PADRAO): string[] {
  const ordem = f.etapas.map((e) => e.id)
```

Substituir o corpo de `etapaDoCard`:

```ts
export function etapaDoCard(c: {
  etapa: string | null
  escolheuPlano: boolean
  mandouDocumento: boolean
  etiquetas?: readonly string[] | null
}): string {
  // Etiqueta manda: pos a tag, o card esta naquela coluna (e mover o card acerta as tags).
  const pelaTag = etapaDasEtiquetas(c.etiquetas)
  if (pelaTag) return pelaTag
  const arrastada = etapaCompativel(c.etapa)
  if (arrastada) return arrastada
  if (c.mandouDocumento) return 'documento'
  if (c.escolheuPlano) return 'leticya'
```

por:

```ts
export function etapaDoCard(
  c: {
    etapa: string | null
    escolheuPlano: boolean
    mandouDocumento: boolean
    etiquetas?: readonly string[] | null
  },
  f: FunilDoBot = FUNIL_PADRAO,
): string {
  // Etiqueta manda: pos a tag, o card esta naquela coluna (e mover o card acerta as tags).
  const pelaTag = etapaDasEtiquetas(c.etiquetas, f)
  if (pelaTag) return pelaTag
  const arrastada = etapaCompativel(c.etapa, f)
  if (arrastada) return arrastada
  if (c.mandouDocumento) return 'documento'
  if (c.escolheuPlano) return f.humanoId
```

- [ ] **Step 5: Exportar a lista e o funil do bot no servidor**

Em `src/lib/isa/identidade.ts`, substituir a linha de import por:

```ts
import { identidadeDoAmbiente, tabelasDoBot, type IdentidadeBot, type TabelasDoBot } from '@/lib/isa/identidade.regras'
import { etiquetasDoBot, type Etiqueta } from '@/lib/isa/etiquetas.regras'
import { funilDoBot, type FunilDoBot } from '@/lib/isa/funil.regras'
```

e acrescentar no fim do arquivo:

```ts
/** Etiquetas e colunas do funil deste bot (Mariana: Gabriel no lugar da Leticya, sem Guilherme). */
export const ETIQUETAS_DO_BOT: readonly Etiqueta[] = etiquetasDoBot(IDENTIDADE)
export const FUNIL_DO_BOT: FunilDoBot = funilDoBot(IDENTIDADE)
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `node --test testes/isa/etiquetas-mariana.test.ts testes/isa/funil-mariana.test.ts testes/isa/etiquetas.test.ts testes/isa/funil.test.ts`
Expected: PASS (os antigos sem mudança).

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 7: Commit**

```bash
git add src/lib/isa/etiquetas.regras.ts src/lib/isa/funil.regras.ts src/lib/isa/identidade.ts testes/isa/etiquetas-mariana.test.ts testes/isa/funil-mariana.test.ts
git commit -m "feat(mariana): etiquetas e funil seguem a identidade (Gabriel no lugar da Leticya)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Textos de transferência, documentos e recrutamento pelo humano do bot

**Files:**
- Modify: `src/lib/isa/dono.regras.ts:12-116`
- Modify: `src/lib/isa/entrega.regras.ts:9,177-184`
- Modify: `src/lib/consultor-recrutamento.regras.ts:62-71`
- Test: `testes/isa/dono-mariana.test.ts`, `testes/isa/entrega-mariana.test.ts`, `testes/consultor/recrutamento-mariana.test.ts`

**Interfaces:**
- Consumes: `HumanoDoBot`, `IDENTIDADE_ISA`, `indicacaoDoBot` (Task 1); `MARIANA`.
- Produces:
  - `mensagemTransferencia(p: { motivo: string; resumo?: string }, h: Pick<HumanoDoBot, 'nome' | 'genero' | 'telefoneBonito'> = <Leticya>): string`
  - `mensagemRobo(p: { genero: 'm' | 'f' | null; resumo?: string }, h: Pick<HumanoDoBot, 'nome' | 'genero' | 'telefoneBonito'> = <Leticya>): string`
  - `mensagemPedidoDocumentos(comemorar = true, faltam: string[] = [...], h: Pick<HumanoDoBot, 'nome' | 'genero'> = <Leticya>): string`
  - `mensagemBoasVindas(saudacao: Cumprimento, nome: string | null = null, indicacao: string = 'da consultora Leticya Thayene'): string`

- [ ] **Step 1: Escrever os testes que falham**

Create `testes/isa/dono-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemTransferencia, mensagemRobo } from '../../src/lib/isa/dono.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const MOTIVOS = ['avaria', 'documento', 'associado', 'sem_preco', 'byd', 'manual']

test('sem humano, o texto e o da Isa de hoje (Leticya, 4824)', () => {
  for (const motivo of MOTIVOS) {
    assert.equal(mensagemTransferencia({ motivo }, IDENTIDADE_ISA.humano), mensagemTransferencia({ motivo }), motivo)
  }
  for (const genero of ['m', 'f', null] as const) {
    assert.equal(mensagemRobo({ genero }, IDENTIDADE_ISA.humano), mensagemRobo({ genero }))
  }
})

test('Mariana: transferencia pro Gabriel, no numero dele, no masculino', () => {
  const doc = mensagemTransferencia({ motivo: 'documento' }, MARIANA.humano)
  assert.match(doc, /^vou te passar pro Gabriel, que vai finalizar com você 🙏🏼/)
  assert.match(doc, /é só chamar ele nesse número 👇\n\+55 21 99095-4964$/)
  assert.match(mensagemTransferencia({ motivo: 'avaria' }, MARIANA.humano), /^vou passar as fotos pro Gabriel avaliar e ele já te responde/)
  assert.match(mensagemTransferencia({ motivo: 'sem_preco' }, MARIANA.humano), /^vou pedir pro Gabriel fazer a cotação/)
  assert.match(
    mensagemTransferencia({ motivo: 'byd' }, MARIANA.humano),
    /^quem cuida da proteção do seu BYD é o Gabriel, ele vai te atender pessoalmente/,
  )
  for (const motivo of MOTIVOS) {
    const m = mensagemTransferencia({ motivo }, MARIANA.humano)
    assert.doesNotMatch(m, /Leticya|4824|\bela\b|pra Gabriel|wa\.me|https/, motivo)
  }
})

test('Mariana: "voce e robo?" oferece o Gabriel', () => {
  const m = mensagemRobo({ genero: null }, MARIANA.humano)
  assert.match(m, /^sou uma atendente virtual inteligente/)
  assert.match(m, /falar direto com o Gabriel, é só chamar nesse número 👇\n\+55 21 99095-4964$/)
  assert.doesNotMatch(m, /Leticya|4824/)
})
```

Create `testes/isa/entrega-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemPedidoDocumentos } from '../../src/lib/isa/entrega.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

test('sem humano, o pedido de documentos e o da Isa de hoje', () => {
  for (const comemorar of [true, false]) {
    for (const faltam of [[], ['a foto da CNH'], ['a foto da CNH', 'um comprovante de residência']]) {
      assert.equal(mensagemPedidoDocumentos(comemorar, faltam, IDENTIDADE_ISA.humano), mensagemPedidoDocumentos(comemorar, faltam))
    }
  }
})

test('Mariana: com tudo em maos, passa pro Gabriel finalizar', () => {
  assert.equal(
    mensagemPedidoDocumentos(false, [], MARIANA.humano),
    'já tenho seus documentos aqui, então vou te passar pro Gabriel finalizar a sua ativação',
  )
  assert.doesNotMatch(mensagemPedidoDocumentos(true, [], MARIANA.humano), /Leticya|4824/)
  // pedido de documento nao depende de quem atende
  assert.equal(mensagemPedidoDocumentos(false, ['a foto da CNH'], MARIANA.humano), mensagemPedidoDocumentos(false, ['a foto da CNH']))
})
```

Create `testes/consultor/recrutamento-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemBoasVindas, LINK_GRUPO } from '../../src/lib/consultor-recrutamento.regras.ts'
import { IDENTIDADE_ISA, indicacaoDoBot } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

test('sem indicacao, as boas-vindas sao as da Isa de hoje', () => {
  assert.equal(mensagemBoasVindas('boa tarde', 'Ana', indicacaoDoBot(IDENTIDADE_ISA)), mensagemBoasVindas('boa tarde', 'Ana'))
})

test('Mariana: mesmo treinamento e grupo, indicacao do Gabriel', () => {
  const m = mensagemBoasVindas('boa tarde', 'Ana', indicacaoDoBot(MARIANA))
  assert.match(m, /^Boa tarde, Ana! 👋/)
  assert.match(m, /terças e quartas às 20h/)
  assert.ok(m.includes(LINK_GRUPO))
  assert.match(m, /Ao entrar, informe que sua indicação é do consultor Gabriel Juliano\.$/)
  assert.doesNotMatch(m, /Leticya/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/isa/dono-mariana.test.ts testes/isa/entrega-mariana.test.ts testes/consultor/recrutamento-mariana.test.ts`
Expected: FAIL nos testes "Mariana" (o texto ainda sai com Leticya / 4824 / "da consultora Leticya Thayene").

- [ ] **Step 3: Implementar em `dono.regras.ts`**

Logo depois do bloco de comentário do topo (antes de `const brl`), acrescentar:

```ts
import type { HumanoDoBot } from './identidade.regras'
```

Logo depois da linha `const NUMERO_4824_BONITO = '+55 21 96945-4824'`, acrescentar:

```ts

// Quem recebe a transferencia. Padrao = Leticya no 4824 (Isa); a Mariana passa o Gabriel.
type HumanoDaTransferencia = Pick<HumanoDoBot, 'nome' | 'genero' | 'telefoneBonito'>
const HUMANO_PADRAO: HumanoDaTransferencia = { nome: 'Leticya', genero: 'f', telefoneBonito: NUMERO_4824_BONITO }
```

Substituir o bloco inteiro de `const TEXTO_TRANSFERENCIA` até o fim de `mensagemRobo` (linhas 91-116):

```ts
const TEXTO_TRANSFERENCIA: Record<string, string> = {
  avaria: 'vou passar as fotos pra Leticya avaliar e ela já te responde 🙏🏼',
  documento: 'vou te passar pra Leticya, que vai finalizar com você 🙏🏼',
  associado: 'vou te passar pra Leticya, que cuida disso pra você 🙏🏼',
  sem_preco: 'vou pedir pra Leticya fazer a cotação do seu veículo com cuidado 🙏🏼',
  byd: 'quem cuida da proteção do seu BYD é a Leticya, ela vai te atender pessoalmente 🙏🏼',
}

/** O cliente toca no numero e ELE escreve pro 4824 — o 4824 nunca manda a primeira mensagem. */
export function mensagemTransferencia(p: { motivo: string; resumo?: string }): string {
  const frase = TEXTO_TRANSFERENCIA[p.motivo] ?? TEXTO_TRANSFERENCIA.documento
  return `${frase}\n\né só chamar ela nesse número 👇\n${NUMERO_4824_BONITO}`
}

/**
 * "Voce e robo?" — texto do dono (11/09/2026). Antes a Isa ficava calada e o cliente achava que a
 * conversa tinha morrido; agora ela diz o que e, oferece a Leticya (o mesmo link do 4824 da
 * transferencia) e segue atendendo.
 */
export function mensagemRobo(p: { genero: 'm' | 'f' | null; resumo?: string }): string {
  const protegido = p.genero === 'f' ? 'protegida' : 'protegido'
  return (
    `sou uma atendente virtual inteligente 😊 tô aqui pra te ajudar com mais velocidade, pra você ficar ${protegido} o mais rápido possível\n\n` +
    `mas se você quiser falar direto com a Leticya, é só chamar nesse número 👇\n${NUMERO_4824_BONITO}`
  )
}
```

por:

```ts
function textoTransferencia(motivo: string, h: HumanoDaTransferencia): string {
  // "pra Leticya ... ela" / "pro Gabriel ... ele"
  const o = h.genero === 'f' ? 'a' : 'o'
  const ela = h.genero === 'f' ? 'ela' : 'ele'
  const textos: Record<string, string> = {
    avaria: `vou passar as fotos pr${o} ${h.nome} avaliar e ${ela} já te responde 🙏🏼`,
    documento: `vou te passar pr${o} ${h.nome}, que vai finalizar com você 🙏🏼`,
    associado: `vou te passar pr${o} ${h.nome}, que cuida disso pra você 🙏🏼`,
    sem_preco: `vou pedir pr${o} ${h.nome} fazer a cotação do seu veículo com cuidado 🙏🏼`,
    byd: `quem cuida da proteção do seu BYD é ${o} ${h.nome}, ${ela} vai te atender pessoalmente 🙏🏼`,
  }
  return textos[motivo] ?? textos.documento
}

/** O cliente toca no numero e ELE escreve pro 4824 — o 4824 nunca manda a primeira mensagem. */
export function mensagemTransferencia(p: { motivo: string; resumo?: string }, h: HumanoDaTransferencia = HUMANO_PADRAO): string {
  return `${textoTransferencia(p.motivo, h)}\n\né só chamar ${h.genero === 'f' ? 'ela' : 'ele'} nesse número 👇\n${h.telefoneBonito}`
}

/**
 * "Voce e robo?" — texto do dono (11/09/2026). Antes a Isa ficava calada e o cliente achava que a
 * conversa tinha morrido; agora ela diz o que e, oferece a Leticya (o mesmo link do 4824 da
 * transferencia) e segue atendendo.
 */
export function mensagemRobo(p: { genero: 'm' | 'f' | null; resumo?: string }, h: HumanoDaTransferencia = HUMANO_PADRAO): string {
  const protegido = p.genero === 'f' ? 'protegida' : 'protegido'
  return (
    `sou uma atendente virtual inteligente 😊 tô aqui pra te ajudar com mais velocidade, pra você ficar ${protegido} o mais rápido possível\n\n` +
    `mas se você quiser falar direto com ${h.genero === 'f' ? 'a' : 'o'} ${h.nome}, é só chamar nesse número 👇\n${h.telefoneBonito}`
  )
}
```

- [ ] **Step 4: Implementar em `entrega.regras.ts`**

Substituir a linha 9:

```ts
import type { Fatos } from './fatos.regras'
```

por:

```ts
import type { Fatos } from './fatos.regras'
import type { HumanoDoBot } from './identidade.regras'
```

Substituir:

```ts
export function mensagemPedidoDocumentos(comemorar = true, faltam: string[] = ['a foto da CNH', 'o documento do veículo', 'um comprovante de residência']): string {
```

por:

```ts
export function mensagemPedidoDocumentos(
  comemorar = true,
  faltam: string[] = ['a foto da CNH', 'o documento do veículo', 'um comprovante de residência'],
  // quem finaliza: Leticya na Isa, Gabriel na Mariana
  h: Pick<HumanoDoBot, 'nome' | 'genero'> = { nome: 'Leticya', genero: 'f' },
): string {
```

Substituir:

```ts
    : 'já tenho seus documentos aqui, então vou te passar pra Leticya finalizar a sua ativação'
```

por:

```ts
    : `já tenho seus documentos aqui, então vou te passar pr${h.genero === 'f' ? 'a' : 'o'} ${h.nome} finalizar a sua ativação`
```

- [ ] **Step 5: Implementar em `consultor-recrutamento.regras.ts`**

Substituir:

```ts
export function mensagemBoasVindas(saudacao: Cumprimento, nome: string | null = null): string {
```

por:

```ts
/** `indicacao`: "da consultora Leticya Thayene" na Isa, "do consultor Gabriel Juliano" na Mariana. */
export function mensagemBoasVindas(saudacao: Cumprimento, nome: string | null = null, indicacao = 'da consultora Leticya Thayene'): string {
```

Substituir:

```ts
    'Ao entrar, informe que sua indicação é da consultora Leticya Thayene.'
```

por:

```ts
    `Ao entrar, informe que sua indicação é ${indicacao}.`
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `node --test testes/isa/dono-mariana.test.ts testes/isa/entrega-mariana.test.ts testes/consultor/recrutamento-mariana.test.ts testes/isa/dono.test.ts testes/isa/entrega.test.ts testes/consultor/recrutamento.test.ts`
Expected: PASS.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 7: Commit**

```bash
git add src/lib/isa/dono.regras.ts src/lib/isa/entrega.regras.ts src/lib/consultor-recrutamento.regras.ts testes/isa/dono-mariana.test.ts testes/isa/entrega-mariana.test.ts testes/consultor/recrutamento-mariana.test.ts
git commit -m "feat(mariana): transferencia, documentos e recrutamento falam do humano do bot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prompt, resposta pronta, validador e cumprimento pela identidade

**Files:**
- Modify: `src/lib/isa/prompt.regras.ts:12-47,134-137,237,260,345,421-424,438,463,536,548,552,557`
- Modify: `src/lib/isa/validador.regras.ts:52-88`
- Modify: `src/lib/isa/venda.regras.ts:211-218`
- Test: `testes/isa/prompt-mariana.test.ts`, `testes/isa/validador-mariana.test.ts`, `testes/isa/venda-mariana.test.ts`

**Interfaces:**
- Consumes: `HumanoDoBot`, `IDENTIDADE_ISA`, `nomesDoCumprimento` (Task 1); `MARIANA`.
- Produces (prompt.regras.ts):
  - `interface BotDoPrompt { nome: string; humano: Pick<HumanoDoBot, 'nome' | 'genero' | 'telefoneCurto'> }` (`IdentidadeBot` é atribuível)
  - `type RespostasProntas = { [K in keyof typeof RESPOSTAS_PRONTAS]: string }`, `respostasProntas(b: BotDoPrompt): RespostasProntas`
  - `comporResposta(pronta, resposta, abertura = null, prontas: RespostasProntas = RESPOSTAS_PRONTAS): string`
  - `gabaritoDe(h: Pick<HumanoDoBot, 'nome' | 'genero'>): string` (`GABARITO_21GO` continua exportado, = `gabaritoDe(Leticya)`)
  - `montarPrompt(e: EntradaPrompt, b: BotDoPrompt = <Isa>): string`
- Produces (validador.regras.ts): `numerosOficiais(telefoneDoHumano: string): readonly string[]`; `extrairTelefones(texto, oficiais = NUMEROS_OFICIAIS)`; `validarNumeros(texto, permitidos, oficiais = NUMEROS_OFICIAIS)`.
- Produces (venda.regras.ts): `ehSoCumprimento(texto: string | null | undefined, nomes?: readonly string[]): boolean`.

- [ ] **Step 1: Escrever os testes que falham**

Create `testes/isa/prompt-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarPrompt,
  comporResposta,
  respostasProntas,
  RESPOSTAS_PRONTAS,
  gabaritoDe,
  GABARITO_21GO,
} from '../../src/lib/isa/prompt.regras.ts'
import { validarNumeros, numerosOficiais } from '../../src/lib/isa/validador.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const entrada = { cumprimento: 'bom dia', primeiroNome: null, genero: null, fatos: null, jaGanhouDesconto: false }
const tudo = { ...entrada, docs: { recebidos: ['CNH', 'documento do veículo', 'comprovante de residência'], faltam: [] } }

test('sem bot, o prompt, o gabarito e as prontas sao os da Isa de hoje', () => {
  assert.equal(montarPrompt(entrada, IDENTIDADE_ISA), montarPrompt(entrada))
  assert.equal(montarPrompt(tudo, IDENTIDADE_ISA), montarPrompt(tudo))
  assert.equal(gabaritoDe(IDENTIDADE_ISA.humano), GABARITO_21GO)
  assert.deepEqual(respostasProntas(IDENTIDADE_ISA), { ...RESPOSTAS_PRONTAS })
  assert.match(RESPOSTAS_PRONTAS.ligacao, /da minha supervisora: leticya, 21 96945-4824/)
})

test('Mariana: o prompt e dela, do time do Gabriel, sem Leticya', () => {
  const p = montarPrompt(tudo, MARIANA)
  assert.match(p, /^você é a Mariana, do time do Gabriel, na 21Go Proteção Patrimonial Veicular/)
  assert.match(p, /é assim que o Gabriel atende/)
  assert.match(p, /o Gabriel responde e já puxa o próximo passo/)
  assert.match(p, /se não falta nenhum, diga que já tem tudo e que vai passar pro Gabriel finalizar/)
  assert.match(p, /quando ele escolher o plano, diga que já tem tudo e que vai passar pro Gabriel finalizar/)
  assert.match(p, /o contato do Gabriel\)/)
  assert.match(p, /quando ele mandar, o Gabriel avalia/)
  assert.match(p, /"avaria" — o Gabriel avalia e, em muitos casos/)
  assert.doesNotMatch(p, /Leticya|leticya|\bIsa\b|4824/)
})

test('Mariana: "posso te ligar?" passa o Gabriel, e o numero dele passa no validador', () => {
  const r = comporResposta('ligacao', '', null, respostasProntas(MARIANA))
  assert.match(r, /mas vou te passar o contato do meu supervisor: gabriel, 21 99095-4964/)
  assert.match(r, /é só falar que estava falando comigo, a mariana, e que eu te passei o contato$/)
  assert.doesNotMatch(r, /leticya|4824|\bisa\b/i)
  const sem = { dinheiro: [], pct: [] }
  assert.equal(validarNumeros(r, sem, numerosOficiais(MARIANA.humano.telefone)).ok, true)
  // sem a lista do bot, o numero do Gabriel seria barrado como telefone inventado
  assert.equal(validarNumeros(r, sem).ok, false)
})
```

Create `testes/isa/validador-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NUMEROS_OFICIAIS, numerosOficiais, extrairTelefones, validarNumeros } from '../../src/lib/isa/validador.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const sem = { dinheiro: [], pct: [] }

test('na Isa a lista de numeros oficiais e a de sempre', () => {
  assert.deepEqual(numerosOficiais(IDENTIDADE_ISA.humano.telefone), NUMEROS_OFICIAIS)
})

test('Mariana: o Gabriel passa, a Leticya nao; sede, 0800 e CNPJ continuam', () => {
  const oficiais = numerosOficiais(MARIANA.humano.telefone)
  assert.ok(oficiais.includes('21990954964'))
  assert.ok(!oficiais.includes('21969454824'))
  for (const n of ['08002345555', '08009418589', '21965700021', '40902817000170']) assert.ok(oficiais.includes(n), n)
  assert.equal(validarNumeros('chama o gabriel: 21 99095-4964', sem, oficiais).ok, true)
  assert.equal(validarNumeros('chama a leticya: 21 96945-4824', sem, oficiais).ok, false)
  assert.deepEqual(extrairTelefones('21 96945-4824', oficiais), ['21 96945-4824'])
})
```

Create `testes/isa/venda-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehSoCumprimento } from '../../src/lib/isa/venda.regras.ts'
import { IDENTIDADE_ISA, nomesDoCumprimento } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const AMOSTRA = ['oi', 'oi isa', 'Oi Isa!', 'leticya?', 'boa tarde, isa', 'oi mariana', 'gabriel', 'tudo bem? cobre roubo?', 'Tudo bem', 'oi 21go', 'entendi, Leticya']

test('na Isa, "oi isa" e "leticya?" continuam sendo so cumprimento', () => {
  const nomes = nomesDoCumprimento(IDENTIDADE_ISA)
  for (const t of AMOSTRA) assert.equal(ehSoCumprimento(t, nomes), ehSoCumprimento(t), t)
  assert.equal(ehSoCumprimento('oi isa'), true)
  assert.equal(ehSoCumprimento('oi mariana'), false)
})

test('Mariana: "oi mariana" e "gabriel" sao so cumprimento; "oi isa" nao e nome dela', () => {
  const nomes = nomesDoCumprimento(MARIANA)
  assert.equal(ehSoCumprimento('oi mariana', nomes), true)
  assert.equal(ehSoCumprimento('Oi Mariana, bom dia!', nomes), true)
  assert.equal(ehSoCumprimento('gabriel', nomes), true)
  assert.equal(ehSoCumprimento('oi isa', nomes), false)
  assert.equal(ehSoCumprimento('oi mariana, quanto fica?', nomes), false)
  assert.equal(ehSoCumprimento('Tudo bem', nomes), false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/isa/prompt-mariana.test.ts testes/isa/validador-mariana.test.ts testes/isa/venda-mariana.test.ts`
Expected: FAIL com `does not provide an export named 'respostasProntas'` / `'numerosOficiais'`, e o venda falhando em "oi mariana".

- [ ] **Step 3: Implementar em `prompt.regras.ts`**

Substituir a linha 12:

```ts
import type { Fatos } from './fatos.regras'
```

por:

```ts
import type { Fatos } from './fatos.regras'
import type { HumanoDoBot } from './identidade.regras'

/** Quem o prompt apresenta: o bot e o humano dele. Padrao = Isa, do time da Leticya. */
export interface BotDoPrompt {
  nome: string
  humano: Pick<HumanoDoBot, 'nome' | 'genero' | 'telefoneCurto'>
}

const BOT_PADRAO: BotDoPrompt = { nome: 'Isa', humano: { nome: 'Leticya', genero: 'f', telefoneCurto: '21 96945-4824' } }

/**
 * Dono, 25/09/2026: "posso te ligar?". O numero do supervisor sai daqui, nao da IA — ela e
 * proibida de escrever telefone. Na Isa e a Leticya; na Mariana, o Gabriel.
 */
function textoLigacao(b: BotDoPrompt): string {
  const f = b.humano.genero === 'f'
  return (
    'esse contato aqui é um whatsapp profissional do meta, pra segurança dos nossos associados, ' +
    'então por aqui a gente fala só por mensagem 🙏🏼\n\n' +
    `mas vou te passar o contato ${f ? 'da minha supervisora' : 'do meu supervisor'}: ${b.humano.nome.toLowerCase()}, ${b.humano.telefoneCurto}\n\n` +
    `é só falar que estava falando comigo, a ${b.nome.toLowerCase()}, e que eu te passei o contato`
  )
}
```

Substituir (dentro de `RESPOSTAS_PRONTAS`, linhas 41-47):

```ts
  // Dono, 25/09/2026: "posso te ligar?". O numero da supervisora sai daqui, nao da IA — ela e
  // proibida de escrever telefone.
  ligacao:
    'esse contato aqui é um whatsapp profissional do meta, pra segurança dos nossos associados, ' +
    'então por aqui a gente fala só por mensagem 🙏🏼\n\n' +
    'mas vou te passar o contato da minha supervisora: leticya, 21 96945-4824\n\n' +
    'é só falar que estava falando comigo, a isa, e que eu te passei o contato',
```

por:

```ts
  // Dono, 25/09/2026: "posso te ligar?" (texto em textoLigacao; na Mariana, respostasProntas).
  ligacao: textoLigacao(BOT_PADRAO),
```

Logo depois do fechamento de `CHAVES_PRONTAS` (a linha `}` depois de `seguradora: 'seguradora',`), acrescentar:

```ts

export type RespostasProntas = { [K in keyof typeof RESPOSTAS_PRONTAS]: string }

/** As respostas prontas do bot: iguais as da Isa, so o "posso te ligar?" muda de supervisor. */
export function respostasProntas(b: BotDoPrompt): RespostasProntas {
  return { ...RESPOSTAS_PRONTAS, ligacao: textoLigacao(b) }
}
```

Substituir:

```ts
export function comporResposta(pronta: string | null, resposta: string, abertura: string | null = null): string {
```

por:

```ts
export function comporResposta(
  pronta: string | null,
  resposta: string,
  abertura: string | null = null,
  prontas: RespostasProntas = RESPOSTAS_PRONTAS,
): string {
```

e a linha:

```ts
  const oficial = chave ? RESPOSTAS_PRONTAS[chave] : ''
```

por:

```ts
  const oficial = chave ? prontas[chave] : ''
```

Substituir a linha 237 (início do gabarito):

```ts
export const GABARITO_21GO = `- atende o Brasil todo: suporte pelo 0800, reboque terceirizado mais próximo, e pode levar numa oficina de confiança com CNPJ e preço justo que a 21Go cobre mediante a cota. se ele não tiver oficina, manda 3 orçamentos
```

por:

```ts
export function gabaritoDe(h: Pick<HumanoDoBot, 'nome' | 'genero'>): string {
  return `- atende o Brasil todo: suporte pelo 0800, reboque terceirizado mais próximo, e pode levar numa oficina de confiança com CNPJ e preço justo que a 21Go cobre mediante a cota. se ele não tiver oficina, manda 3 orçamentos
```

Na linha 260 do gabarito, substituir o trecho:

```
"avaria" — a Leticya avalia e, em muitos casos, faz mediante um termo
```

por:

```
"avaria" — ${h.genero === 'f' ? 'a' : 'o'} ${h.nome} avalia e, em muitos casos, faz mediante um termo
```

Substituir a linha 345 (fim do gabarito):

```ts
- tempo de chegada do guincho: o setor aciona o mais próximo, então não dá pra prometer horário`
```

por:

```ts
- tempo de chegada do guincho: o setor aciona o mais próximo, então não dá pra prometer horário`
}

/** O gabarito da Isa (avaria vai pra Leticya) — o mesmo texto de sempre. */
export const GABARITO_21GO = gabaritoDe({ nome: 'Leticya', genero: 'f' })
```

Substituir a assinatura de `montarPrompt` (linha 421):

```ts
export function montarPrompt(e: EntradaPrompt): string {
```

por:

```ts
export function montarPrompt(e: EntradaPrompt, b: BotDoPrompt = BOT_PADRAO): string {
  const h = b.humano
  // "da Leticya" / "do Gabriel", "pra Leticya" / "pro Gabriel"
  const o = h.genero === 'f' ? 'a' : 'o'
```

Nas linhas seguintes do template de `montarPrompt`, trocar exatamente estes trechos (cada um é único no arquivo):

| de | para |
|---|---|
| `` return `você é a Isa, do time da Leticya, na 21Go `` | `` return `você é a ${b.nome}, do time d${o} ${h.nome}, na 21Go `` |
| `## como você escreve (é assim que a Leticya atende)` | `## como você escreve (é assim que ${o} ${h.nome} atende)` |
| `"estou aqui pra ajudar". a Leticya responde e já puxa o próximo passo` | `"estou aqui pra ajudar". ${o} ${h.nome} responde e já puxa o próximo passo` |
| `se não falta nenhum, diga que já tem tudo e que vai passar pra Leticya finalizar` | `se não falta nenhum, diga que já tem tudo e que vai passar pr${o} ${h.nome} finalizar` |
| `${GABARITO_21GO}` | `${gabaritoDe(h)}` |
| `: 'não falta nenhum documento: quando ele escolher o plano, diga que já tem tudo e que vai passar pra Leticya finalizar'}` | `` : `não falta nenhum documento: quando ele escolher o plano, diga que já tem tudo e que vai passar pr${o} ${h.nome} finalizar`} `` |
| `(o sistema manda o texto oficial e o contato da Leticya)` | `(o sistema manda o texto oficial e o contato d${o} ${h.nome})` |
| `peça as FOTOS do que está amassado — quando ele mandar, a Leticya avalia` | `peça as FOTOS do que está amassado — quando ele mandar, ${o} ${h.nome} avalia` |

Depois das trocas: `grep -n "Leticya" src/lib/isa/prompt.regras.ts` só pode mostrar comentários (linhas 4, 5, 85-87, 233-234), `BOT_PADRAO`, a chamada `gabaritoDe({ nome: 'Leticya', genero: 'f' })` e comentários novos.

- [ ] **Step 4: Implementar em `validador.regras.ts`**

Logo depois do fechamento do array `NUMEROS_OFICIAIS` (`]` na linha 58), acrescentar:

```ts

const TELEFONE_DA_LETICYA = '21969454824'

/**
 * Os numeros oficiais de um bot: os da casa (sede, 0800, CNPJ) e o telefone do humano dele no
 * lugar do da Leticya (Mariana: o Gabriel). Na Isa, a lista de sempre.
 */
export function numerosOficiais(telefoneDoHumano: string): readonly string[] {
  const semPais = telefoneDoHumano.replace(/^55/, '')
  return NUMEROS_OFICIAIS.map((n) => (n === TELEFONE_DA_LETICYA ? semPais : n))
}
```

Substituir:

```ts
export function extrairTelefones(texto: string): string[] {
```

por:

```ts
export function extrairTelefones(texto: string, oficiais: readonly string[] = NUMEROS_OFICIAIS): string[] {
```

e, dentro dela:

```ts
    if (digitos.length >= 8 && !NUMEROS_OFICIAIS.includes(digitos)) out.push(m[0].trim())
```

por:

```ts
    if (digitos.length >= 8 && !oficiais.includes(digitos)) out.push(m[0].trim())
```

Substituir:

```ts
export function validarNumeros(texto: string, permitidos: Permitidos): { ok: boolean; invalidos: string[] } {
```

por:

```ts
export function validarNumeros(
  texto: string,
  permitidos: Permitidos,
  oficiais: readonly string[] = NUMEROS_OFICIAIS,
): { ok: boolean; invalidos: string[] } {
```

e:

```ts
    ...extrairTelefones(texto).map((t) => `telefone ${t}`),
```

por:

```ts
    ...extrairTelefones(texto, oficiais).map((t) => `telefone ${t}`),
```

- [ ] **Step 5: Implementar em `venda.regras.ts`**

Substituir:

```ts
const SO_CUMPRIMENTO =
  /^(?:(?:oi+|oie+|ol[aá]|opa|e a[ií]|eai|hey|hello|bom dia|boa tarde|boa noite|boa|tudo bem|tudo bom|td bem|td bom|tudo certo|beleza|blz|como vai|como (vc|voc[eê]) (ta|est[aá])|por favor|pfv|isa|leticya|21go)[\s,!.?]*)+$/

/** A mensagem e SO um cumprimento ("oi", "bom dia, tudo bem?"): nada de pergunta junto. */
export function ehSoCumprimento(texto: string | null | undefined): boolean {
  const t = norm(texto).replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u200d\ufe0f]/gu, '').trim()
  return !!t && SO_CUMPRIMENTO.test(t) && !concordaSemSaudar(t)
}
```

por:

```ts
const CUMPRIMENTOS =
  'oi+|oie+|ol[aá]|opa|e a[ií]|eai|hey|hello|bom dia|boa tarde|boa noite|boa|tudo bem|tudo bom|td bem|td bom|tudo certo|beleza|blz|como vai|como (vc|voc[eê]) (ta|est[aá])|por favor|pfv'

// Os nomes do bot e do humano tambem sao cumprimento ("oi isa", "leticya?"); na Mariana, os dela.
const soCumprimento = (nomes: readonly string[]) => new RegExp(`^(?:(?:${CUMPRIMENTOS}|${nomes.join('|')}|21go)[\\s,!.?]*)+$`)

const SO_CUMPRIMENTO = soCumprimento(['isa', 'leticya'])

/** A mensagem e SO um cumprimento ("oi", "bom dia, tudo bem?"): nada de pergunta junto. */
export function ehSoCumprimento(texto: string | null | undefined, nomes?: readonly string[]): boolean {
  const t = norm(texto).replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u200d\ufe0f]/gu, '').trim()
  return !!t && (nomes ? soCumprimento(nomes) : SO_CUMPRIMENTO).test(t) && !concordaSemSaudar(t)
}
```

Conferir que a regex padrão ficou idêntica:

Run: `node -e "const s='oi+|oie+|ol[aá]|opa|e a[ií]|eai|hey|hello|bom dia|boa tarde|boa noite|boa|tudo bem|tudo bom|td bem|td bom|tudo certo|beleza|blz|como vai|como (vc|voc[eê]) (ta|est[aá])|por favor|pfv'; const a=new RegExp('^(?:(?:'+s+'|isa|leticya|21go)[\\\\s,!.?]*)+\$').source; const b=/^(?:(?:oi+|oie+|ol[aá]|opa|e a[ií]|eai|hey|hello|bom dia|boa tarde|boa noite|boa|tudo bem|tudo bom|td bem|td bom|tudo certo|beleza|blz|como vai|como (vc|voc[eê]) (ta|est[aá])|por favor|pfv|isa|leticya|21go)[\s,!.?]*)+$/.source; console.log(a===b)"`
Expected: `true` (se o shell atrapalhar o escape, basta confiar no `venda.test.ts` antigo + `venda-mariana.test.ts` do Step 6).

- [ ] **Step 6: Rodar testes e typecheck**

Run: `node --test testes/isa/prompt-mariana.test.ts testes/isa/validador-mariana.test.ts testes/isa/venda-mariana.test.ts testes/isa/prompt.test.ts testes/isa/fatos.test.ts testes/isa/validador.test.ts testes/isa/venda.test.ts testes/isa/entrega.test.ts`
Expected: PASS.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 7: Commit**

```bash
git add src/lib/isa/prompt.regras.ts src/lib/isa/validador.regras.ts src/lib/isa/venda.regras.ts testes/isa/prompt-mariana.test.ts testes/isa/validador-mariana.test.ts testes/isa/venda-mariana.test.ts
git commit -m "feat(mariana): prompt, posso te ligar, validador e cumprimento seguem o bot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: SQL das tabelas por-bot no schema da identidade e instância da identidade

**Files:**
- Modify (script): `src/app/api/atendimento/{etiquetas,nota,reabrir,resolvido,responder,responder-arquivo,responder-audio,transferir}/route.ts`, `src/lib/isa/{abordagem,acoes,alertas,banco,desconto-auto,painel-dados,promocao,relatorio,virada-do-dia,worker}.ts`
- Modify (à mão): `src/lib/consultor-recrutamento.ts:1-52`, `src/app/api/webhooks/whatsapp-bot/route.ts:1-25`, `src/lib/supabase-store.ts:471-474`
- Create (temporário, apagado no fim): `.tmp-schema-do-bot.py`
- Test: `testes/isa/schema-do-bot.test.ts`

**Interfaces:**
- Consumes: `IDENTIDADE`, `TAB` (Task 1).
- Produces: nenhum símbolo novo; depois desta tarefa os arquivos acima importam `IDENTIDADE` e/ou `TAB` de `@/lib/isa/identidade`. Lista exata (as Tasks 6, 7 e 10 contam com ela):
  - `import { IDENTIDADE, TAB } from '@/lib/isa/identidade'`: `reabrir/route.ts`, `responder/route.ts`, `responder-arquivo/route.ts`, `responder-audio/route.ts`, `abordagem.ts`, `acoes.ts`, `banco.ts`, `painel-dados.ts`, `promocao.ts`, `relatorio.ts`, `worker.ts`
  - `import { TAB } from '@/lib/isa/identidade'`: `etiquetas/route.ts`, `nota/route.ts`, `resolvido/route.ts`, `transferir/route.ts`, `alertas.ts`, `desconto-auto.ts`, `virada-do-dia.ts`, `consultor-recrutamento.ts`
  - `import { IDENTIDADE } from '@/lib/isa/identidade'`: `webhooks/whatsapp-bot/route.ts`

> `TAB` e não `T`: `abordagem.ts` tem `lerConfig<T>` e o genérico esconderia o import dentro da função.
> `src/app/api/cron/vigia-byd/route.ts` fica com `public.isa_eventos` de propósito: é rotina só da casa (spec, seção 4) e ganha uma trava na Task 7.

- [ ] **Step 1: Escrever o teste que falha (varredura do código)**

Create `testes/isa/schema-do-bot.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * Nenhum SQL de tabela por-bot com `public.` fixo e nenhuma instancia 'cloud_isa' fixa: tudo vem
 * da identidade (TAB / IDENTIDADE.instancia). Senao a Mariana grava no banco da Isa.
 */

const SRC = path.resolve(import.meta.dirname, '../../src')
// Rotina so da casa (spec da Mariana, secao 4): nao roda no container dela.
const SO_DA_CASA = new Set([path.join('app', 'api', 'cron', 'vigia-byd', 'route.ts')])
// Onde mora o valor padrao da instancia.
const DEFINE_A_INSTANCIA = new Set([path.join('lib', 'isa', 'identidade.regras.ts')])

const arquivos = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f))

test('tabela por-bot so pelo schema da identidade (TAB), nunca public. fixo', () => {
  const fixo = /public\.(isa_contatos|isa_eventos|isa_config|isa_promocoes|consultor_recrutamento)\b|\b(from|into|update)\s+consultor_recrutamento\b/i
  const achados = arquivos().filter((f) => !SO_DA_CASA.has(f) && fixo.test(readFileSync(path.join(SRC, f), 'utf8')))
  assert.deepEqual(achados, [])
})

test("instancia so pela identidade: nenhum 'cloud_isa' fixo", () => {
  const achados = arquivos().filter(
    (f) => !DEFINE_A_INSTANCIA.has(f) && readFileSync(path.join(SRC, f), 'utf8').includes("'cloud_isa'"),
  )
  assert.deepEqual(achados, [])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/isa/schema-do-bot.test.ts`
Expected: FAIL nos dois testes — o primeiro lista os 19 arquivos com tabela fixa (8 rotas de `atendimento`, `consultor-recrutamento.ts` e 10 de `src/lib/isa`), o segundo os 13 com `'cloud_isa'`.

- [ ] **Step 3: Escrever o script de troca mecânica**

Create `.tmp-schema-do-bot.py` (na raiz de `21go-website`, com o Write tool — não por heredoc do bash, que come barras):

```python
"""Troca tabela por-bot e instancia fixas pelo que vem da identidade (Fase 1 da Mariana).

Roda uma vez, de dentro de 21go-website/, e e apagado depois. Le e grava em bytes pra nao
mexer no fim de linha (CRLF no Windows).
"""
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent
TABELAS = {
    'isa_contatos': 'contatos',
    'isa_eventos': 'eventos',
    'isa_config': 'config',
    'isa_promocoes': 'promocoes',
    'consultor_recrutamento': 'recrutamento',
}
ARQUIVOS = [
    'src/app/api/atendimento/etiquetas/route.ts',
    'src/app/api/atendimento/nota/route.ts',
    'src/app/api/atendimento/reabrir/route.ts',
    'src/app/api/atendimento/resolvido/route.ts',
    'src/app/api/atendimento/responder/route.ts',
    'src/app/api/atendimento/responder-arquivo/route.ts',
    'src/app/api/atendimento/responder-audio/route.ts',
    'src/app/api/atendimento/transferir/route.ts',
    'src/lib/isa/abordagem.ts',
    'src/lib/isa/acoes.ts',
    'src/lib/isa/alertas.ts',
    'src/lib/isa/banco.ts',
    'src/lib/isa/desconto-auto.ts',
    'src/lib/isa/painel-dados.ts',
    'src/lib/isa/promocao.ts',
    'src/lib/isa/relatorio.ts',
    'src/lib/isa/virada-do-dia.ts',
    'src/lib/isa/worker.ts',
]

for rel in ARQUIVOS:
    caminho = RAIZ / rel
    texto = caminho.read_bytes().decode('utf-8')
    fim = '\r\n' if '\r\n' in texto else '\n'
    novo = texto
    for tabela, chave in TABELAS.items():
        novo = re.sub(r'public\.' + tabela + r'\b', '${TAB.' + chave + '}', novo)
    novo = novo.replace("evolution_instance: 'cloud_isa'", 'evolution_instance: IDENTIDADE.instancia')
    novo = novo.replace("'cloud_isa'", "'${IDENTIDADE.instancia}'")
    if novo == texto:
        raise SystemExit(f'nada trocado em {rel}')
    nomes = [n for n in ('IDENTIDADE', 'TAB') if (n + '.') in novo]
    linhas = novo.split(fim)
    if rel.endswith('/banco.ts'):
        i = next(k for k, l in enumerate(linhas) if l.startswith("import { Pool } from 'pg'"))
    else:
        i = next(k for k, l in enumerate(linhas) if "from '@/lib/isa/banco'" in l)
    linhas.insert(i + 1, 'import { ' + ', '.join(nomes) + " } from '@/lib/isa/identidade'")
    caminho.write_bytes(fim.join(linhas).encode('utf-8'))
    print(rel, ', '.join(nomes))
```

Todos os `public.isa_*` e `'cloud_isa'` desses arquivos estão dentro de template literal de SQL (crase) ou na forma `evolution_instance: 'cloud_isa'` — conferido em 01/10/2026 com `grep -rn "public\.isa_\|cloud_isa" src`. Referências pelo nome da tabela sem schema (`isa_contatos.conversation_id` no `ON CONFLICT`, `isa_config.valor`, `consultor_recrutamento.nome`) continuam valendo com a tabela em outro schema e **não** são trocadas.

- [ ] **Step 4: Rodar o script e apagá-lo**

Run: `python .tmp-schema-do-bot.py && rm .tmp-schema-do-bot.py`
Expected (uma linha por arquivo, nesta ordem):

```
src/app/api/atendimento/etiquetas/route.ts TAB
src/app/api/atendimento/nota/route.ts TAB
src/app/api/atendimento/reabrir/route.ts IDENTIDADE, TAB
src/app/api/atendimento/resolvido/route.ts TAB
src/app/api/atendimento/responder/route.ts IDENTIDADE, TAB
src/app/api/atendimento/responder-arquivo/route.ts IDENTIDADE, TAB
src/app/api/atendimento/responder-audio/route.ts IDENTIDADE, TAB
src/app/api/atendimento/transferir/route.ts TAB
src/lib/isa/abordagem.ts IDENTIDADE, TAB
src/lib/isa/acoes.ts IDENTIDADE, TAB
src/lib/isa/alertas.ts TAB
src/lib/isa/banco.ts IDENTIDADE, TAB
src/lib/isa/desconto-auto.ts TAB
src/lib/isa/painel-dados.ts IDENTIDADE, TAB
src/lib/isa/promocao.ts IDENTIDADE, TAB
src/lib/isa/relatorio.ts IDENTIDADE, TAB
src/lib/isa/virada-do-dia.ts TAB
src/lib/isa/worker.ts IDENTIDADE, TAB
```

Se a saída divergir, `git checkout -- src` e investigar antes de seguir.

- [ ] **Step 5: `consultor-recrutamento.ts` à mão**

Substituir:

```ts
import { sql } from '@/lib/isa/banco'
```

por:

```ts
import { sql } from '@/lib/isa/banco'
import { TAB } from '@/lib/isa/identidade'
```

Substituir:

```ts
    'select boas_vindas_em, aviso_virtual_em from consultor_recrutamento where telefone = $1',
```

por:

```ts
    `select boas_vindas_em, aviso_virtual_em from ${TAB.recrutamento} where telefone = $1`,
```

Substituir:

```ts
    `insert into consultor_recrutamento (telefone, nome, ${p.coluna})
```

por:

```ts
    `insert into ${TAB.recrutamento} (telefone, nome, ${p.coluna})
```

(`coalesce(consultor_recrutamento.nome, excluded.nome)` fica: é o nome da tabela alvo do `insert`.)

- [ ] **Step 6: Webhook da Cloud API à mão**

Em `src/app/api/webhooks/whatsapp-bot/route.ts`, substituir:

```ts
import { mensagemJaGravada, registrarInbound } from '@/lib/isa/banco'
```

por:

```ts
import { mensagemJaGravada, registrarInbound } from '@/lib/isa/banco'
import { IDENTIDADE } from '@/lib/isa/identidade'
```

e:

```ts
const ORIGEM = 'cloud_isa'
```

por:

```ts
// cloud_isa na Isa, cloud_mariana na Mariana: as duas dividem conversations/messages.
const ORIGEM = IDENTIDADE.instancia
```

- [ ] **Step 7: Portão do aviso pro CRM à mão**

Em `src/lib/supabase-store.ts`, substituir:

```ts
    if (instance === 'cloud_isa') {
      const { avisarCrm } = await import('@/lib/isa/crm')
```

por:

```ts
    // So a mensagem do bot deste container avisa o CRM (Isa: cloud_isa; Mariana: cloud_mariana).
    const { IDENTIDADE } = await import('@/lib/isa/identidade')
    if (instance === IDENTIDADE.instancia) {
      const { avisarCrm } = await import('@/lib/isa/crm')
```

- [ ] **Step 8: Conferir o resultado**

Run: `node --test testes/isa/schema-do-bot.test.ts`
Expected: PASS.

Run: `git diff --stat`
Expected: só os 21 arquivos desta tarefa (18 do script + consultor-recrutamento.ts + webhook + supabase-store.ts).

Run: `git diff src/lib/isa/banco.ts | grep "^[-+]" | grep -v "^+++\|^---" | head -40`
Expected: só trocas de `public.isa_*`/`public.consultor_recrutamento` por `${TAB.*}`, de `'cloud_isa'` por `'${IDENTIDADE.instancia}'` e a linha de import nova.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/atendimento src/app/api/webhooks/whatsapp-bot/route.ts src/lib/isa/abordagem.ts src/lib/isa/acoes.ts src/lib/isa/alertas.ts src/lib/isa/banco.ts src/lib/isa/desconto-auto.ts src/lib/isa/painel-dados.ts src/lib/isa/promocao.ts src/lib/isa/relatorio.ts src/lib/isa/virada-do-dia.ts src/lib/isa/worker.ts src/lib/consultor-recrutamento.ts src/lib/supabase-store.ts testes/isa/schema-do-bot.test.ts
git commit -m "refactor(mariana): tabelas por-bot no schema da identidade e instancia da identidade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Leads e Power pela identidade (orçamento, simulação do cliente, 5 min, relatório)

**Files:**
- Modify: `src/lib/isa/orcamento.ts:11,30,64,82,178,194,316`
- Modify: `src/lib/isa/fatos.ts:1-59`
- Modify: `src/lib/isa/abordagem.ts:7,36-41,96-99,129-130,319,359,361`
- Modify: `src/lib/isa/relatorio.ts:7,73,92,107,121,125,128`
- Test: `testes/isa/abordagem-mariana.test.ts`

**Interfaces:**
- Consumes: `IDENTIDADE` (Task 1/5), `leadsDoBot` (Task 1).
- Produces: nenhum símbolo novo. Comportamento: lead criado pela IA ganha `trk = <trkPrefixo><telefone>...` e `origem = IDENTIDADE.leadOrigem`; cotação no Power de `IDENTIDADE.powerlink`; `leadDoCliente` filtra pela fonte do bot; 5 min e cobertura do relatório usam `IDENTIDADE.fonte5min` e `IDENTIDADE.powerlink`.

- [ ] **Step 1: Escrever a variante Mariana dos textos de abordagem (guarda)**

Create `testes/isa/abordagem-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { variaveisDoTemplate, textoDoTemplate, textoDaRetomada } from '../../src/lib/isa/abordagem.regras.ts'
import { MARIANA } from './_mariana.ts'

/*
 * Os templates (resultado_simulacao_isa, duvida_valores_isa) foram criados na WABA da Mariana com
 * o mesmo texto: a regra nao pode ter nada da casa alem do link que o servidor passa.
 */
test('Mariana: os templates dos 5 min e da retomada saem com o link do PDF dela e nada da casa', () => {
  const nv = variaveisDoTemplate({ nome: 'ana paula', marca: 'CHEVROLET', modelo: 'ONIX PLUS 1.0', ano: 2020 })
  assert.deepEqual(nv, ['Ana', 'Chevrolet Onix Plus 2020'])
  const link = `${MARIANA.siteUrl}/api/pdfs/lead_x`
  for (const texto of [textoDoTemplate([...nv!, link]), textoDaRetomada([...nv!, link])]) {
    assert.ok(texto.includes('https://mariana.21go.site/api/pdfs/lead_x'))
    assert.doesNotMatch(texto, /21go\.site\/api|Leticya|4824|\bIsa\b/)
  }
})

test('Mariana: os 5 min olham o site do Gabriel, de qualquer origem', () => {
  assert.deepEqual(MARIANA.fonte5min, { origens: null, dominios: ['21go.app'] })
})
```

Run: `node --test testes/isa/abordagem-mariana.test.ts`
Expected: PASS (a regra já é neutra; este teste é a guarda que o inventário pediu para `abordagem.test.ts`).

Check do que vai mudar — Run: `grep -n "'isa_whatsapp'\|\`isa\${\|WDVMKnkq\|DOMINIOS_DA_CASA\|nome: 'Isa'\|98004-0964\|📊 Isa\|na Isa'" src/lib/isa/orcamento.ts src/lib/isa/abordagem.ts src/lib/isa/relatorio.ts`
Expected: as linhas listadas em Files (antes da mudança).

- [ ] **Step 2: `orcamento.ts`**

Substituir:

```ts
import { sql } from '@/lib/isa/banco'
```

por:

```ts
import { sql } from '@/lib/isa/banco'
import { IDENTIDADE } from '@/lib/isa/identidade'
```

Substituir:

```ts
const POWERCRM_DEFAULT_SLSMN_NW_ID = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
```

por:

```ts
// Power do humano do bot (Leticya na Isa, XDmAbx6D do Gabriel na Mariana). Le o mesmo env de antes.
const POWERCRM_DEFAULT_SLSMN_NW_ID = IDENTIDADE.powerlink
```

Substituir:

```ts
  const trk = `isa${p.telefone}${placa}`.toLowerCase()
```

por:

```ts
  // Prefixo do bot: o mesmo telefone+placa na Isa e na Mariana nao pode ser a mesma linha de lead.
  const trk = `${IDENTIDADE.trkPrefixo}${p.telefone}${placa}`.toLowerCase()
```

Substituir:

```ts
  const trk = `isa${p.telefone}m${p.modelId}a${p.ano}`.toLowerCase()
```

por:

```ts
  const trk = `${IDENTIDADE.trkPrefixo}${p.telefone}m${p.modelId}a${p.ano}`.toLowerCase()
```

Substituir (as duas ocorrências, `replace_all`, sem a indentação no texto procurado):

```ts
origem: 'isa_whatsapp',
```

por:

```ts
origem: IDENTIDADE.leadOrigem,
```

Substituir:

```ts
  const notas = ['Origem: Isa (WhatsApp 98004-0964)']
```

por:

```ts
  const notas = [`Origem: ${IDENTIDADE.nome} (WhatsApp ${IDENTIDADE.numeroBonito})`]
```

- [ ] **Step 3: `fatos.ts` (simulação do cliente só da fonte do bot)**

Substituir:

```ts
import { variantesDoTelefone } from '@/lib/isa/telefone.regras'
```

por:

```ts
import { variantesDoTelefone } from '@/lib/isa/telefone.regras'
import { IDENTIDADE } from '@/lib/isa/identidade'
import { leadsDoBot } from '@/lib/isa/identidade.regras'
```

Logo depois da constante `COLUNAS` (fim da linha 36), acrescentar:

```ts

// Fonte do bot (spec da Mariana, secao 2): a Mariana so ve os leads dela (os que criou e os do
// site do Gabriel); a Isa ve os de sempre, menos os da Mariana. `n` = numero do 1o parametro.
const FONTE = leadsDoBot(IDENTIDADE)
const VALORES_DA_FONTE = [FONTE.incluirOrigens, FONTE.incluirDominios, FONTE.excluirOrigens, FONTE.excluirDominios]
const filtroDaFonte = (n: number) =>
  `AND ($${n}::text[] IS NULL OR COALESCE(origem, '') = ANY($${n}::text[]) OR COALESCE(dominio, '') = ANY($${n + 1}::text[]))
       AND NOT (COALESCE(origem, '') = ANY($${n + 2}::text[]) OR COALESCE(dominio, '') = ANY($${n + 3}::text[]))`
```

Substituir:

```ts
    const r = await sql<LeadIsa>(`SELECT ${COLUNAS} FROM public.leads WHERE id = $1 AND consultor_slug IS NULL LIMIT 1`, [leadId])
```

por:

```ts
    const r = await sql<LeadIsa>(`SELECT ${COLUNAS} FROM public.leads WHERE id = $1 AND consultor_slug IS NULL ${filtroDaFonte(2)} LIMIT 1`, [
      leadId,
      ...VALORES_DA_FONTE,
    ])
```

Substituir:

```ts
       AND consultor_slug IS NULL
       AND cotacao_planos IS NOT NULL
       AND created_at > (now() AT TIME ZONE 'UTC') - interval '30 days'
       AND created_at > COALESCE($2::timestamptz AT TIME ZONE 'UTC', '-infinity'::timestamp)
     ORDER BY created_at DESC LIMIT 1`,
    [variantesDoTelefone(telefone), desde],
```

por:

```ts
       AND consultor_slug IS NULL
       ${filtroDaFonte(3)}
       AND cotacao_planos IS NOT NULL
       AND created_at > (now() AT TIME ZONE 'UTC') - interval '30 days'
       AND created_at > COALESCE($2::timestamptz AT TIME ZONE 'UTC', '-infinity'::timestamp)
     ORDER BY created_at DESC LIMIT 1`,
    [variantesDoTelefone(telefone), desde, ...VALORES_DA_FONTE],
```

(Na Isa: `$n` = `null` e as listas de exclusão são `['mariana_whatsapp']` / `['21go.app']`, que ainda não existem em `leads` — resultado igual ao de hoje.)

- [ ] **Step 4: `abordagem.ts` (5 min e alertas)**

Remover a linha:

```ts
import { DOMINIOS_DA_CASA } from '@/lib/isa/popup.regras'
```

Substituir:

```ts
// slsmnNwId da Leticya no Power: negociacao com outro responsavel = placa presa com outro consultor.
const RESPONSAVEL_DA_CASA = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
const SITE = 'https://21go.site'
// Origens que o formulario do site grava (deriveOrigem). Fica de fora o que o CRM espelha
// (power_crm, manual, seja_consultor) e o que a propria Isa cria (isa_whatsapp).
const ORIGENS_DO_SITE = ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro']
```

por:

```ts
// slsmnNwId do humano do bot no Power (Leticya na Isa, Gabriel na Mariana): negociacao com outro
// responsavel = placa presa com outro consultor.
const RESPONSAVEL_DO_BOT = IDENTIDADE.powerlink
const SITE = IDENTIDADE.siteUrl
// Fonte dos 5 min (identidade): na Isa, as origens que o formulario do site grava (deriveOrigem) e
// os .site da casa — fica de fora o que o CRM espelha e o que a propria Isa cria (isa_whatsapp).
// Na Mariana, so o site do Gabriel (21go.app), de qualquer origem.
const FONTE_5MIN = IDENTIDADE.fonte5min
```

Substituir:

```ts
       AND l.origem = ANY($3::text[])
```

por:

```ts
       AND ($3::text[] IS NULL OR l.origem = ANY($3::text[]))
```

Substituir:

```ts
    [cfg.ligado_em, POR_RODADA * 4, ORIGENS_DO_SITE, teste, DOMINIOS_DA_CASA, RESPONSAVEL_DA_CASA],
```

por:

```ts
    [cfg.ligado_em, POR_RODADA * 4, FONTE_5MIN.origens, teste, FONTE_5MIN.dominios, RESPONSAVEL_DO_BOT],
```

Substituir (as duas ocorrências, com indentações diferentes — `replace_all` sem a indentação no texto procurado):

```ts
nome: 'Isa',
```

por:

```ts
nome: IDENTIDADE.nome,
```

Substituir:

```ts
    detalhe: `a qualidade do 98004-0964 na Meta esta ${rating}: ${mudancas.join(', ')}`,
```

por:

```ts
    detalhe: `a qualidade do ${IDENTIDADE.numeroBonito} na Meta esta ${rating}: ${mudancas.join(', ')}`,
```

(`IDENTIDADE` já está importado pela Task 5.)

- [ ] **Step 5: `relatorio.ts`**

Remover a linha:

```ts
import { DOMINIOS_DA_CASA } from '@/lib/isa/popup.regras'
```

Substituir:

```ts
    `📊 Isa ontem (${rotulo})`,
```

por:

```ts
    `📊 ${IDENTIDADE.nome} ontem (${rotulo})`,
```

Substituir:

```ts
    await alertarDono({ telefone: para, nome: 'Isa', motivo: 'relatorio', detalhe: linhas.join('\n') })
```

por:

```ts
    await alertarDono({ telefone: para, nome: IDENTIDADE.nome, motivo: 'relatorio', detalhe: linhas.join('\n') })
```

Substituir:

```ts
  const casa = process.env.POWERCRM_DEFAULT_SLSMN_NW_ID || 'WDVMKnkq'
```

por:

```ts
  const casa = IDENTIDADE.powerlink
```

Substituir:

```ts
         WHEN na_isa THEN 'na Isa'
```

por:

```ts
         WHEN na_isa THEN $3::text
```

Substituir:

```ts
         ELSE '⚠️ sem motivo — deveria estar na Isa'
```

por:

```ts
         ELSE $4::text
```

Substituir:

```ts
    [DOMINIOS_DA_CASA, casa],
```

por:

```ts
    [IDENTIDADE.fonte5min.dominios, casa, `na ${IDENTIDADE.nome}`, `⚠️ sem motivo — deveria estar na ${IDENTIDADE.nome}`],
```

- [ ] **Step 6: Conferir**

Run: `grep -n "'isa_whatsapp'\|WDVMKnkq\|DOMINIOS_DA_CASA\|nome: 'Isa'\|98004-0964\|📊 Isa\|na Isa'" src/lib/isa/orcamento.ts src/lib/isa/abordagem.ts src/lib/isa/relatorio.ts src/lib/isa/fatos.ts`
Expected: só comentários (nenhuma linha de código).

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 7: Commit**

```bash
git add src/lib/isa/orcamento.ts src/lib/isa/fatos.ts src/lib/isa/abordagem.ts src/lib/isa/relatorio.ts testes/isa/abordagem-mariana.test.ts
git commit -m "feat(mariana): lead, Power, 5 min e relatorio pela identidade do bot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Conversa pela identidade (cérebro, worker, ações, alertas, recrutamento, WABA, rotinas da casa)

**Files:**
- Modify: `src/lib/isa/cerebro.ts:2,4,23-25,120,156-168,267,300,312,326,341`
- Modify: `src/lib/isa/worker.ts:57,316-323,530,656,767,810,1171`
- Modify: `src/lib/isa/acoes.ts:71,79,214,227,268,284`
- Modify: `src/lib/isa/alertas.ts:4,16-35,117,138`
- Modify: `src/lib/consultor-recrutamento.ts:79-126`
- Modify: `src/lib/isa/cloud.ts:3,159-164`
- Modify: `src/lib/isa/promocao.ts:104`
- Modify: `src/app/api/cron/vigia-byd/route.ts:2,35-37`
- Modify: `src/app/api/atendimento/reabrir/route.ts:12`

**Interfaces:**
- Consumes: `IDENTIDADE` (Task 1/5); `respostasProntas`, `comporResposta(…, prontas)`, `montarPrompt(e, b)` (Task 4); `numerosOficiais`, `validarNumeros(…, oficiais)` (Task 4); `ehSoCumprimento(t, nomes)` (Task 4); `mensagemTransferencia(p, h)`, `mensagemRobo(p, h)`, `mensagemPedidoDocumentos(c, f, h)`, `mensagemBoasVindas(s, n, indicacao)` (Task 3); `indicacaoDoBot`, `nomesDoCumprimento` (Task 1).
- Produces: `recrutamentoNaIsa(p: { …; indicacao?: string })` (parâmetro novo opcional).

- [ ] **Step 1: Check do que vai mudar**

Run: `grep -n "você é a Isa\|'juliano'\|para: '4824'\|https://21go.site\|WABA_VENDAS\|a Isa ia mandar\|A Isa não soube\|a Isa nao soube" src/lib/isa/cerebro.ts src/lib/isa/worker.ts src/lib/isa/acoes.ts src/lib/isa/alertas.ts src/lib/isa/cloud.ts src/app/api/atendimento/reabrir/route.ts`
Expected: as linhas listadas em Files.

- [ ] **Step 2: `cerebro.ts`**

Substituir a linha 2:

```ts
import { montarPrompt, comporResposta, abertura, tirarCumprimento, tirarNomeRepetido, ehRepeticao, vazaInterno, ehPergunta, semInformacaoValido, type Genero } from '@/lib/isa/prompt.regras'
```

por:

```ts
import { montarPrompt, comporResposta, respostasProntas, abertura, tirarCumprimento, tirarNomeRepetido, ehRepeticao, vazaInterno, ehPergunta, semInformacaoValido, type Genero } from '@/lib/isa/prompt.regras'
```

Substituir a linha 4:

```ts
import { validarNumeros, extrairNumeros, type Permitidos } from '@/lib/isa/validador.regras'
```

por:

```ts
import { validarNumeros, extrairNumeros, numerosOficiais, type Permitidos } from '@/lib/isa/validador.regras'
import { IDENTIDADE } from '@/lib/isa/identidade'
```

Substituir:

```ts
const RESERVA = 'google/gemini-2.5-flash'
```

por:

```ts
const RESERVA = 'google/gemini-2.5-flash'
// O que muda da Isa pra Mariana: o "posso te ligar?" e o telefone do supervisor liberado.
const PRONTAS = respostasProntas(IDENTIDADE)
const OFICIAIS = numerosOficiais(IDENTIDADE.humano.telefone)
```

Substituir:

```ts
    resposta: comporResposta(pronta, tirarFrasesDeRobo(tirarNomeRepetido(tirarCumprimento(typeof j.resposta === 'string' ? j.resposta : ''), primeiroNome)), aberturaDoCodigo),
```

por:

```ts
    resposta: comporResposta(pronta, tirarFrasesDeRobo(tirarNomeRepetido(tirarCumprimento(typeof j.resposta === 'string' ? j.resposta : ''), primeiroNome)), aberturaDoCodigo, PRONTAS),
```

Substituir:

```ts
    promocao: e.promocao ? blocoPromocao(e.promocao) : null,
  })
```

por:

```ts
    promocao: e.promocao ? blocoPromocao(e.promocao) : null,
  }, IDENTIDADE)
```

Substituir:

```ts
    saida = { ...saida, resposta: comporResposta('fora_do_assunto', '', aberturaDoCodigo), gatilho: null }
```

por:

```ts
    saida = { ...saida, resposta: comporResposta('fora_do_assunto', '', aberturaDoCodigo, PRONTAS), gatilho: null }
```

Substituir:

```ts
  let v = validarNumeros(saida.resposta, permitidos)
```

por:

```ts
  let v = validarNumeros(saida.resposta, permitidos, OFICIAIS)
```

Substituir:

```ts
  v = validarNumeros(saida.resposta, permitidos)
  if (v.ok) return { ...saida, reprovados: primeiraReprovacao }
```

por:

```ts
  v = validarNumeros(saida.resposta, permitidos, OFICIAIS)
  if (v.ok) return { ...saida, reprovados: primeiraReprovacao }
```

Substituir:

```ts
    'você é a Isa, atendente da 21Go Proteção Patrimonial Veicular, no WhatsApp. o cliente perguntou algo que você não sabia, você disse "vou confirmar e já te retorno", e o seu supervisor acabou de te passar a resposta. escreva a mensagem pro cliente.\n' +
```

por:

```ts
    `você é a ${IDENTIDADE.nome}, atendente da 21Go Proteção Patrimonial Veicular, no WhatsApp. o cliente perguntou algo que você não sabia, você disse "vou confirmar e já te retorno", e o seu supervisor acabou de te passar a resposta. escreva a mensagem pro cliente.\n` +
```

Substituir:

```ts
  const v = validarNumeros(texto, { dinheiro: [...NUMEROS_FIXOS.dinheiro, ...doDono.dinheiro], pct: [...NUMEROS_FIXOS.pct, ...doDono.pct] })
```

por:

```ts
  const v = validarNumeros(texto, { dinheiro: [...NUMEROS_FIXOS.dinheiro, ...doDono.dinheiro], pct: [...NUMEROS_FIXOS.pct, ...doDono.pct] }, OFICIAIS)
```

- [ ] **Step 3: `consultor-recrutamento.ts` (indicação do bot)**

Substituir:

```ts
  historico: readonly (string | null)[]
  enviar: (texto: string) => Promise<boolean>
}): Promise<AcaoRecrutamento | null> {
```

por:

```ts
  historico: readonly (string | null)[]
  enviar: (texto: string) => Promise<boolean>
  /** "da consultora Leticya Thayene" (padrao) / "do consultor Gabriel Juliano" (Mariana) */
  indicacao?: string
}): Promise<AcaoRecrutamento | null> {
```

Substituir (dentro de `recrutamentoNaIsa`):

```ts
    estado,
    enviar: p.enviar,
  })
}
```

por:

```ts
    estado,
    enviar: p.enviar,
    indicacao: p.indicacao,
  })
}
```

Substituir (assinatura de `responder`):

```ts
  estado: Estado | null
  enviar: (texto: string) => Promise<boolean>
}): Promise<AcaoRecrutamento> {
```

por:

```ts
  estado: Estado | null
  enviar: (texto: string) => Promise<boolean>
  indicacao?: string
}): Promise<AcaoRecrutamento> {
```

Substituir:

```ts
    acao === 'boas_vindas' ? mensagemBoasVindas(cumprimento(new Date()), primeiroNomeDoFormulario(p.texto)) : mensagemAtendimentoVirtual()
```

por:

```ts
    acao === 'boas_vindas' ? mensagemBoasVindas(cumprimento(new Date()), primeiroNomeDoFormulario(p.texto), p.indicacao) : mensagemAtendimentoVirtual()
```

- [ ] **Step 4: `worker.ts`**

Substituir:

```ts
import { recrutamentoNaIsa } from '@/lib/consultor-recrutamento'
```

por:

```ts
import { recrutamentoNaIsa } from '@/lib/consultor-recrutamento'
import { indicacaoDoBot, nomesDoCumprimento } from '@/lib/isa/identidade.regras'
```

Substituir:

```ts
    enviar: (texto) => enviarComoGente(c, [texto], ultimaInbound, visto),
  })
  if (recrutamento) {
```

por:

```ts
    enviar: (texto) => enviarComoGente(c, [texto], ultimaInbound, visto),
    indicacao: indicacaoDoBot(IDENTIDADE),
  })
  if (recrutamento) {
```

Substituir:

```ts
  if (ehSoCumprimento(textoNovas) && c.aguardando_dono !== AGUARDANDO_FECHA_QUANDO) {
```

por:

```ts
  if (ehSoCumprimento(textoNovas, NOMES_DO_CUMPRIMENTO) && c.aguardando_dono !== AGUARDANDO_FECHA_QUANDO) {
```

Substituir:

```ts
    const robo = mensagemRobo({ genero: ((c.genero ?? saida.genero) as 'm' | 'f' | null) ?? null, resumo: r.texto })
```

por:

```ts
    const robo = mensagemRobo({ genero: ((c.genero ?? saida.genero) as 'm' | 'f' | null) ?? null, resumo: r.texto }, IDENTIDADE.humano)
```

Substituir:

```ts
    await enviarComoGente(c, [mensagemPedidoDocumentos(false, docsDaConversa.faltam)], ultimaInbound, visto)
```

por:

```ts
    await enviarComoGente(c, [mensagemPedidoDocumentos(false, docsDaConversa.faltam, IDENTIDADE.humano)], ultimaInbound, visto)
```

Substituir:

```ts
const SITE = 'https://21go.site'
```

por:

```ts
// Base dos links de PDF (21go.site na Isa, host da Mariana na dela) e os nomes que viram cumprimento.
const SITE = IDENTIDADE.siteUrl
const NOMES_DO_CUMPRIMENTO = nomesDoCumprimento(IDENTIDADE)
```

Substituir:

```ts
      await pausarEAvisar(c, 'loop', `a Isa ia mandar a ${jaEnviadas + 1}a mensagem sem o cliente responder — segurei, pausei e nada saiu. Confere a conversa.`)
```

por:

```ts
      await pausarEAvisar(c, 'loop', `a ${IDENTIDADE.nome} ia mandar a ${jaEnviadas + 1}a mensagem sem o cliente responder — segurei, pausei e nada saiu. Confere a conversa.`)
```

- [ ] **Step 5: `acoes.ts`**

Substituir:

```ts
  await enviar([mensagemTransferencia({ motivo, resumo: `${r.texto} | Motivo: ${motivo}` })])
```

por:

```ts
  await enviar([mensagemTransferencia({ motivo, resumo: `${r.texto} | Motivo: ${motivo}` }, IDENTIDADE.humano)])
```

Substituir:

```ts
  await registrarEvento(c.telefone, 'transferiu', { motivo, para: '4824' }, opcoes.por ?? 'isa')
```

por:

```ts
  await registrarEvento(c.telefone, 'transferiu', { motivo, para: IDENTIDADE.humano.apelido }, opcoes.por ?? 'isa')
```

Substituir (as 4 ocorrências, `replace_all`):

```ts
, 'juliano')
```

por:

```ts
, IDENTIDADE.donoPor)
```

- [ ] **Step 6: `alertas.ts`**

Substituir:

```ts
import { TAB } from '@/lib/isa/identidade'
```

por:

```ts
import { IDENTIDADE, TAB } from '@/lib/isa/identidade'
```

Substituir o bloco de `const PAINEL` até o fim de `MOTIVO_LEGIVEL` (linhas 16-35):

```ts
const PAINEL = 'https://21go.site/painel'

const MOTIVO_LEGIVEL: Record<string, string> = {
  documento: 'cliente mandou documento (transferido pro 4824)',
  associado: 'associado pedindo suporte (transferido pro 4824)',
  sem_preco: 'a Isa nao achou preco pra esse veiculo e pediu pra conferir placa/modelo',
  robo: 'cliente perguntou se e robo',
  hostil: 'cliente xingou ou ameacou',
  validador: 'a Isa ia passar um numero que nao confere — segurei a mensagem',
  sem_informacao: 'cliente perguntou algo que a Isa nao soube responder',
  sem_comprovante: 'cliente escolheu o plano e nao tem comprovante de residencia',
  avaria: 'veiculo com amassado/defeito — fotos pra avaliar (transferido pro 4824)',
  desconto: 'pedido de desconto',
  qualidade: 'qualidade do numero caiu na Meta',
  template: 'template da mensagem dos 5 min deixou de ser utilidade aprovada',
  relatorio: 'relatorio diario da Isa',
  byd: 'cliente de BYD (transferido pro 4824)',
  mudar_vencimento: 'cliente pediu pra mudar o dia do vencimento (a Isa disse que vai tentar)',
  loop: 'TRAVA: a Isa ia mandar mensagem demais sem o cliente responder — pausei e nada saiu',
}
```

por:

```ts
// Painel do container do bot (21go.site/painel na Isa, o host da Mariana na dela).
const PAINEL = IDENTIDADE.painelUrl
const BOT = IDENTIDADE.nome
// "transferido pro 4824" na Isa, "transferido pro Gabriel" na Mariana.
const TRANSFERIDO = `transferido pro ${IDENTIDADE.humano.apelido}`

const MOTIVO_LEGIVEL: Record<string, string> = {
  documento: `cliente mandou documento (${TRANSFERIDO})`,
  associado: `associado pedindo suporte (${TRANSFERIDO})`,
  sem_preco: `a ${BOT} nao achou preco pra esse veiculo e pediu pra conferir placa/modelo`,
  robo: 'cliente perguntou se e robo',
  hostil: 'cliente xingou ou ameacou',
  validador: `a ${BOT} ia passar um numero que nao confere — segurei a mensagem`,
  sem_informacao: `cliente perguntou algo que a ${BOT} nao soube responder`,
  sem_comprovante: 'cliente escolheu o plano e nao tem comprovante de residencia',
  avaria: `veiculo com amassado/defeito — fotos pra avaliar (${TRANSFERIDO})`,
  desconto: 'pedido de desconto',
  qualidade: 'qualidade do numero caiu na Meta',
  template: 'template da mensagem dos 5 min deixou de ser utilidade aprovada',
  relatorio: `relatorio diario da ${BOT}`,
  byd: `cliente de BYD (${TRANSFERIDO})`,
  mudar_vencimento: `cliente pediu pra mudar o dia do vencimento (a ${BOT} disse que vai tentar)`,
  loop: `TRAVA: a ${BOT} ia mandar mensagem demais sem o cliente responder — pausei e nada saiu`,
}
```

Substituir:

```ts
    `❓ A Isa não soube responder - 21Go
```

por:

```ts
    `❓ A ${BOT} não soube responder - 21Go
```

Substituir:

```ts
        'a Isa nao soube responder — responda esta mensagem com a resposta',
```

por:

```ts
        `a ${BOT} nao soube responder — responda esta mensagem com a resposta`,
```

(Destino dos alertas e do relatório continua sendo `ISA_ALERTA_PARA` via `numeroDeAlerta()`; na Mariana o env aponta 5521990954964, ver `testes/isa/_mariana.ts`.)

- [ ] **Step 7: `cloud.ts` (templates na WABA do bot)**

Substituir:

```ts
import { mediaIdValido } from '@/lib/isa/envio.regras'
```

por:

```ts
import { mediaIdValido } from '@/lib/isa/envio.regras'
import { IDENTIDADE } from '@/lib/isa/identidade'
```

Substituir:

```ts
// WABA de vendas (a do 98004-0964). Nao e segredo; o env so existe pra trocar sem deploy.
const WABA_VENDAS = '932143313296745'
```

por:

```ts
// WABA do numero do bot: a de vendas da Isa (98004-0964) por padrao, a da Mariana no container
// dela. Sem isso a Mariana leria os templates da Isa e mandaria um que nao existe no numero dela.
```

Substituir:

```ts
  const waba = process.env.WA_WABA_ID || WABA_VENDAS
```

por:

```ts
  const waba = IDENTIDADE.waba
```

- [ ] **Step 8: Rotinas só da casa (promoção 40% e vigia-BYD)**

Em `src/lib/isa/promocao.ts`, substituir:

```ts
export async function dispararPromocao(agora = new Date()): Promise<{ enviados: number; motivo?: string }> {
```

por:

```ts
export async function dispararPromocao(agora = new Date()): Promise<{ enviados: number; motivo?: string }> {
  // Campanha da casa (spec da Mariana, secao 4): nunca dispara em outro bot.
  if (!IDENTIDADE.daCasa) return { enviados: 0, motivo: 'so_da_casa' }
```

Em `src/app/api/cron/vigia-byd/route.ts`, substituir:

```ts
import { sql, registrarEvento } from '@/lib/isa/banco'
```

por:

```ts
import { sql, registrarEvento } from '@/lib/isa/banco'
import { IDENTIDADE } from '@/lib/isa/identidade'
```

e:

```ts
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    const instancia = getEvolutionInstance()
```

por:

```ts
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  // BYD do 4824 e rotina da casa: no container da Mariana nao roda nem por engano.
  if (!IDENTIDADE.daCasa) return NextResponse.json({ pulado: 'so_da_casa' })
  try {
    const instancia = getEvolutionInstance()
```

- [ ] **Step 9: `reabrir/route.ts`**

Substituir:

```ts
const SITE = 'https://21go.site'
```

por:

```ts
const SITE = IDENTIDADE.siteUrl
```

- [ ] **Step 10: Conferir**

Run: `grep -n "você é a Isa\|'juliano'\|para: '4824'\|'https://21go.site'\|WABA_VENDAS\|a Isa ia mandar\|A Isa não soube\|'a Isa nao soube" src/lib/isa/cerebro.ts src/lib/isa/worker.ts src/lib/isa/acoes.ts src/lib/isa/alertas.ts src/lib/isa/cloud.ts src/app/api/atendimento/reabrir/route.ts`
Expected: nenhuma linha.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 11: Commit**

```bash
git add src/lib/isa/cerebro.ts src/lib/isa/worker.ts src/lib/isa/acoes.ts src/lib/isa/alertas.ts src/lib/consultor-recrutamento.ts src/lib/isa/cloud.ts src/lib/isa/promocao.ts src/app/api/cron/vigia-byd/route.ts src/app/api/atendimento/reabrir/route.ts
git commit -m "feat(mariana): conversa, alertas, WABA e rotinas da casa pela identidade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: PDF do lead da Mariana com o Gabriel e sem a promoção da casa

**Files:**
- Modify: `src/lib/pdf-quote.ts:25-31,573-575,685`
- Modify: `src/app/api/pdfs/[leadId]/route.ts:1-4,34,60-66,85-87`
- Test: `testes/isa/pdf-mariana.test.ts`

**Interfaces:**
- Consumes: `IDENTIDADE` (Task 1), `atendimentoDoPdf` (Task 1).
- Produces: `QuotePdfInput.atendimento?: { nome: string; whatsappUrl: string } | null`.

- [ ] **Step 1: Escrever o teste que falha**

Create `testes/isa/pdf-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarResolvedorDoNext } from '../_shim/resolver.ts'

ligarResolvedorDoNext()

const base = { nome: 'Ana Souza', whatsapp: '5521999998888', marca: 'Fiat', modelo: 'Uno', ano: 2015, fipe: 30000, planoNome: 'VIP', mensalidade: 200 }

test('PDF da casa continua igual: botao do rodizio e rodape da 21Go', async () => {
  const { renderQuoteHTML } = await import('../../src/lib/pdf-quote.ts')
  const h = renderQuoteHTML(base)
  assert.match(h, /href="https:\/\/21go\.site\/api\/wa"/)
  assert.match(h, /<span class="footer-name">21Go Proteção Patrimonial Veicular<\/span>/)
})

test('PDF do lead da Mariana: botao e rodape do Gabriel, nada do rodizio da casa', async () => {
  const { renderQuoteHTML } = await import('../../src/lib/pdf-quote.ts')
  const h = renderQuoteHTML({ ...base, atendimento: { nome: 'Gabriel Juliano', whatsappUrl: 'https://wa.me/5521990954964' } })
  assert.match(h, /href="https:\/\/wa\.me\/5521990954964"/)
  assert.match(h, /<span class="footer-name">Gabriel Juliano<\/span>/)
  assert.doesNotMatch(h, /21go\.site\/api\/wa/)
})
```

Run: `node --test testes/isa/pdf-mariana.test.ts`
Expected: o primeiro passa, o segundo FALHA (o botão ainda aponta `https://21go.site/api/wa`).

- [ ] **Step 2: `pdf-quote.ts`**

Substituir:

```ts
  consultorSlug?: string | null
  /** Consultor que prefere tratar a ativacao na conversa (ver ocultarAtivacao). */
```

por:

```ts
  consultorSlug?: string | null
  /**
   * Lead de bot de parceiro (Mariana, do Gabriel): o botao e o rodape sao do consultor dono do bot,
   * nunca o rodizio da casa (spec da Mariana, secao 3). Sem isto, o PDF de sempre.
   */
  atendimento?: { nome: string; whatsappUrl: string } | null
  /** Consultor que prefere tratar a ativacao na conversa (ver ocultarAtivacao). */
```

Substituir:

```ts
  const linkWhatsApp = input.consultorSlug
    ? `https://21go.site/api/wa?c=${input.consultorSlug}`
    : 'https://21go.site/api/wa'
```

por:

```ts
  const linkWhatsApp = input.consultorSlug
    ? `https://21go.site/api/wa?c=${input.consultorSlug}`
    : (input.atendimento?.whatsappUrl ?? 'https://21go.site/api/wa')
```

Substituir:

```ts
          <span class="footer-name">21Go Proteção Patrimonial Veicular</span>
```

por:

```ts
          <span class="footer-name">${input.atendimento?.nome ?? '21Go Proteção Patrimonial Veicular'}</span>
```

- [ ] **Step 3: Rota `/api/pdfs/[leadId]`**

Substituir:

```ts
import { resolverConsultor } from '@/lib/consultor'
```

por:

```ts
import { resolverConsultor } from '@/lib/consultor'
import { IDENTIDADE } from '@/lib/isa/identidade'
import { atendimentoDoPdf } from '@/lib/isa/identidade.regras'
```

Substituir:

```ts
      'id, nome, telefone, whatsapp, email, placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado, cotacao_plano, cotacao_valor, cotacao_planos, carro_app, leilao, seguro_atual, consultor_slug',
```

por:

```ts
      'id, nome, telefone, whatsapp, email, placa_interesse, marca_interesse, modelo_interesse, ano_interesse, valor_fipe_consultado, cotacao_plano, cotacao_valor, cotacao_planos, carro_app, leilao, seguro_atual, consultor_slug, origem, dominio',
```

Substituir:

```ts
  const dono = slug ? await resolverConsultor(slug) : null

  // Recebeu a promocao de 40% na ativacao (isa_promocoes): o PDF mostra a ativacao da promocao,
  // senao desmente a mensagem que ele recebeu (dono, 29/09/2026). Lead de consultor nunca entra.
  let taxaAtivacao: number | undefined
  if (!slug) {
```

por:

```ts
  const dono = slug ? await resolverConsultor(slug) : null
  // Lead do bot de parceiro (Mariana): botao e rodape do Gabriel, e sem a promocao da casa. Na Isa
  // e sempre null — o PDF de sempre.
  const atendimento = slug
    ? null
    : atendimentoDoPdf({ origem: data.origem as string | null, dominio: data.dominio as string | null }, IDENTIDADE)

  // Recebeu a promocao de 40% na ativacao (isa_promocoes): o PDF mostra a ativacao da promocao,
  // senao desmente a mensagem que ele recebeu (dono, 29/09/2026). Lead de consultor nunca entra.
  let taxaAtivacao: number | undefined
  if (!slug && !atendimento) {
```

Substituir:

```ts
      consultorSlug: slug,
      ocultarAtivacao: dono?.ocultarAtivacao ?? false,
```

por:

```ts
      consultorSlug: slug,
      atendimento,
      ocultarAtivacao: dono?.ocultarAtivacao ?? false,
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `node --test testes/isa/pdf-mariana.test.ts testes/planos/pdf-planos-do-power.test.ts`
Expected: PASS.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf-quote.ts "src/app/api/pdfs/[leadId]/route.ts" testes/isa/pdf-mariana.test.ts
git commit -m "feat(mariana): PDF do lead da Mariana com botao e rodape do Gabriel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Fila de pendentes do Power manda lead da Mariana pro Power do Gabriel

**Files:**
- Modify: `src/lib/power-fila.regras.ts:10-11`
- Modify: `src/app/api/cron/power-pendentes/route.ts:6,93-94,163`
- Test: `testes/power/fila-mariana.test.ts`

**Interfaces:**
- Consumes: `MARIANA`, `LEADS_DE_PARCEIRO` (só no teste, para conferir consistência).
- Produces: `ORIGENS_DA_FILA_LISTA: readonly string[]`, `powerlinkDaOrigem(origem: string | null | undefined): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

Create `testes/power/fila-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadPrecisaDoPower, powerlinkDaOrigem, ORIGENS_DA_FILA_LISTA } from '../../src/lib/power-fila.regras.ts'
import { LEADS_DE_PARCEIRO } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

const AGORA = new Date('2026-10-01T15:00:00Z')
const base = { origem: 'mariana_whatsapp', status: 'lead', quotation_code: null, negotiation_code: null, created_at: '2026-10-01T14:00:00Z' }

test('lead da Mariana sem Power entra na fila', () => {
  assert.equal(leadPrecisaDoPower(base, AGORA), true)
  assert.ok(ORIGENS_DA_FILA_LISTA.includes('mariana_whatsapp'))
  // a fila de sempre nao mudou
  for (const o of ['site_organico', 'isa_whatsapp']) assert.ok(ORIGENS_DA_FILA_LISTA.includes(o), o)
})

test('lead da Mariana vai pro Power do Gabriel, nunca pro da Leticya', () => {
  assert.equal(powerlinkDaOrigem(MARIANA.leadOrigem), MARIANA.powerlink)
  assert.equal(powerlinkDaOrigem('mariana_whatsapp'), 'XDmAbx6D')
  // o resto segue a regra de hoje (consultor do site, senao a casa)
  for (const o of ['isa_whatsapp', 'site_organico', null, undefined, 'toString']) assert.equal(powerlinkDaOrigem(o), null, String(o))
  // a marca e a mesma que a Isa usa pra deixar esses leads de fora
  assert.deepEqual([...LEADS_DE_PARCEIRO.origens], ['mariana_whatsapp'])
})
```

Run: `node --test testes/power/fila-mariana.test.ts`
Expected: FAIL com `does not provide an export named 'powerlinkDaOrigem'`.

- [ ] **Step 2: `power-fila.regras.ts`**

Substituir:

```ts
/** So o que passa pelo formulario do site e pela Isa. O resto nasce no Power por outro caminho. */
const ORIGENS_DA_FILA = new Set(['site_organico', 'isa_whatsapp'])
```

por:

```ts
/** So o que passa pelo formulario do site e pela Isa/Mariana. O resto nasce no Power por outro caminho. */
const ORIGENS_DA_FILA = new Set(['site_organico', 'isa_whatsapp', 'mariana_whatsapp'])

export const ORIGENS_DA_FILA_LISTA: readonly string[] = [...ORIGENS_DA_FILA]

/**
 * Lead criado por bot de parceiro volta pro Power do consultor dono do bot, nunca pro da Leticya
 * (dono, 01/10/2026: "tudo da mariana vai cair no power do gabriel"). Mesmo valor do env da
 * Mariana (testes/power/fila-mariana.test.ts confere). Sem entrada aqui: a regra de sempre.
 */
const POWERLINK_POR_ORIGEM: Record<string, string> = { mariana_whatsapp: 'XDmAbx6D' }

export function powerlinkDaOrigem(origem: string | null | undefined): string | null {
  const o = origem ?? ''
  return Object.hasOwn(POWERLINK_POR_ORIGEM, o) ? POWERLINK_POR_ORIGEM[o] : null
}
```

- [ ] **Step 3: Rota `power-pendentes`**

Substituir:

```ts
import { buscasDoLead, leadPrecisaDoPower } from '@/lib/power-fila.regras'
```

por:

```ts
import { buscasDoLead, leadPrecisaDoPower, powerlinkDaOrigem, ORIGENS_DA_FILA_LISTA } from '@/lib/power-fila.regras'
```

Substituir:

```ts
  // De quem e o lead: o PowerLink do consultor do site, senao o da casa (Leticya).
  let powerlink = POWERLINK_LETICYA
```

por:

```ts
  // De quem e o lead: o do bot de parceiro (Mariana -> Gabriel), o do consultor do site, senao o da
  // casa (Leticya).
  let powerlink = powerlinkDaOrigem(l.origem) ?? POWERLINK_LETICYA
```

Substituir:

```ts
    .in('origem', ['site_organico', 'isa_whatsapp'])
```

por:

```ts
    .in('origem', [...ORIGENS_DA_FILA_LISTA])
```

(Com `XDmAbx6D`, `criaPelaPipeline(powerlink)` dá `false` e o cadastro vai pelo PowerLink com `slsmnNwId` do Gabriel — o mesmo caminho do `/api/parceiro/lead`.)

- [ ] **Step 4: Rodar testes e typecheck**

Run: `node --test testes/power/fila-mariana.test.ts testes/power/fila.test.ts`
Expected: PASS.

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/power-fila.regras.ts src/app/api/cron/power-pendentes/route.ts testes/power/fila-mariana.test.ts
git commit -m "feat(mariana): fila de pendentes recadastra lead da Mariana no Power do Gabriel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Painel lê nome, número, humano e etiquetas do servidor

**Files:**
- Modify: `src/lib/isa/identidade.regras.ts` (acrescentar `PainelBot`, `painelDoBot`)
- Modify: `src/app/api/atendimento/eu/route.ts`
- Modify: `src/app/api/atendimento/etiquetas/route.ts`
- Modify: `src/app/api/atendimento/funil/route.ts`
- Modify: `src/app/api/atendimento/contatos/route.ts:4,18`
- Modify: `src/lib/isa/painel-dados.ts:2-4,60,187-192,213`
- Modify: `src/components/isa/PainelIsa.tsx`
- Test: `testes/isa/painel-mariana.test.ts`

**Interfaces:**
- Consumes: `ETIQUETAS_DO_BOT`, `FUNIL_DO_BOT` (Task 2); `etiquetasForaDaFila`, `etiquetasParaGravar(…, etiquetas)`, `etiquetaValida(…, etiquetas)`, `ehEtapa(…, f)`, `etapaDoCard(…, f)`, `etiquetasAoMover(…, f)` (Task 2); `IDENTIDADE_ISA`, `IDENTIDADE`.
- Produces:
  - `interface PainelBot { nome: string; numero: string; humano: string; etiquetas: readonly Etiqueta[] }`
  - `painelDoBot(id: IdentidadeBot, etiquetas: readonly Etiqueta[]): PainelBot`
  - `GET /api/atendimento/eu` → `{ usuario: string, bot: PainelBot }` (200) ou `{ erro: 'sem sessao', bot: PainelBot }` (401). Campo novo, aditivo (o CRM ignora).

- [ ] **Step 1: Escrever o teste que falha**

Create `testes/isa/painel-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { painelDoBot, IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { ETIQUETAS, etiquetasDoBot } from '../../src/lib/isa/etiquetas.regras.ts'
import { MARIANA } from './_mariana.ts'

test('Isa: o painel de sempre (Isa, 98004-0964, 4824, etiquetas da casa)', () => {
  assert.deepEqual(painelDoBot(IDENTIDADE_ISA, etiquetasDoBot(IDENTIDADE_ISA)), {
    nome: 'Isa',
    numero: '98004-0964',
    humano: '4824',
    etiquetas: ETIQUETAS,
  })
})

test('Mariana: nome, numero, Gabriel e as etiquetas dela vem do servidor', () => {
  const p = painelDoBot(MARIANA, etiquetasDoBot(MARIANA))
  assert.equal(p.nome, 'Mariana')
  assert.equal(p.numero, '96653-0011')
  assert.equal(p.humano, 'Gabriel')
  assert.ok(p.etiquetas.some((e) => e.id === 'gabriel' && e.nome === 'Falando com Gabriel'))
  assert.ok(!p.etiquetas.some((e) => e.id === 'leticya' || e.id === 'guilherme'))
})
```

Run: `node --test testes/isa/painel-mariana.test.ts`
Expected: FAIL com `does not provide an export named 'painelDoBot'`.

- [ ] **Step 2: `painelDoBot` em `identidade.regras.ts`**

Logo depois do bloco de comentário do topo, acrescentar:

```ts
import type { Etiqueta } from './etiquetas.regras'
```

No fim do arquivo, acrescentar:

```ts
/**
 * O que o painel (navegador) precisa saber do bot. Vem de /api/atendimento/eu: o navegador nao le
 * o env, e o mesmo componente serve a Isa e a Mariana.
 */
export interface PainelBot {
  nome: string
  /** "98004-0964" — "responder pelo ..." */
  numero: string
  /** "4824" na Isa, "Gabriel" na Mariana — o botao e a marca de transferencia */
  humano: string
  etiquetas: readonly Etiqueta[]
}

export function painelDoBot(id: IdentidadeBot, etiquetas: readonly Etiqueta[]): PainelBot {
  return { nome: id.nome, numero: id.numeroBonito, humano: id.humano.apelido, etiquetas }
}
```

Run: `node --test testes/isa/painel-mariana.test.ts`
Expected: PASS.

- [ ] **Step 3: Rotas do painel**

`src/app/api/atendimento/eu/route.ts` inteiro:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { sessaoDoRequest } from '@/lib/isa/painel'
import { IDENTIDADE, ETIQUETAS_DO_BOT } from '@/lib/isa/identidade'
import { painelDoBot } from '@/lib/isa/identidade.regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nome do bot e etiquetas nao sao segredo: vao tambem no 401, pra tela de login ja mostrar o bot certo.
export async function GET(req: NextRequest) {
  const s = sessaoDoRequest(req)
  const bot = painelDoBot(IDENTIDADE, ETIQUETAS_DO_BOT)
  return s ? NextResponse.json({ usuario: s.u, bot }) : NextResponse.json({ erro: 'sem sessao', bot }, { status: 401 })
}
```

`src/app/api/atendimento/etiquetas/route.ts`: substituir

```ts
import { ETIQUETAS_FORA_DA_FILA, ETIQUETAS, etiquetasParaGravar } from '@/lib/isa/etiquetas.regras'
```

e a linha de import da Task 5

```ts
import { TAB } from '@/lib/isa/identidade'
```

por:

```ts
import { etiquetasForaDaFila, etiquetasParaGravar } from '@/lib/isa/etiquetas.regras'
```

e

```ts
import { ETIQUETAS_DO_BOT, TAB } from '@/lib/isa/identidade'
```

(respeitando a ordem em que aparecem no arquivo). Depois:

```ts
  return NextResponse.json({ etiquetas: ETIQUETAS })
```

→

```ts
  return NextResponse.json({ etiquetas: ETIQUETAS_DO_BOT })
```

```ts
  const etiquetas = etiquetasParaGravar(b.etiquetas, atual[0].etiquetas)
```

→

```ts
  const etiquetas = etiquetasParaGravar(b.etiquetas, atual[0].etiquetas, ETIQUETAS_DO_BOT)
```

```ts
    [telefone, etiquetas, [...ETIQUETAS_FORA_DA_FILA]],
```

→

```ts
    [telefone, etiquetas, etiquetasForaDaFila(ETIQUETAS_DO_BOT)],
```

`src/app/api/atendimento/funil/route.ts`: substituir

```ts
import { ETAPAS, ehEtapa } from '@/lib/isa/funil.regras'
```

por:

```ts
import { ehEtapa } from '@/lib/isa/funil.regras'
import { FUNIL_DO_BOT } from '@/lib/isa/identidade'
```

```ts
  return NextResponse.json({ etapas: ETAPAS, cards: await listarFunil() })
```

→

```ts
  return NextResponse.json({ etapas: FUNIL_DO_BOT.etapas, cards: await listarFunil() })
```

```ts
  if (etapa && !ehEtapa(etapa)) return NextResponse.json({ erro: 'etapa desconhecida' }, { status: 400 })
```

→

```ts
  if (etapa && !ehEtapa(etapa, FUNIL_DO_BOT)) return NextResponse.json({ erro: 'etapa desconhecida' }, { status: 400 })
```

`src/app/api/atendimento/contatos/route.ts`: substituir

```ts
import { etiquetaValida } from '@/lib/isa/etiquetas.regras'
```

por:

```ts
import { etiquetaValida } from '@/lib/isa/etiquetas.regras'
import { ETIQUETAS_DO_BOT } from '@/lib/isa/identidade'
```

e

```ts
  const etiqueta = etiquetaValida(e) ? e : ''
```

por:

```ts
  const etiqueta = etiquetaValida(e, ETIQUETAS_DO_BOT) ? e : ''
```

- [ ] **Step 4: `painel-dados.ts`**

Substituir:

```ts
import { ETIQUETAS_FORA_DA_FILA } from '@/lib/isa/etiquetas.regras'
```

por:

```ts
import { etiquetasForaDaFila } from '@/lib/isa/etiquetas.regras'
```

e a linha de import da Task 5

```ts
import { IDENTIDADE, TAB } from '@/lib/isa/identidade'
```

por:

```ts
import { ETIQUETAS_DO_BOT, FUNIL_DO_BOT, IDENTIDADE, TAB } from '@/lib/isa/identidade'
```

Substituir:

```ts
         OR NOT (COALESCE(c.etiquetas, '{}'::text[]) && ARRAY[${ETIQUETAS_FORA_DA_FILA.map((e) => `'${e}'`).join(',')}]::text[]))`,
```

por:

```ts
         OR NOT (COALESCE(c.etiquetas, '{}'::text[]) && ARRAY[${etiquetasForaDaFila(ETIQUETAS_DO_BOT).map((e) => `'${e}'`).join(',')}]::text[]))`,
```

Substituir:

```ts
        etiquetas: l.etiquetas,
      }),
```

por:

```ts
        etiquetas: l.etiquetas,
      }, FUNIL_DO_BOT),
```

Substituir:

```ts
        etiquetasAoMover(c.etiquetas, etapa),
```

por:

```ts
        etiquetasAoMover(c.etiquetas, etapa, FUNIL_DO_BOT),
```

- [ ] **Step 5: `PainelIsa.tsx` (contexto do bot)**

Cada troca abaixo é de uma string única no arquivo (conferido com `grep -c`), exceto onde indicado `replace_all`.

1. Imports — substituir:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ETIQUETAS } from '@/lib/isa/etiquetas.regras'
```

por:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ETIQUETAS } from '@/lib/isa/etiquetas.regras'
import { IDENTIDADE_ISA, type PainelBot } from '@/lib/isa/identidade.regras'

// Nome do bot, numero, humano e etiquetas vem do servidor (/api/atendimento/eu): o navegador nao
// le o env, e o mesmo painel serve a Isa (21go.site) e a Mariana (container dela). Enquanto nao
// chega, vale a Isa.
const BOT_PADRAO: PainelBot = {
  nome: IDENTIDADE_ISA.nome,
  numero: IDENTIDADE_ISA.numeroBonito,
  humano: IDENTIDADE_ISA.humano.apelido,
  etiquetas: ETIQUETAS,
}
const BotCtx = createContext<PainelBot>(BOT_PADRAO)
const useBot = () => useContext(BotCtx)
```

2. Rótulo de evento e chip — substituir:

```tsx
const ETIQUETA_POR_ID = new Map(ETIQUETAS.map((e) => [e.id, e]))

function ChipEtiqueta({ id, ativa = true, onClick }: { id: string; ativa?: boolean; onClick?: () => void }) {
  const e = ETIQUETA_POR_ID.get(id)
```

por:

```tsx
/** Rotulo do evento com o nome do bot e do humano dele (na Isa, o texto de sempre). */
function rotuloDoEvento(evento: string, bot: PainelBot): string {
  const r = EVENTO[evento]
  return r ? r.replace(/\bIsa\b/g, bot.nome).replace('4824', bot.humano) : evento
}

function ChipEtiqueta({ id, ativa = true, onClick }: { id: string; ativa?: boolean; onClick?: () => void }) {
  const e = useBot().etiquetas.find((x) => x.id === id)
```

3. `api()` devolve o corpo no erro — substituir:

```tsx
  if (!r.ok) throw Object.assign(new Error((j as { erro?: string }).erro || `erro ${r.status}`), { status: r.status })
```

por:

```tsx
  if (!r.ok) throw Object.assign(new Error((j as { erro?: string }).erro || `erro ${r.status}`), { status: r.status, corpo: j })
```

4. Componente raiz — substituir a função `PainelIsa` inteira:

```tsx
export function PainelIsa() {
  const [usuario, setUsuario] = useState<string | null | false>(null)

  useEffect(() => {
    api<{ usuario: string }>('/api/atendimento/eu')
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(false))
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden text-[#E9ECF8] [font-family:var(--fonte-painel),system-ui,sans-serif]"
      style={FUNDO}
    >
      {usuario === null && <div className="grid h-full place-items-center text-sm text-white/50">carregando…</div>}
      {usuario === false && <Login aoEntrar={setUsuario} />}
      {typeof usuario === 'string' && <Mesa usuario={usuario} aoSair={() => setUsuario(false)} />}
    </div>
  )
}
```

por:

```tsx
export function PainelIsa() {
  const [usuario, setUsuario] = useState<string | null | false>(null)
  const [bot, setBot] = useState<PainelBot>(BOT_PADRAO)

  const carregarEu = useCallback(() => {
    api<{ usuario: string; bot?: PainelBot }>('/api/atendimento/eu')
      .then((r) => {
        if (r.bot) setBot(r.bot)
        setUsuario(r.usuario)
      })
      .catch((err) => {
        const b = (err as { corpo?: { bot?: PainelBot } }).corpo?.bot
        if (b) setBot(b)
        setUsuario(false)
      })
  }, [])

  useEffect(() => {
    carregarEu()
  }, [carregarEu])

  useEffect(() => {
    document.title = `Atendimento ${bot.nome} · 21Go`
  }, [bot.nome])

  return (
    <BotCtx.Provider value={bot}>
      <div
        className="fixed inset-0 z-[9999] overflow-hidden text-[#E9ECF8] [font-family:var(--fonte-painel),system-ui,sans-serif]"
        style={FUNDO}
      >
        {usuario === null && <div className="grid h-full place-items-center text-sm text-white/50">carregando…</div>}
        {usuario === false && <Login aoEntrar={carregarEu} />}
        {typeof usuario === 'string' && <Mesa usuario={usuario} aoSair={() => setUsuario(false)} />}
      </div>
    </BotCtx.Provider>
  )
}
```

5. Login — substituir `  const [usuario, setU] = useState('')` por:

```tsx
  const bot = useBot()
  const [usuario, setU] = useState('')
```

e `ATENDIMENTO ISA</p>` por `ATENDIMENTO {bot.nome.toUpperCase()}</p>`.

6. Mesa — substituir `function Mesa({ usuario, aoSair }: { usuario: string; aoSair: () => void }) {` por:

```tsx
function Mesa({ usuario, aoSair }: { usuario: string; aoSair: () => void }) {
  const bot = useBot()
```

7. Cabeçalhos da Mesa e do Funil (`replace_all`, 2 ocorrências): `/> isa · {usuario}` → `/> {bot.nome.toLowerCase()} · {usuario}`.

8. Aba do bot: `{a.rotulo}` → `{a.id === 'isa' ? bot.nome : a.rotulo}`.

9. Filtro de etiquetas da Mesa: `{ETIQUETAS.map((e) => (` → `{bot.etiquetas.map((e) => (`.

10. Lista: `<Etiqueta tom="azul">no 4824</Etiqueta>` → `<Etiqueta tom="azul">no {bot.humano}</Etiqueta>`.

11. Conversa — substituir

```tsx
function Conversa({ telefone, aoVoltar, aoMudar }: { telefone: string; aoVoltar: () => void; aoMudar: () => void }) {
```

por:

```tsx
function Conversa({ telefone, aoVoltar, aoMudar }: { telefone: string; aoVoltar: () => void; aoMudar: () => void }) {
  const bot = useBot()
```

12. Chave liga/desliga — substituir

```tsx
              title={contato.ligada ? 'desligar a Isa neste contato' : 'ligar a Isa — ela lê a conversa inteira'}
```

por:

```tsx
              title={contato.ligada ? `desligar a ${bot.nome} neste contato` : `ligar a ${bot.nome} — ela lê a conversa inteira`}
```

e `isa {contato.ligada ? 'ligada' : 'off'}` por `{bot.nome.toLowerCase()} {contato.ligada ? 'ligada' : 'off'}`.

13. Transferir — substituir

```tsx
              onClick={() => confirm(`Transferir ${nome} pro 4824? Ele recebe o link com o resumo e a Isa desliga.`) && acao('/api/atendimento/transferir', {})}
```

por:

```tsx
              onClick={() => confirm(`Transferir ${nome} pro ${bot.humano}? Ele recebe o link com o resumo e a ${bot.nome} desliga.`) && acao('/api/atendimento/transferir', {})}
```

e `↪ 4824` por `↪ {bot.humano}`.

14. Etiquetas da conversa: `{ETIQUETAS.map((e) => {` → `{bot.etiquetas.map((e) => {`.

15. `a Isa prometeu retornar:` → `a {bot.nome} prometeu retornar:`.

16. Aviso da caixa de resposta — substituir

```tsx
            ? 'a Isa não manda nada por cima da sua mensagem. se o cliente responder, ela segue — pra atender sozinho, desligue a chave.'
            : 'Isa desligada: quem atende esta conversa é você.'}
```

por:

```tsx
            ? `a ${bot.nome} não manda nada por cima da sua mensagem. se o cliente responder, ela segue — pra atender sozinho, desligue a chave.`
            : `${bot.nome} desligada: quem atende esta conversa é você.`}
```

17. Citando: `citando.autor === 'isa' ? 'a Isa' : citando.autor` → `` citando.autor === 'isa' ? `a ${bot.nome}` : citando.autor ``.

18. Placeholder: `: 'responder pelo 98004-0964…'}` → `` : `responder pelo ${bot.numero}…`} ``.

19. Balão — substituir

```tsx
function Balao({ it, aoCitar, citado }: { it: ItemConversa; aoCitar?: () => void; citado?: ItemConversa }) {
```

por:

```tsx
function Balao({ it, aoCitar, citado }: { it: ItemConversa; aoCitar?: () => void; citado?: ItemConversa }) {
  const bot = useBot()
```

`{cliente ? 'cliente' : isa ? 'isa' : it.autor}` → `{cliente ? 'cliente' : isa ? bot.nome.toLowerCase() : it.autor}` e `citado.autor === 'isa' ? 'Isa' : citado.autor` → `citado.autor === 'isa' ? bot.nome : citado.autor`.

20. Evento — substituir

```tsx
function Evento({ it }: { it: ItemConversa }) {
```

por:

```tsx
function Evento({ it }: { it: ItemConversa }) {
  const bot = useBot()
```

e `{hora(it.em)} · {EVENTO[it.evento || ''] || it.evento}` por `{hora(it.em)} · {rotuloDoEvento(it.evento || '', bot)}`.

21. Funil — substituir

```tsx
  const [etapas, setEtapas] = useState<{ id: string; rotulo: string; cor: string }[]>([])
```

por:

```tsx
  const bot = useBot()
  const [etapas, setEtapas] = useState<{ id: string; rotulo: string; cor: string }[]>([])
```

22. Card — substituir `  const [editando, setEditando] = useState(false)` por:

```tsx
  const bot = useBot()
  const [editando, setEditando] = useState(false)
```

e `{c.ligada ? '' : ' · isa off'}` por `` {c.ligada ? '' : ` · ${bot.nome.toLowerCase()} off`} ``.

Conferir: Run: `grep -n "ETIQUETA_POR_ID\|ETIQUETAS\.map\|4824\|98004\|'Isa'\|\"Isa\|a Isa \|isa off\|isa ·\|ATENDIMENTO ISA" src/components/isa/PainelIsa.tsx`
Expected: só as linhas do mapa `EVENTO` (`'Isa pausou'`, `'transferido pro 4824'`, etc. — trocados em tempo de exibição por `rotuloDoEvento`), o comentário do topo e os `ETIQUETAS` de `BOT_PADRAO`.

- [ ] **Step 6: Rodar testes, typecheck e ver a tela**

Run: `npm run test:painel`
Expected: 0 falhas.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

Conferência visual (curl não valida tela — memória `feedback_curl_nao_valida_tela`): `npm run dev` e abrir `http://localhost:3000/painel` sem sessão; a tela de login tem que dizer "ATENDIMENTO ISA" e o título da aba "Atendimento Isa · 21Go" (sem `SUPABASE_DB_URL` local a mesa não carrega dados — só conferir login e título). Encerrar o dev server depois.

- [ ] **Step 7: Commit**

```bash
git add src/lib/isa/identidade.regras.ts src/app/api/atendimento/eu/route.ts src/app/api/atendimento/etiquetas/route.ts src/app/api/atendimento/funil/route.ts src/app/api/atendimento/contatos/route.ts src/lib/isa/painel-dados.ts src/components/isa/PainelIsa.tsx testes/isa/painel-mariana.test.ts
git commit -m "feat(mariana): painel recebe nome, numero, humano e etiquetas do servidor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: DDL do schema `mariana` (arquivo, sem executar)

**Files:**
- Create: `supabase/migrations/300_mariana_schema.sql`
- Test: `testes/isa/ddl-mariana.test.ts`

**Interfaces:**
- Consumes: `tabelasDoBot` (Task 1).
- Produces: arquivo SQL para a Fase 2 aplicar à mão via `DIRECT_URL`.

- [ ] **Step 1: Escrever o teste que falha**

Create `testes/isa/ddl-mariana.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tabelasDoBot } from '../../src/lib/isa/identidade.regras.ts'

const SQL = readFileSync(path.resolve(import.meta.dirname, '../../supabase/migrations/300_mariana_schema.sql'), 'utf8')
const tab = tabelasDoBot('mariana')
const tabelas = Object.values(tab)

test('cria as 5 tabelas do bot copiando o esquema vivo da Isa', () => {
  assert.match(SQL, /CREATE SCHEMA IF NOT EXISTS mariana;/)
  for (const t of tabelas) {
    const nome = t.split('.')[1]
    assert.match(SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${t.replace('.', '\\.')} \\(LIKE public\\.${nome} INCLUDING ALL\\);`), t)
  }
})

test('isa_eventos tem sequencia propria (nao divide o id com a Isa)', () => {
  assert.match(SQL, /CREATE SEQUENCE IF NOT EXISTS mariana\.isa_eventos_id_seq OWNED BY mariana\.isa_eventos\.id;/)
  assert.match(SQL, /ALTER TABLE mariana\.isa_eventos ALTER COLUMN id SET DEFAULT nextval\('mariana\.isa_eventos_id_seq'\);/)
})

test('RLS ligado e anon/authenticated sem acesso', () => {
  for (const t of tabelas) assert.match(SQL, new RegExp(`ALTER TABLE ${t.replace('.', '\\.')} ENABLE ROW LEVEL SECURITY;`), t)
  assert.match(SQL, /REVOKE ALL ON SCHEMA mariana FROM anon, authenticated;/)
  assert.match(SQL, /REVOKE ALL ON ALL TABLES IN SCHEMA mariana FROM anon, authenticated;/)
  assert.match(SQL, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA mariana FROM anon, authenticated;/)
})

test('so aditivo: nada que apaga ou altera o que ja existe', () => {
  const codigo = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(codigo, /\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i)
  assert.doesNotMatch(codigo, /ALTER TABLE public\./i)
})
```

Run: `node --test testes/isa/ddl-mariana.test.ts`
Expected: FAIL com `ENOENT` no arquivo SQL.

- [ ] **Step 2: Escrever a DDL**

Create `supabase/migrations/300_mariana_schema.sql`:

```sql
-- =============================================================================
-- 300_mariana_schema.sql
-- Banco da Mariana (a Isa do Gabriel Juliano, 21 96653-0011) — spec
-- docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md, secao 2.
--
-- NAO E APLICADA AUTOMATICAMENTE. Fase 2: aplicar a mao, uma vez, via DIRECT_URL,
-- depois de conferir que CRM e site estao 200. Nunca reset/push.
--
-- Aditiva: so cria o schema `mariana` e copias VAZIAS das tabelas por-bot da Isa.
-- `LIKE ... INCLUDING ALL` copia o esquema VIVO de producao (inclui as colunas
-- criadas fora das migracoes: resolvido_em, precisa_desde, visto_por, veiculo_doc),
-- defaults, PK e indices. conversations/messages/leads continuam em public,
-- separadas por evolution_instance = 'cloud_mariana'.
--
-- isa_eventos.id e bigserial: o INCLUDING DEFAULTS copiaria
-- nextval('public.isa_eventos_id_seq') e a Mariana gastaria a sequencia da Isa.
-- Por isso a sequencia propria logo abaixo.
--
-- RLS ligado e sem policy (so o servidor, pela conexao direta, le e escreve) e
-- nada pra anon/authenticated. O schema nao e exposto no PostgREST.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS mariana;
REVOKE ALL ON SCHEMA mariana FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS mariana.isa_contatos (LIKE public.isa_contatos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_eventos (LIKE public.isa_eventos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_config (LIKE public.isa_config INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.isa_promocoes (LIKE public.isa_promocoes INCLUDING ALL);
CREATE TABLE IF NOT EXISTS mariana.consultor_recrutamento (LIKE public.consultor_recrutamento INCLUDING ALL);

CREATE SEQUENCE IF NOT EXISTS mariana.isa_eventos_id_seq OWNED BY mariana.isa_eventos.id;
ALTER TABLE mariana.isa_eventos ALTER COLUMN id SET DEFAULT nextval('mariana.isa_eventos_id_seq');

ALTER TABLE mariana.isa_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.isa_promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariana.consultor_recrutamento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA mariana FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mariana FROM anon, authenticated;

COMMIT;

-- Conferencia depois de aplicar (so leitura):
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'mariana' ORDER BY 1;
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema = 'mariana' AND table_name = 'isa_eventos' AND column_name = 'id';
--   -> nextval('mariana.isa_eventos_id_seq'::regclass)
```

- [ ] **Step 3: Rodar o teste**

Run: `node --test testes/isa/ddl-mariana.test.ts`
Expected: PASS (4 testes).

Run: `npm run test:painel`
Expected: 0 falhas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/300_mariana_schema.sql testes/isa/ddl-mariana.test.ts
git commit -m "chore(mariana): DDL do schema mariana (aplicar a mao na fase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificação final da fase

**Files:** nenhum (só leitura; se algo falhar, voltar à tarefa responsável).

- [ ] **Step 1: Suíte inteira**

Run: `npm run test:painel 2>&1 | tail -8`
Expected: `fail 0`; `tests` = 342 + os novos (≈ 380).

- [ ] **Step 2: Os testes antigos não foram tocados**

Run: `git diff --name-status master -- testes | grep -v "^A"`
Expected: nenhuma linha (em `testes/` só há arquivos novos, nenhum modificado).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 4: Varredura de identidade fixa no fluxo do bot**

Run: `grep -rn "'cloud_isa'\|public\.isa_\|public\.consultor_recrutamento\|WDVMKnkq\|'isa_whatsapp'" src --include=*.ts --include=*.tsx | grep -v "identidade.regras.ts\|vigia-byd\|power-pipeline.regras.ts"`
Expected: nenhuma linha de código (pode sobrar comentário).

Run: `grep -rn "Leticya\|4824\|98004" src/lib/isa src/lib/consultor-recrutamento*.ts src/components/isa | grep -v "^\S*:\s*\(//\|\*\|/\*\)" | grep -v "identidade.regras.ts\|popup.regras.ts"`
Expected: só os padrões explícitos da Isa (`HUMANO_PADRAO`, `BOT_PADRAO`, `NUMERO_4824*`, `GABARITO_21GO = gabaritoDe({ nome: 'Leticya' ...`, `TELEFONE_DA_LETICYA`, o default `'da consultora Leticya Thayene'`, `NUMEROS_OFICIAIS`, o mapa `EVENTO` do painel e comentários de SQL). Qualquer outro achado é ponto esquecido.

- [ ] **Step 5: Build de produção local (o deploy da casa vai rodar isto)**

Run: `npm run build 2>&1 | tail -20`
Expected: build conclui ("Compiled successfully" / rotas listadas). O `prebuild` roda `scripts/verificar-consultor.mjs`; se ele exigir env que não existe local, registrar e seguir só com o `tsc`.

- [ ] **Step 6: Eval de 45 perguntas (se houver chave)**

Se `21go-website/.env.local` tiver `OPENROUTER_API_KEY`:

Run: `node --import ./scripts/isa-eval/loader.mjs scripts/isa-eval/rodar.ts`
Expected: o mesmo placar da Isa antes desta fase (rodar também em `master` para comparar, se não houver número registrado). Sem chave: registrar como pendência da Fase 2 (o critério da spec exige o mesmo placar).

- [ ] **Step 7: Nada saiu do worktree**

Run: `git status --short && git log --oneline master..HEAD`
Expected: árvore limpa (fora o inventário não versionado, se existir) e os commits das Tasks 1–11. **Sem push e sem deploy** — a publicação na casa é decisão do dono, com o protocolo da REGRA 0 (200 antes/depois e commit no `/var/log/blog-autodeploy.log`).

---

## Autorrevisão (feita ao escrever o plano)

**Cobertura da spec (seções 1, 2-código, 3, 4):**
- Identidade configurável com padrão Isa: Task 1 (+ guarda contra mistura). Funções `.regras.ts` por parâmetro: Tasks 2–4. Servidor a partir do env: `identidade.ts`.
- Schema `mariana` no SQL: Task 5 (`TAB`) + DDL na Task 11. `evolution_instance` pela identidade: Task 5 (webhook, store, gravações, consultas).
- `leads`: origem `mariana_whatsapp` e `trk` próprio (Task 6), `leadDoCliente` pela fonte do bot (Task 6), fonte do 5 min pela identidade com a mesma consulta na Isa (Task 6).
- Comportamento: transferência / "posso te ligar?" / BYD / supervisor (Tasks 3, 4, 7); etiquetas e funil (Task 2, 10); alertas e relatório com nome e link do painel do bot (Tasks 6, 7); PDF (Task 8); "Quero ser consultor" (Tasks 3, 7); fila do Power (Task 9); rótulo `por` (Task 7); `avisarCrm` (Task 5); `statusDoTemplate` na WABA do bot (Task 7).
- Só da casa: promoção 40% e vigia-BYD travados fora da casa (Task 7). Popup e `/api/wa` não mudam.
- Testes: os antigos intactos (Global Constraints, Task 12); variantes Mariana para dono, etiquetas, funil, prompt, venda, entrega, recrutamento, abordagem, validador, PDF, fila, painel, schema e DDL.

**Fora desta fase, de propósito:** `WA_WABA_ID` sem padrão em `atendimento/gastos/route.ts` (Fase 3); `sender: 'isa'` / `pausa_por: 'isa'` continuam como chave interna (o painel mostra o nome do bot); textos de alerta da promoção (`promocao.ts`) não mudam porque a promoção nunca roda fora da casa; o texto "leads dos .site" no relatório fica para a Fase 4, quando a Mariana tiver fonte de lead.

**Tipos conferidos entre tarefas:** `IDENTIDADE`/`TAB`/`ETIQUETAS_DO_BOT`/`FUNIL_DO_BOT` (identidade.ts); `HumanoDoBot`, `IdentidadeBot`, `leadsDoBot`, `atendimentoDoPdf`, `indicacaoDoBot`, `nomesDoCumprimento`, `painelDoBot`, `PainelBot` (identidade.regras.ts); `FunilDoBot`, `FUNIL_PADRAO`; `respostasProntas`/`RespostasProntas`; `numerosOficiais`; assinaturas com parâmetro opcional no fim em todas as funções antigas.
