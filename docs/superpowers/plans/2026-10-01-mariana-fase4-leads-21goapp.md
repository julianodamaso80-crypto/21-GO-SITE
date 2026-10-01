# Mariana Fase 4: leads do 21go.app (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todo lead que o site do Gabriel (21go.app) manda para `/api/parceiro/lead` passa a ser gravado também na nossa tabela `leads`, como o site da casa grava (placa → planos e preços do Power → PDF), com `dominio = '21go.app'`, sem `consultor_slug`, no Power do Gabriel (`XDmAbx6D`) e **sem uma segunda cotação no Power**. Com isso o 5 min e a retomada da Mariana (container dela) pegam esses leads, e a Isa nunca.

**Architecture:** a rota de parceiro continua criando UMA cotação no Power (como hoje) e respondendo o mesmo JSON; depois, fora do await, chama `gravarLeadDoParceiro`, que passa a placa pela MESMA consulta do site (`lookupPlate` de `src/lib/plate-lookup.ts`, sem as opções da Isa), lê o responsável da negociação (`responsavelNoPower`, extraída da rota da casa para um módulo compartilhado, comportamento idêntico) e grava com `upsertLead` (mesma função do site e da Isa). O mapeamento consulta → linha de `leads` é uma função pura (`src/lib/parceiro.regras.ts`), testada com `node --test`. A abordagem não muda uma linha: a identidade da Mariana já tem `fonte5min.dominios = ['21go.app']` e a da Isa só os `.site` da casa.

**Tech Stack:** Next.js 15 (App Router, runtime nodejs), TypeScript 5.9, Supabase (`upsertLead` em `src/lib/supabase-store.ts`), PowerCRM API, testes `node --test` com type stripping do Node 24 (`npm run test:painel`).

**Spec:** `docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md`, seção 5 ("Leads do 21go.app") e a Fase 4 da seção "Entrega em fases". Fase 1 (identidade: `LEADS_DE_PARCEIRO`, `leadsDoBot`/`leadEhDoBot`, `fonte5min`, `atendimentoDoPdf`) já está no ar; Mariana no ar em modo teste.

## Global Constraints

- **Casa intocada:** o comportamento de `src/app/api/vehicle/lead/route.ts` fica idêntico (a Tarefa 3 só troca a função local `responsavelNoPower` pelo import da mesma função, byte a byte no corpo). Nada do Gabriel vai para a casa: nem Power da Leticya (`WDVMKnkq`), nem número/chip da casa (4824, 98004-0964), nem botão da casa no PDF.
- **Uma cotação só no Power:** a de `/api/parceiro/lead`, como hoje. O lead gravado reaproveita `quotationCode`/`negotiationCode` dela. Nunca chamar `/api/quotation/add`, `criarPelaPipeline` nem `createLeadPowerCRM` no caminho novo.
- **Resposta da rota de parceiro inalterada:** `{ ok, quotationCode }` com 200/502, e 401/400/503 como hoje. A gravação no banco nunca muda a resposta nem atrasa (roda fora do await).
- **Marca do lead do parceiro:** `dominio = '21go.app'`, `origem = 'parceiro_21goapp'`, `consultor_slug = null`, `vendedor_slug = null`. A origem fica FORA de `ORIGENS_DA_FILA` (`src/lib/power-fila.regras.ts`): a fila da casa recadastraria um lead sem código no Power da Leticya.
- **Mesmas regras da Isa/site:** placa pela `lookupPlate(placa)` sem opções (regra do site: Power mudo → humano, nunca tabela local); veículo que não fazemos → `plano 'EXCLUIDO'`, `status/etapa 'excluido'`; consulta falhou ou sem placa → lead sem `cotacao_planos` (a abordagem exige `cotacao_planos IS NOT NULL`, então ninguém é abordado). BYD, `power_responsavel` de outro consultor, 8h–22h, 24 h, conversa em outro chip: as travas que já existem em `abordagem.ts` valem igual.
- **Banco:** só aditivo. Nenhuma coluna nova (as que o lead usa já existem: `dominio` — migração 295 —, `power_responsavel`, `cotacao_planos`). Nenhuma DDL nesta fase. Nunca `drizzle-kit push`, seed, reset ou UPDATE em massa.
- **Testes:** `npm run test:painel`. Nenhum teste existente é editado: variantes em arquivos NOVOS em `testes/parceiro/`. `.regras.ts` só com `import type` de módulos de servidor (o `node --test` importa o arquivo direto, sem o resolvedor do Next; `import type` é apagado pelo type stripping).
- **Typecheck:** `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"` não imprime nada (os 10 erros antigos são só nesses dois arquivos). `npm run lint` não está configurado: não rodar.
- **Modo teste:** a Mariana está com `ISA_MODO_TESTE` ligado; só a allowlist (dono 5521992208062 e Gabriel 5521990954964) recebe mensagem. **Produção (modo teste desligado) só quando o dono mandar** — fora deste plano.
- **Commits:** em português, `tipo(escopo): descrição`, com dois `-m`, o segundo exatamente `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Só os arquivos da tarefa.
- **Estilo:** comentários em português sem acento, como no resto de `src/lib/`; diffs cirúrgicos; sem refatorar vizinho.
- **Diretório de trabalho:** todos os comandos de código rodam em `C:/Users/damas/Documents/PROJETOS/21 GO/wt-mariana-f4/21go-website` (o app Next). O worktree não tem `node_modules`: rodar `npm ci` uma vez antes da Tarefa 1 (sem ele, os 2 testes de `testes/isa/pdf-mariana.test.ts` falham por dependência ausente; com ele, a linha de base é 419 testes, 0 falhas).

---

## Mapa de arquivos

**Novos**
- `src/lib/parceiro.regras.ts` — puro: cadastro dos parceiros (`PARCEIROS`, com `dominio` e `origem`), `parceiroAutorizado`, `placaDoCorpo`, `fipeInformado`, `planoDeReferencia`, `consultaDaPlaca` (resultado de `lookupPlate` → cotado / não fazemos / humano) e `leadDoParceiro` (monta o `UpsertLeadInput`).
- `src/lib/power-responsavel.ts` — servidor: `responsavelNoPower`, movida da rota da casa sem mudar o corpo.
- `src/lib/parceiro-lead.ts` — servidor: `gravarLeadDoParceiro` (lookupPlate → responsavelNoPower → upsertLead).
- `testes/parceiro/lead.test.ts` — regras puras do lead do parceiro.
- `testes/parceiro/fonte.test.ts` — guarda: lead do 21go.app é da Mariana, nunca da Isa; PDF com o Gabriel; fora da fila da casa; vigia-BYD da casa não o vê.

**Modificados**
- `src/app/api/parceiro/lead/route.ts` — usa `parceiroAutorizado`, lê também o `negotiationCode` e dispara `gravarLeadDoParceiro` depois da cotação (resposta igual).
- `src/app/api/vehicle/lead/route.ts` — só troca a `responsavelNoPower` local pelo import (Tarefa 3).
- `src/app/api/cron/vigia-byd/route.ts` — deixa de fora `leads.dominio` de parceiro (senão a casa alertaria "BYD sem mensagem do 4824" por um lead do Gabriel).

**Ordem:** 1 → 2 → 3 → 4 → 5. A 2 importa o arquivo criado na 1; a 4 importa os da 1 e da 3.

---

### Task 1: Regras puras do lead do parceiro

**Files:**
- Create: `src/lib/parceiro.regras.ts`
- Test: `testes/parceiro/lead.test.ts`

**Interfaces:**
- Consumes: tipos `UpsertLeadInput` (`src/lib/supabase-store.ts`), `PlateResponse` e `PlateErrorResponse` (`src/lib/plate-lookup.ts`) — só `import type`.
- Produces (em `src/lib/parceiro.regras.ts`):
  - `interface Parceiro { chave: string; nome: string; powerlink: string; dominio: string; origem: string }`
  - `const PARCEIROS: Record<string, Parceiro>` — `'21goapp'` → `{ chave: '1f31905505bc033c80c4361c0dda6ae7', nome: 'Gabriel Juliano', powerlink: 'XDmAbx6D', dominio: '21go.app', origem: 'parceiro_21goapp' }`
  - `function parceiroAutorizado(id: unknown, chave: unknown): Parceiro | null`
  - `function placaDoCorpo(v: unknown): string | null` — 7 caracteres A-Z0-9 maiúsculos, senão null
  - `function fipeInformado(v: unknown): number | null` — número finito > 0, senão null
  - `interface PlanoDaTela { id: string; name: string; monthly: number; popular: boolean }`
  - `function planoDeReferencia(planos: readonly PlanoDaTela[]): PlanoDaTela | null`
  - `type ConsultaDaPlaca = { tipo: 'cotado'; veiculo: { marca: string; modelo: string; ano: string; fipeValue: number; fipeCode: string }; planos: PlanoDaTela[] } | { tipo: 'nao_fazemos'; motivo: string } | { tipo: 'humano' }`
  - `function consultaDaPlaca(r: PlateResponse | PlateErrorResponse | null): ConsultaDaPlaca`
  - `interface DadosDoLeadDoParceiro { parceiro: Parceiro; trk: string; nome: string; telefone: string; placa: string | null; valorFipeInformado: number | null; consulta: ConsultaDaPlaca; quotationCode: string | null; negotiationCode: string | null; powerResponsavel: string | null; ip: string | null; userAgent: string | null; referer: string | null }`
  - `function leadDoParceiro(d: DadosDoLeadDoParceiro): UpsertLeadInput`

- [ ] **Step 0: Instalar as dependências do worktree (uma vez)**

Run: `npm ci`
Expected: termina sem erro; `node_modules/` criado.

Run: `npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected:
```
ℹ tests 419
ℹ pass 419
ℹ fail 0
```

- [ ] **Step 1: Escrever o teste que falha**

Create `testes/parceiro/lead.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PARCEIROS,
  parceiroAutorizado,
  placaDoCorpo,
  fipeInformado,
  planoDeReferencia,
  consultaDaPlaca,
  leadDoParceiro,
} from '../../src/lib/parceiro.regras.ts'

/*
 * O lead que o 21go.app manda tem que nascer no nosso banco igual ao do site da casa (spec da
 * Mariana, secao 5), so que com o dominio e o Power do Gabriel.
 */

const COTADO = {
  success: true as const,
  vehicle: {
    marca: 'CHEVROLET',
    modelo: 'ONIX PLUS 1.0',
    ano: '2020',
    cor: 'PRATA',
    fipeValue: 68000,
    fipeCode: '004470-1',
    categoria: 'AUTOMOVEL',
    combustivel: 'FLEX',
  },
  plans: [
    { id: 'basico' as const, name: 'Básico', monthly: 150.5 },
    { id: 'vip' as const, name: 'VIP', monthly: 199.9, popular: true },
  ],
  fipe_source: 'apibrasil' as const,
  _internal: { mdl: 1, mdlYr: 2, cityId: 3, pcVehicle: { chassi: 'X' } },
}

const BASE = {
  parceiro: PARCEIROS['21goapp'],
  trk: 'a1b2c3d4e5f6a7b8',
  nome: 'Ana Paula',
  telefone: '21999998888',
  placa: 'ABC1D23',
  valorFipeInformado: 70000,
  quotationCode: 'Q123',
  negotiationCode: 'N456',
  powerResponsavel: 'XDmAbx6D',
  ip: '1.2.3.4',
  userAgent: 'node',
  referer: null,
}

test('21go.app: Power do Gabriel, dominio 21go.app e origem propria', () => {
  assert.deepEqual(
    { ...PARCEIROS['21goapp'] },
    {
      chave: '1f31905505bc033c80c4361c0dda6ae7',
      nome: 'Gabriel Juliano',
      powerlink: 'XDmAbx6D',
      dominio: '21go.app',
      origem: 'parceiro_21goapp',
    },
  )
})

test('so entra parceiro cadastrado, com a chave dele', () => {
  assert.equal(parceiroAutorizado('21goapp', '1f31905505bc033c80c4361c0dda6ae7'), PARCEIROS['21goapp'])
  assert.equal(parceiroAutorizado('21goapp', 'errada'), null)
  assert.equal(parceiroAutorizado('21goapp', undefined), null)
  assert.equal(parceiroAutorizado(undefined, undefined), null)
  // Chave herdada do Object nao e parceiro: antes, PARCEIROS['toString'] sem chave passava.
  for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.equal(parceiroAutorizado(k, undefined), null, k)
  }
})

test('placa e FIPE do corpo: so o que da pra usar', () => {
  assert.equal(placaDoCorpo('abc-1d23'), 'ABC1D23')
  for (const v of ['abc12', '', 12, null, undefined]) assert.equal(placaDoCorpo(v), null, String(v))
  assert.equal(fipeInformado(68000), 68000)
  for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '68000', null, undefined]) {
    assert.equal(fipeInformado(v), null, String(v))
  }
})

test('plano de referencia: o popular, senao o primeiro (como a tela abre)', () => {
  const a = { id: 'basico', name: 'Básico', monthly: 1, popular: false }
  const b = { id: 'vip', name: 'VIP', monthly: 2, popular: true }
  assert.equal(planoDeReferencia([a, b]), b)
  assert.equal(planoDeReferencia([a, { ...b, popular: false }]), a)
  assert.equal(planoDeReferencia([]), null)
})

test('consulta da placa: cotado so com plano, e sem os internos do Power', () => {
  assert.deepEqual(consultaDaPlaca(COTADO), {
    tipo: 'cotado',
    veiculo: { marca: 'CHEVROLET', modelo: 'ONIX PLUS 1.0', ano: '2020', fipeValue: 68000, fipeCode: '004470-1' },
    planos: [
      { id: 'basico', name: 'Básico', monthly: 150.5, popular: false },
      { id: 'vip', name: 'VIP', monthly: 199.9, popular: true },
    ],
  })
  assert.deepEqual(consultaDaPlaca({ ...COTADO, plans: [] }), { tipo: 'humano' })
  assert.deepEqual(consultaDaPlaca({ success: false, excluded: true, reason: 'ano', error: 'x' }), {
    tipo: 'nao_fazemos',
    motivo: 'ano',
  })
  assert.deepEqual(consultaDaPlaca({ success: false, excluded: true, error: 'x' }), { tipo: 'nao_fazemos', motivo: 'model' })
  assert.deepEqual(consultaDaPlaca({ success: false, requires_human_support: true, error: 'x' }), { tipo: 'humano' })
  assert.deepEqual(consultaDaPlaca(null), { tipo: 'humano' })
})

test('lead cotado: igual ao do site da casa, com o dominio e o Power do parceiro', () => {
  const l = leadDoParceiro({ ...BASE, consulta: consultaDaPlaca(COTADO) })
  assert.equal(l.trk, 'a1b2c3d4e5f6a7b8')
  assert.equal(l.nome, 'Ana Paula')
  assert.equal(l.telefone, '21999998888')
  assert.equal(l.placa, 'ABC1D23')
  assert.equal(l.dominio, '21go.app')
  assert.equal(l.origem, 'parceiro_21goapp')
  assert.equal(l.consultor_slug, null)
  assert.equal(l.vendedor_slug, null)
  assert.equal(l.marca, 'CHEVROLET')
  assert.equal(l.modelo, 'ONIX PLUS 1.0')
  assert.equal(l.ano_modelo, 2020)
  assert.equal(l.ano_fabricacao, 2020)
  assert.equal(l.fipe_codigo, '004470-1')
  // a FIPE da consulta vence a que o site do parceiro mandou
  assert.equal(l.valor_fipe, 68000)
  assert.equal(l.plano, 'VIP')
  assert.equal(l.valor_mensal, 199.9)
  assert.deepEqual(l.planos, [
    { id: 'basico', name: 'Básico', monthly: 150.5, popular: false },
    { id: 'vip', name: 'VIP', monthly: 199.9, popular: true },
  ])
  assert.equal(l.quotation_code, 'Q123')
  assert.equal(l.negotiation_code, 'N456')
  assert.equal(l.power_responsavel, 'XDmAbx6D')
  assert.equal(l.etapa_funil, 'cotacao_enviada')
  assert.equal(l.status, 'lead')
  assert.equal(l.leilao, null)
  assert.equal(l.carro_app, false)
  assert.equal(l.ip_address, '1.2.3.4')
  assert.equal(l.user_agent, 'node')
})

test('veiculo que nao fazemos: EXCLUIDO, sem planos (ninguem aborda)', () => {
  const l = leadDoParceiro({ ...BASE, consulta: { tipo: 'nao_fazemos', motivo: 'ano' } })
  assert.equal(l.plano, 'EXCLUIDO')
  assert.equal(l.planos, null)
  assert.equal(l.valor_mensal, null)
  assert.equal(l.etapa_funil, 'excluido')
  assert.equal(l.status, 'excluido')
  assert.equal(l.marca, null)
  assert.equal(l.valor_fipe, 70000)
  assert.equal(l.dominio, '21go.app')
  assert.equal(l.quotation_code, 'Q123')
})

test('consulta falhou ou sem placa: lead sem planos, como o atendimento humano do site', () => {
  const l = leadDoParceiro({ ...BASE, placa: null, valorFipeInformado: null, quotationCode: null, negotiationCode: null, consulta: { tipo: 'humano' } })
  assert.equal(l.plano, null)
  assert.equal(l.planos, null)
  assert.equal(l.valor_mensal, null)
  assert.equal(l.valor_fipe, null)
  assert.equal(l.placa, null)
  assert.equal(l.etapa_funil, 'cotacao_enviada')
  assert.equal(l.status, 'lead')
  assert.equal(l.quotation_code, null)
  assert.equal(l.dominio, '21go.app')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/parceiro/lead.test.ts`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (`src/lib/parceiro.regras.ts` não existe).

- [ ] **Step 3: Implementar**

Create `src/lib/parceiro.regras.ts`:

```ts
/**
 * Sites de parceiro (hoje so o 21go.app, do consultor Gabriel Juliano): quem pode bater em
 * /api/parceiro/lead e como o lead que eles mandam vira uma linha de `leads` igual a do site da
 * casa (spec da Mariana, secao 5).
 *
 * Logica pura, sem process.env: os testes importam este arquivo direto. So `import type` aqui.
 */
import type { UpsertLeadInput } from './supabase-store'
import type { PlateErrorResponse, PlateResponse } from './plate-lookup'

export interface Parceiro {
  chave: string
  nome: string
  /** slsmnNwId no Power: e ele que atribui a cotacao ao consultor */
  powerlink: string
  /** leads.dominio: por ele a Mariana acha o lead (fonte5min) e a Isa o deixa de fora (LEADS_DE_PARCEIRO) */
  dominio: string
  /**
   * leads.origem. Fica FORA da fila do Power da casa (power-fila.regras): ela recadastraria um
   * lead sem codigo no Power da Leticya.
   */
  origem: string
}

/**
 * Quem pode usar esta porta. A chave fica no codigo (dos dois lados) de
 * proposito: o parceiro nao sabe mexer em variavel de ambiente da hospedagem
 * dele, e exigir isso trocaria uma barreira de verdade por um site que nunca
 * entra no ar. O que a chave protege e pequeno — permite criar cotacao no funil
 * do proprio parceiro, nada alem — e some com um deploy nosso.
 */
export const PARCEIROS: Record<string, Parceiro> = {
  '21goapp': {
    chave: '1f31905505bc033c80c4361c0dda6ae7',
    nome: 'Gabriel Juliano',
    powerlink: 'XDmAbx6D',
    dominio: '21go.app',
    origem: 'parceiro_21goapp',
  },
}

/** Parceiro cadastrado (nunca chave herdada do Object, como 'toString') e com a chave dele. */
export function parceiroAutorizado(id: unknown, chave: unknown): Parceiro | null {
  if (typeof id !== 'string' || typeof chave !== 'string' || !Object.hasOwn(PARCEIROS, id)) return null
  const p = PARCEIROS[id]
  return p.chave === chave ? p : null
}

export function placaDoCorpo(v: unknown): string | null {
  const p = typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  return p.length === 7 ? p : null
}

export function fipeInformado(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/** O que a tela do site manda em `planos` (cotacao/page.tsx): o que o Power deu, sem mais nada. */
export interface PlanoDaTela {
  id: string
  name: string
  monthly: number
  popular: boolean
}

/** O plano que a tela abre selecionado: o popular, senao o primeiro (cotacao/page.tsx). */
export function planoDeReferencia(planos: readonly PlanoDaTela[]): PlanoDaTela | null {
  return planos.find((p) => p.popular) ?? planos[0] ?? null
}

export type ConsultaDaPlaca =
  | {
      tipo: 'cotado'
      veiculo: { marca: string; modelo: string; ano: string; fipeValue: number; fipeCode: string }
      planos: PlanoDaTela[]
    }
  | { tipo: 'nao_fazemos'; motivo: string }
  | { tipo: 'humano' }

/** Resultado do lookupPlate (a consulta do site) no que importa pro lead. */
export function consultaDaPlaca(r: PlateResponse | PlateErrorResponse | null): ConsultaDaPlaca {
  if (!r) return { tipo: 'humano' }
  if (!r.success) return r.excluded ? { tipo: 'nao_fazemos', motivo: r.reason ?? 'model' } : { tipo: 'humano' }
  if (r.plans.length === 0) return { tipo: 'humano' }
  const v = r.vehicle
  return {
    tipo: 'cotado',
    veiculo: { marca: v.marca, modelo: v.modelo, ano: v.ano, fipeValue: v.fipeValue, fipeCode: v.fipeCode },
    planos: r.plans.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly, popular: !!p.popular })),
  }
}

export interface DadosDoLeadDoParceiro {
  parceiro: Parceiro
  trk: string
  nome: string
  telefone: string
  placa: string | null
  valorFipeInformado: number | null
  consulta: ConsultaDaPlaca
  quotationCode: string | null
  negotiationCode: string | null
  powerResponsavel: string | null
  ip: string | null
  userAgent: string | null
  referer: string | null
}

const anoDe = (s: string): number | null => {
  const m = s.match(/(\d{4})/)
  return m ? Number(m[1]) : null
}

/**
 * A linha de `leads`, campo a campo como o persistLeadInSupabase do site grava (vehicle/lead):
 * cotado = planos do Power + o de referencia; nao fazemos = EXCLUIDO; consulta falhou = sem planos,
 * como o atendimento humano do site. O que o 21go.app nao pergunta (leilao, aplicativo, e-mail)
 * fica vazio. Sem consultor_slug: o dono do lead e o dominio do parceiro.
 */
export function leadDoParceiro(d: DadosDoLeadDoParceiro): UpsertLeadInput {
  const cotado = d.consulta.tipo === 'cotado' ? d.consulta : null
  const excluido = d.consulta.tipo === 'nao_fazemos'
  const ref = cotado ? planoDeReferencia(cotado.planos) : null
  const ano = cotado ? anoDe(cotado.veiculo.ano) : null
  return {
    trk: d.trk,
    nome: d.nome,
    telefone: d.telefone,
    email: null,
    cpf: null,
    placa: d.placa,
    marca: cotado?.veiculo.marca ?? null,
    modelo: cotado?.veiculo.modelo ?? null,
    ano_modelo: ano,
    ano_fabricacao: ano,
    fipe_codigo: cotado?.veiculo.fipeCode || null,
    valor_fipe: cotado?.veiculo.fipeValue ?? d.valorFipeInformado,
    plano: excluido ? 'EXCLUIDO' : (ref?.name ?? null),
    valor_mensal: ref?.monthly ?? null,
    planos: cotado ? cotado.planos : null,
    carro_app: false,
    leilao: null,
    origem: d.parceiro.origem,
    consultor_slug: null,
    vendedor_slug: null,
    dominio: d.parceiro.dominio,
    power_responsavel: d.powerResponsavel,
    quotation_code: d.quotationCode,
    negotiation_code: d.negotiationCode,
    powercrm_payload: {
      ok: Boolean(d.quotationCode),
      quotationCode: d.quotationCode,
      negotiationCode: d.negotiationCode,
      parceiro: d.parceiro.nome,
    },
    referrer: d.referer,
    ip_address: d.ip,
    user_agent: d.userAgent,
    etapa_funil: excluido ? 'excluido' : 'cotacao_enviada',
    status: excluido ? 'excluido' : 'lead',
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test testes/parceiro/lead.test.ts`
Expected: PASS, 8 testes, 0 falhas.

Run: `npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `ℹ tests 427`, `ℹ pass 427`, `ℹ fail 0`.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parceiro.regras.ts testes/parceiro/lead.test.ts
git commit -m "feat(parceiro): regras do lead do 21go.app gravado como o do site" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guarda — o lead do 21go.app é da Mariana, nunca da casa (e vigia-BYD da casa)

**Files:**
- Modify: `src/app/api/cron/vigia-byd/route.ts` (import no topo e o SELECT de `leads`, linhas ~1-6 e ~45-62)
- Test: `testes/parceiro/fonte.test.ts`

**Interfaces:**
- Consumes: `PARCEIROS` (Tarefa 1); `IDENTIDADE_ISA`, `LEADS_DE_PARCEIRO`, `leadEhDoBot`, `atendimentoDoPdf` (`src/lib/isa/identidade.regras.ts`, Fase 1); `leadPrecisaDoPower` (`src/lib/power-fila.regras.ts`); `MARIANA` (`testes/isa/_mariana.ts`).
- Produces: nada novo; o SELECT do vigia-BYD passa a receber `$2 = [...LEADS_DE_PARCEIRO.dominios]`.

- [ ] **Step 1: Escrever o teste**

Create `testes/parceiro/fonte.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PARCEIROS } from '../../src/lib/parceiro.regras.ts'
import { IDENTIDADE_ISA, LEADS_DE_PARCEIRO, leadEhDoBot, atendimentoDoPdf } from '../../src/lib/isa/identidade.regras.ts'
import { leadPrecisaDoPower } from '../../src/lib/power-fila.regras.ts'
import { MARIANA } from '../isa/_mariana.ts'

/*
 * O que impede o lead do 21go.app de vazar pra casa: a Isa nao o ve, o PDF sai com o Gabriel em
 * qualquer host, a fila do Power da casa nao o recadastra no Power da Leticya e o vigia-BYD da casa
 * nao alerta por ele.
 */

const P = PARCEIROS['21goapp']
const lead = { origem: P.origem, dominio: P.dominio }

test('o lead do 21go.app e da Mariana e nunca da Isa', () => {
  assert.equal(leadEhDoBot(lead, MARIANA), true)
  assert.equal(leadEhDoBot(lead, IDENTIDADE_ISA), false)
  assert.ok(MARIANA.fonte5min.dominios.includes(P.dominio))
  assert.ok(!IDENTIDADE_ISA.fonte5min.dominios.includes(P.dominio))
  assert.ok(LEADS_DE_PARCEIRO.dominios.includes(P.dominio))
  assert.equal(P.powerlink, MARIANA.powerlink)
})

test('PDF do lead do 21go.app sai com o Gabriel, aberto pelo host da casa ou da Mariana', () => {
  const gabriel = { nome: 'Gabriel Juliano', whatsappUrl: 'https://wa.me/5521990954964' }
  assert.deepEqual(atendimentoDoPdf(lead, MARIANA), gabriel)
  assert.deepEqual(atendimentoDoPdf(lead, IDENTIDADE_ISA), gabriel)
})

test('lead do 21go.app sem codigo do Power nunca entra na fila da casa (Power da Leticya)', () => {
  const l = { origem: P.origem, status: 'lead', quotation_code: null, negotiation_code: null, created_at: '2026-10-01T14:00:00Z' }
  assert.equal(leadPrecisaDoPower(l, new Date('2026-10-01T15:00:00Z')), false)
})

test('vigia-BYD da casa deixa de fora o lead de site de parceiro', () => {
  const src = readFileSync(new URL('../../src/app/api/cron/vigia-byd/route.ts', import.meta.url), 'utf8')
  assert.match(src, /AND NOT \(l\.dominio = ANY\(\$2::text\[\]\)\)/)
  assert.match(src, /\[instancia, \[\.\.\.LEADS_DE_PARCEIRO\.dominios\]\]/)
})
```

- [ ] **Step 2: Rodar e ver falhar só o do vigia**

Run: `node --test testes/parceiro/fonte.test.ts`
Expected: 3 PASS e 1 FAIL — `vigia-BYD da casa deixa de fora o lead de site de parceiro` (AssertionError: the input did not match the regular expression).

- [ ] **Step 3: Implementar no vigia-BYD**

Em `src/app/api/cron/vigia-byd/route.ts`, trocar o import:

```ts
import { IDENTIDADE } from '@/lib/isa/identidade'
```

por:

```ts
import { IDENTIDADE } from '@/lib/isa/identidade'
import { LEADS_DE_PARCEIRO } from '@/lib/isa/identidade.regras'
```

e, no SELECT, trocar:

```ts
        WHERE l.marca_interesse ILIKE 'BYD%' AND l.consultor_slug IS NULL AND l.dominio IS NOT NULL
          AND coalesce(l.status, '') <> 'excluido'
```

por:

```ts
        WHERE l.marca_interesse ILIKE 'BYD%' AND l.consultor_slug IS NULL AND l.dominio IS NOT NULL
          -- site de parceiro (21go.app, do Gabriel) nao passa pelo 4824: nao e BYD sem envio da casa
          AND NOT (l.dominio = ANY($2::text[]))
          AND coalesce(l.status, '') <> 'excluido'
```

e o array de parâmetros do mesmo `sql<Linha>(...)`:

```ts
      [instancia],
    )
    if (leads.length === 0) return NextResponse.json({ ok: true, avisados: 0 })
```

por:

```ts
      [instancia, [...LEADS_DE_PARCEIRO.dominios]],
    )
    if (leads.length === 0) return NextResponse.json({ ok: true, avisados: 0 })
```

(O outro `[instancia]` do arquivo, no `SELECT max(created_at)`, fica como está.)

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test testes/parceiro/fonte.test.ts`
Expected: PASS, 4 testes, 0 falhas.

Run: `npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `ℹ tests 431`, `ℹ pass 431`, `ℹ fail 0`.

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/vigia-byd/route.ts testes/parceiro/fonte.test.ts
git commit -m "fix(vigia-byd): lead de site de parceiro fica fora do alerta do 4824" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `responsavelNoPower` vira módulo compartilhado (casa sem mudança)

**Files:**
- Create: `src/lib/power-responsavel.ts`
- Modify: `src/app/api/vehicle/lead/route.ts:2` (import) e `:1396-1408` (a função local sai)

**Interfaces:**
- Consumes: `getNegotiation(negotiationCode: string, leadAttributionId: string | null): Promise<{ ok: boolean; statusCode: number; raw: unknown; error?: string }>` de `src/lib/powercrm.ts`.
- Produces: `responsavelNoPower(negotiationCode: string | undefined, leadId: string): Promise<string | null>` em `src/lib/power-responsavel.ts` — mesmo corpo da função que existia na rota da casa (inclusive o log `[lead] responsavel no Power nao lido:`).

Refatoração sem mudança de comportamento: a verificação é o typecheck, a suíte inteira e os greps abaixo (a função faz `fetch` no Power e grava log no Supabase — não tem teste unitário, como na rota de origem).

- [ ] **Step 0: Anotar os erros antigos de tipo da rota da casa**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -c "vehicle/lead/route.ts"`
Expected: um número N (os erros que já existiam). Anotar N.

- [ ] **Step 1: Criar o módulo**

Create `src/lib/power-responsavel.ts`:

```ts
import 'server-only'
import { getNegotiation } from '@/lib/powercrm'

/**
 * responsibleId da negociacao no Power; null se nao deu pra ler (nunca segura o lead por isso).
 *
 * Placa presa com outro consultor (dono, 14/09/2026): o Power cria a cotacao, mas a negociacao
 * nasce com o responsibleId dele, e a mensagem dos 5 min (Isa e Mariana) le esta coluna. Usada
 * pelo site da casa (vehicle/lead) e pelo site de parceiro (parceiro/lead). Movida de
 * vehicle/lead/route.ts sem mudar nada.
 */
export async function responsavelNoPower(negotiationCode: string | undefined, leadId: string): Promise<string | null> {
  if (!negotiationCode || !process.env.POWERAPI_TOKEN) return null
  try {
    const r = await getNegotiation(negotiationCode, leadId)
    const raw = r.raw as { responsibleId?: unknown } | null | undefined
    const id = typeof raw?.responsibleId === 'string' ? raw.responsibleId.trim() : ''
    return id || null
  } catch (err) {
    console.warn('[lead] responsavel no Power nao lido:', err instanceof Error ? err.message : err)
    return null
  }
}
```

- [ ] **Step 2: Trocar a função local pelo import na rota da casa**

Em `src/app/api/vehicle/lead/route.ts`, linha 2, trocar:

```ts
import { getNegotiation } from '@/lib/powercrm'
```

por:

```ts
import { responsavelNoPower } from '@/lib/power-responsavel'
```

e apagar o bloco do fim do arquivo (linhas 1396-1408), inclusive a linha em branco antes dele:

```ts

/** responsibleId da negociacao no Power; null se nao deu pra ler (nunca segura o lead por isso). */
async function responsavelNoPower(negotiationCode: string | undefined, leadId: string): Promise<string | null> {
  if (!negotiationCode || !POWERAPI_TOKEN) return null
  try {
    const r = await getNegotiation(negotiationCode, leadId)
    const raw = r.raw as { responsibleId?: unknown } | null | undefined
    const id = typeof raw?.responsibleId === 'string' ? raw.responsibleId.trim() : ''
    return id || null
  } catch (err) {
    console.warn('[lead] responsavel no Power nao lido:', err instanceof Error ? err.message : err)
    return null
  }
}
```

(`getNegotiation` não tem outro uso na rota; o `POWERAPI_TOKEN` da rota é o mesmo `process.env.POWERAPI_TOKEN`, lido no carregamento.)

- [ ] **Step 3: Conferir que a casa ficou igual**

Run: `grep -n "responsavelNoPower\|getNegotiation" src/app/api/vehicle/lead/route.ts`
Expected (exatamente 2 linhas):
```
2:import { responsavelNoPower } from '@/lib/power-responsavel'
313:  const powerResponsavel = await responsavelNoPower('negotiationCode' in powercrm ? powercrm.negotiationCode : undefined, leadId)
```

Run: `git diff --numstat`
Expected: `1	15	21go-website/src/app/api/vehicle/lead/route.ts` (a linha do import trocada e as 14 do bloco apagadas); o arquivo novo fica fora do diff (untracked).

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -c "vehicle/lead/route.ts"`
Expected: o mesmo N do Step 0 (nenhum erro novo na rota).

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

Run: `npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `ℹ tests 431`, `ℹ pass 431`, `ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/power-responsavel.ts src/app/api/vehicle/lead/route.ts
git commit -m "refactor(lead): responsavelNoPower vira modulo compartilhado, sem mudar a casa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gravar o lead do 21go.app na rota de parceiro

**Files:**
- Create: `src/lib/parceiro-lead.ts`
- Modify: `src/app/api/parceiro/lead/route.ts` (arquivo inteiro, 102 linhas)

**Interfaces:**
- Consumes: `lookupPlate(placa: string, opcoes?: OpcoesLookupIsa)` (`src/lib/plate-lookup.ts`); `upsertLead(input: UpsertLeadInput): Promise<{ id: string; created: boolean }>` (`src/lib/supabase-store.ts`); `responsavelNoPower` (Tarefa 3); `type RequestContext` e `getRequestContext(req)` (`src/lib/request-context.ts`); `parceiroAutorizado`, `placaDoCorpo`, `fipeInformado`, `consultaDaPlaca`, `leadDoParceiro`, `type Parceiro`, `type ConsultaDaPlaca` (Tarefa 1).
- Produces: `gravarLeadDoParceiro(a: { parceiro: Parceiro; nome: string; telefone: string; placa: unknown; valorFipe: unknown; quotationCode: string | null; negotiationCode: string | null; ctx: RequestContext }): Promise<{ leadId: string; consulta: ConsultaDaPlaca['tipo'] }>` em `src/lib/parceiro-lead.ts`.

As peças puras já estão testadas (Tarefas 1 e 2). Esta tarefa é fiação de servidor (Power, Supabase): verificação por typecheck, suíte e grep aqui; o teste de ponta a ponta é na Tarefa 5, em modo teste.

- [ ] **Step 1: Criar o módulo de servidor**

Create `src/lib/parceiro-lead.ts`:

```ts
import 'server-only'
import crypto from 'crypto'
import { lookupPlate } from '@/lib/plate-lookup'
import { upsertLead } from '@/lib/supabase-store'
import { responsavelNoPower } from '@/lib/power-responsavel'
import type { RequestContext } from '@/lib/request-context'
import {
  consultaDaPlaca,
  fipeInformado,
  leadDoParceiro,
  placaDoCorpo,
  type ConsultaDaPlaca,
  type Parceiro,
} from '@/lib/parceiro.regras'

/**
 * Grava no nosso banco o lead que o site do parceiro mandou, como o site da casa grava (spec da
 * Mariana, secao 5): a placa passa pela MESMA consulta do site (lookupPlate: Power /plates/ ->
 * FIPE -> planos e precos do Power, sem as opcoes da Isa) e o lead nasce com o dominio do
 * parceiro. E por ele que a Mariana acha o cliente (5 min e retomada) e a Isa o deixa de fora.
 *
 * NAO cria cotacao no Power: a rota ja criou a do parceiro e passa os codigos dela.
 */
export async function gravarLeadDoParceiro(a: {
  parceiro: Parceiro
  nome: string
  telefone: string
  placa: unknown
  valorFipe: unknown
  quotationCode: string | null
  negotiationCode: string | null
  ctx: RequestContext
}): Promise<{ leadId: string; consulta: ConsultaDaPlaca['tipo'] }> {
  const trk = crypto.randomBytes(8).toString('hex')
  const placa = placaDoCorpo(a.placa)
  const r = placa ? await lookupPlate(placa).catch(() => null) : null
  const consulta = consultaDaPlaca(r)
  // Placa presa com outro consultor: a negociacao nasce no nome dele e a Mariana nao aborda.
  const powerResponsavel = await responsavelNoPower(a.negotiationCode ?? undefined, `lead_${trk}`)
  const { id } = await upsertLead(
    leadDoParceiro({
      parceiro: a.parceiro,
      trk,
      nome: a.nome,
      telefone: a.telefone,
      placa,
      valorFipeInformado: fipeInformado(a.valorFipe),
      consulta,
      quotationCode: a.quotationCode,
      negotiationCode: a.negotiationCode,
      powerResponsavel,
      ip: a.ctx.ip,
      userAgent: a.ctx.userAgent,
      referer: a.ctx.referer,
    }),
  )
  return { leadId: id, consulta: consulta.tipo }
}
```

- [ ] **Step 2: Reescrever a rota de parceiro**

Replace o conteúdo inteiro de `src/app/api/parceiro/lead/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@/lib/request-context'
import { gravarLeadDoParceiro } from '@/lib/parceiro-lead'
import { parceiroAutorizado } from '@/lib/parceiro.regras'

export const runtime = 'nodejs'

/**
 * Ponte pros sites que NAO sao nossos.
 *
 * Um consultor com site proprio (o primeiro caso: `21go.app`, do Gabriel) faz o
 * formulario dele bater aqui, e a cotacao nasce no PowerCRM atribuida a ele —
 * o mesmo caminho de `/api/vehicle/lead`, so que o site de origem e de fora.
 *
 * Por que a chamada ao Power acontece AQUI e nao la: o token da Power API e da
 * 21Go, nao do consultor. Mandar o token pra hospedagem de terceiro seria
 * espalhar credencial da empresa por lugares que a gente nao controla e nao
 * consegue revogar. Aqui ele nao sai de casa; o parceiro so precisa saber a
 * chave dele, que revogamos apagando uma linha (PARCEIROS, em parceiro.regras.ts).
 *
 * NAO envia PDF nem WhatsApp. Desde a Fase 4 da Mariana o lead tambem e gravado no
 * nosso banco como o site da casa grava (placa, planos e precos do Power), com o
 * dominio do parceiro: quem procura esse cliente e a Mariana, do container dela. A
 * cotacao no Power continua UMA so: a daqui.
 */

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
const LEAD_SOURCE = Number(process.env.POWERCRM_DEFAULT_LEAD_SOURCE || '1584')

interface Corpo {
  parceiro?: string
  chave?: string
  nome?: string
  whatsapp?: string
  placa?: string
  valorFipe?: number
}

export async function POST(req: NextRequest) {
  if (!POWERAPI_TOKEN) {
    console.error('[parceiro] POWERAPI_TOKEN nao configurado')
    return NextResponse.json({ error: 'indisponivel' }, { status: 503 })
  }

  const corpo = (await req.json().catch(() => null)) as Corpo | null
  const parceiro = parceiroAutorizado(corpo?.parceiro, corpo?.chave)
  if (!parceiro || !corpo) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  const name = (corpo.nome || '').trim()
  const phone = (corpo.whatsapp || '').replace(/\D/g, '')
  if (name.length < 2 || phone.length < 10) {
    return NextResponse.json({ error: 'nome ou whatsapp invalido' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    name,
    phone,
    leadSource: LEAD_SOURCE,
    // slsmnNwId, e nao pwrlnk: e ele que atribui o lead ao consultor. Com o
    // pwrlnk sozinho a cotacao nasce orfa e o Power arquiva sozinho.
    slsmnNwId: parceiro.powerlink,
  }
  if (corpo.placa) payload.plts = corpo.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (corpo.valorFipe) payload.protectedValue = corpo.valorFipe

  // Fora do await de proposito: a consulta da placa leva segundos e o site do parceiro nao
  // espera por ela. Falhar aqui nunca muda a resposta — a cotacao no Power ja foi feita.
  const ctx = getRequestContext(req)
  const gravar = (quotationCode: string | null, negotiationCode: string | null): void => {
    void gravarLeadDoParceiro({
      parceiro,
      nome: name,
      telefone: phone,
      placa: corpo.placa,
      valorFipe: corpo.valorFipe,
      quotationCode,
      negotiationCode,
      ctx,
    })
      .then((r) => console.log(`[parceiro] lead ${r.leadId} gravado (${r.consulta})`))
      .catch((err) => console.error('[parceiro] lead nao gravado no banco', err))
  }

  try {
    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Authorization: `Bearer ${POWERAPI_TOKEN}`,
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const quotationCode = (json?.quotationCode as string) || null
    const negotiationCode = (json?.negotiationCode as string) || null

    console.log(
      `[parceiro] ${corpo.parceiro} -> ${parceiro.nome} (${parceiro.powerlink}) ` +
        `status ${res.status} cotacao ${quotationCode ?? 'sem codigo'}`,
    )

    gravar(quotationCode, negotiationCode)
    return NextResponse.json({ ok: res.ok, quotationCode }, { status: res.ok ? 200 : 502 })
  } catch (err) {
    console.error('[parceiro] falha ao criar cotacao no Power', err)
    gravar(null, null)
    return NextResponse.json({ error: 'falha ao criar cotacao' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Conferir que só existe UMA cotação no Power e nada da casa no caminho novo**

Run: `grep -n "quotation/add\|criarPelaPipeline\|createLeadPowerCRM\|WDVMKnkq\|IDENTIDADE\|getEvolutionInstance\|upsertConversation" src/app/api/parceiro/lead/route.ts src/lib/parceiro-lead.ts src/lib/parceiro.regras.ts`
Expected (exatamente 1 linha):
```
src/app/api/parceiro/lead/route.ts:<n>:    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/add`, {
```

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ScrollCinema.tsx\|vehicle/lead/route.ts"`
Expected: nenhuma linha.

Run: `npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `ℹ tests 431`, `ℹ pass 431`, `ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parceiro-lead.ts src/app/api/parceiro/lead/route.ts
git commit -m "feat(parceiro): lead do 21go.app gravado no banco como o do site, sem 2a cotacao" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Deploy, ligar o 5 min e a retomada da Mariana (modo teste) e conferir de ponta a ponta

**Files:**
- Modify (servidor, fora do repo): `/opt/site21go/.env-mariana` no Lightsail (`ubuntu@56.126.48.234`, chave `~/.ssh/claude_21go`, usar `sudo`).
- Nenhum arquivo do repo.

**Interfaces:**
- Consumes: Tarefas 1–4 no ar; `abordarLeadsNovos`/`retomarSemResposta` (`src/lib/isa/abordagem.ts`) como estão. Como a Isa foi ligada: `ISA_5MIN=on` no env; no primeiro tique do cron dentro de 8h–22h, `abordarLeadsNovos` grava sozinho `isa_config.5min = { ligado_em: agora }` (`motivo: 'ligou_agora'`) e só lead criado DEPOIS disso é abordado. `ISA_RETOMADA=on` liga a 2ª mensagem. **Nunca gravar `ligado_em` à mão.**
- Produces: Mariana mandando `resultado_simulacao_isa` (5 min) e `duvida_valores_isa` (10 min) para leads do 21go.app, só para a allowlist enquanto `ISA_MODO_TESTE` estiver ligado.

- [ ] **Step 1: Linha de base de produção (REGRA 0) — antes de mexer**

Run (local):
```bash
for u in https://21go.site https://21go.com.br https://crm.myiphone.online/login https://myiphone.online; do echo "$u $(curl -s -o /dev/null -w '%{http_code}' $u)"; done
curl -s -o /dev/null -w "%{http_code}\n" https://mariana.21go.site/api/pdfs/lead_naoexiste
```
Expected: os quatro primeiros `200`; o da Mariana `404` (a rota do PDF responde "Lead not found" — prova que o container dela atende). Anotar os valores; se algum não for esse, parar e investigar antes de qualquer deploy.

- [ ] **Step 2: Pré-checagens no banco (só leitura)**

No SQL editor do Supabase (ou `psql` com a URL do `.env-site`), rodar:

```sql
-- 1) origem e texto livre? (se aparecer CHECK que limite origem, PARAR: 'parceiro_21goapp' seria recusado)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.leads'::regclass AND contype = 'c';
SELECT data_type, udt_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'leads' AND column_name IN ('origem', 'dominio', 'power_responsavel', 'cotacao_planos');

-- 2) estado do 5 min/retomada da Mariana (esperado: sem linha '5min', ou sem suspenso_em)
SELECT chave, valor FROM mariana.isa_config
 WHERE chave IN ('5min', 'retomada', 'template5min', 'templateRetomada', 'qualidade');

-- 3) nenhum lead do 21go.app ainda (esperado: 0)
SELECT count(*) FROM public.leads WHERE dominio = '21go.app';
```

Expected: nenhum CHECK sobre `origem`; `origem` `text`/`varchar`, `cotacao_planos` `jsonb`; em `mariana.isa_config`, nenhuma chave com `suspenso_em` preenchido (se houver suspensão com `motivo` começando por `qualidade`, ela religa sozinha; suspensão manual = perguntar ao dono antes de seguir); `count = 0`.

- [ ] **Step 3: Conferir que o autodeploy recria a Mariana com o env dela**

Run:
```bash
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 "sudo grep -n 'mariana\|env-mariana' /opt/blog-autodeploy.sh; sudo grep -nE '^(ISA_5MIN|ISA_RETOMADA|ISA_MODO_TESTE|ISA_ALLOWLIST|BOT_LEADS_5MIN_DOMINIOS|BOT_LEADS_5MIN_ORIGENS|BOT_SITE_URL)=' /opt/site21go/.env-mariana"
```
Expected: o script troca `mariana21go` com `--env-file /opt/site21go/.env-mariana`; no env: `ISA_5MIN=off` (ou ausente), `ISA_MODO_TESTE=true`, `ISA_ALLOWLIST` com `5521992208062` e `5521990954964`, `BOT_LEADS_5MIN_DOMINIOS=21go.app`, `BOT_LEADS_5MIN_ORIGENS=*`, `BOT_SITE_URL=https://mariana.21go.site`. Se `ISA_MODO_TESTE` não estiver `true`, PARAR e avisar o dono.

- [ ] **Step 4: Ligar o 5 min e a retomada no env da Mariana (com backup)**

Run:
```bash
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 '
  sudo cp -p /opt/site21go/.env-mariana /opt/site21go/.env-mariana.bak-fase4 &&
  for k in ISA_5MIN ISA_RETOMADA; do
    if sudo grep -q "^$k=" /opt/site21go/.env-mariana; then sudo sed -i "s/^$k=.*/$k=on/" /opt/site21go/.env-mariana;
    else echo "$k=on" | sudo tee -a /opt/site21go/.env-mariana >/dev/null; fi
  done &&
  sudo grep -nE "^(ISA_5MIN|ISA_RETOMADA|ISA_MODO_TESTE)=" /opt/site21go/.env-mariana'
```
Expected:
```
<n>:ISA_5MIN=on
<n>:ISA_RETOMADA=on
<n>:ISA_MODO_TESTE=true
```
O env só vale quando o container é recriado — o deploy do Step 5 faz isso. `.env-site` (Isa) não é tocado.

- [ ] **Step 5: Publicar (push no master do remote `site` = deploy pelo cron)**

Run (no worktree, raiz do repo `C:/Users/damas/Documents/PROJETOS/21 GO/wt-mariana-f4`):
```bash
git fetch site
git rebase site/master
cd 21go-website && npm run test:painel 2>&1 | grep -E "ℹ (tests|pass|fail)" && cd ..
git push site HEAD:master
git rev-parse --short HEAD
```
Expected: rebase limpo; `ℹ fail 0`; push aceito. Anotar o SHA.

Esperar o cron (10 em 10 min) e conferir:
```bash
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 "sudo tail -n 30 /var/log/blog-autodeploy.log"
```
Expected: o SHA anotado aparece, com a troca do `site21go` e depois do `mariana21go` concluídas (o `GIT_SHA` do container não serve como prova). Build lento não é falha: não re-disparar.

- [ ] **Step 6: Produção de pé depois do deploy (REGRA 0)**

Run: o mesmo bloco do Step 1.
Expected: os mesmos códigos da linha de base (quatro `200` e o `404` da Mariana). Se algo cair: restaurar é a prioridade (rollback da imagem anterior pelo procedimento do blue/green); o env pode voltar com `sudo cp -p /opt/site21go/.env-mariana.bak-fase4 /opt/site21go/.env-mariana`.

- [ ] **Step 7: O 5 min da Mariana ficou ligado (sozinho)**

Dentro de 8h–22h (ler a hora com `date '+%H:%M'`, sem `TZ=`), 1–2 min depois do container novo:

```sql
SELECT chave, valor FROM mariana.isa_config WHERE chave IN ('5min', 'template5min', 'templateRetomada');
```
Expected: `5min` com `ligado_em` ≈ hora da troca do container; `template5min` e `templateRetomada` com `status = APPROVED` e `categoria = UTILITY`. Fora do horário, o `ligado_em` só aparece no primeiro tique das 8h. Se algum template não estiver APPROVED/UTILITY, a abordagem fica parada (`template_nao_liberado`) — avisar o dono e não seguir para o Step 8.

E a Isa da casa continua como estava:
```sql
SELECT valor FROM public.isa_config WHERE chave = '5min';
```
Expected: o mesmo `ligado_em` de antes (não mudou).

- [ ] **Step 8: Teste de ponta a ponta em modo teste (PEDIR AUTORIZAÇÃO AO DONO ANTES)**

Este teste cria UM card real no Power do Gabriel (a rota sempre cria). Perguntar ao dono: (a) se pode criar o card de teste no Power do Gabriel e (b) a placa de um carro dele que NÃO seja BYD. Sem os dois "sim", parar aqui e relatar.

Se o número do dono já recebeu o 5 min da Mariana antes:
```sql
SELECT telefone, abordagem5min_em FROM mariana.isa_contatos WHERE telefone = '5521992208062';
```
Se `abordagem5min_em` não for nulo, o dono manda `/reiniciar` para o 21 96653-0011 antes.

Run (local, com a placa que o dono informou em `PLACA`):
```bash
PLACA=<placa que o dono informou>
curl -s -X POST https://21go.site/api/parceiro/lead \
  -H 'content-type: application/json' \
  -d "{\"parceiro\":\"21goapp\",\"chave\":\"1f31905505bc033c80c4361c0dda6ae7\",\"nome\":\"Teste Dono Fase4\",\"whatsapp\":\"21992208062\",\"placa\":\"$PLACA\"}"
```
Expected: `{"ok":true,"quotationCode":"..."}` (mesma resposta de sempre).

Em até 1 min:
```sql
SELECT id, dominio, origem, consultor_slug, marca_interesse, modelo_interesse, ano_interesse,
       cotacao_plano, cotacao_valor, jsonb_array_length(cotacao_planos) AS n_planos,
       quotation_code, negotiation_code, power_responsavel, status, etapa_funil
  FROM public.leads WHERE dominio = '21go.app' ORDER BY created_at DESC LIMIT 1;
```
Expected: `dominio = 21go.app`, `origem = parceiro_21goapp`, `consultor_slug` nulo, marca/modelo/ano preenchidos, `cotacao_plano` e `cotacao_valor` iguais ao plano popular do Power, `n_planos >= 1`, `quotation_code` igual ao do curl, `negotiation_code` preenchido, **`power_responsavel = XDmAbx6D`**, `status = lead`, `etapa_funil = cotacao_enviada`. Se `power_responsavel` vier em outro formato (não `XDmAbx6D`), a Mariana pularia TODO lead do 21go.app: PARAR e relatar (é premissa da trava "placa presa com outro consultor").

No Power, conferir que existe UM card só do dono, no funil do Gabriel (não no da Leticya).

PDF (abrir no navegador os dois):
- `https://mariana.21go.site/api/pdfs/<id>`
- `https://21go.site/api/pdfs/<id>`

Expected: os dois com o rodapé e o botão de WhatsApp do Gabriel Juliano (`wa.me/5521990954964`), sem botão/rodapé da casa e sem promoção 40%.

Depois de 5–6 min (dentro de 8h–22h): o celular do dono recebe do 21 96653-0011 o `resultado_simulacao_isa` com o link `https://mariana.21go.site/api/pdfs/<id>`.
```sql
SELECT tipo, detalhe, created_at FROM mariana.isa_eventos
 WHERE telefone = '5521992208062' ORDER BY created_at DESC LIMIT 5;
SELECT count(*) FROM public.isa_eventos WHERE detalhe->>'lead' = '<id>';
SELECT count(*) FROM public.isa_contatos c JOIN public.leads l ON l.id = c.lead_id WHERE l.dominio = '21go.app';
```
Expected: evento `5min` com `{"lead": "<id>"}` no schema `mariana`; `0` e `0` na casa (a Isa não tocou no lead).

Sem responder, mais 10 min: chega o `duvida_valores_isa`; evento `retomada10min` em `mariana.isa_eventos`.

Ao fim, relatar ao dono o card de teste no Power do Gabriel (`quotation_code`) para ele marcar como perdido/arquivar — não mexer no card sem ele mandar.

- [ ] **Step 9: Registrar**

Atualizar a memória `project_gabriel_mariana_crm.md` (Fase 4 no ar em modo teste, SHA do Step 5, origem `parceiro_21goapp`, `ISA_5MIN`/`ISA_RETOMADA` ligados no `.env-mariana`) e criar a nota do dia em `03-aprendizados/` do vault com o que foi feito e as pendências (Regra 3). **Produção** (desligar `ISA_MODO_TESTE` da Mariana) fica para quando o dono mandar.

---

## Self-review

**Cobertura do spec (seção 5 e pedido da Fase 4):**
- Gravar o lead completo do 21go.app como o site da casa (placa, planos e preços do Power, modelo, `dominio = '21go.app'`): Tarefas 1 (mapeamento) e 4 (lookupPlate + upsertLead).
- Sem `consultor_slug`, Power do Gabriel, sem 2ª cotação: Tarefa 1 (`consultor_slug: null`, códigos da rota), Tarefa 4 (grep do Step 3: um único `/quotation/add`).
- 5 min e retomada da Mariana usam a fonte; Isa fica de fora: nenhuma linha de `abordagem.ts` muda; Tarefa 2 trava em teste (`leadEhDoBot`, `fonte5min`), Tarefa 5 Steps 7–8 conferem no banco.
- PDF com o Gabriel em qualquer host: Tarefa 2 (teste) e Tarefa 5 Step 8.
- Placa falhou / veículo que não fazemos / BYD / leilão iguais à casa: Tarefa 1 (humano, EXCLUIDO) + travas existentes de `abordagem.ts` (BYD, `cotacao_planos IS NOT NULL`, `power_responsavel`).
- Extração em vez de cópia: `responsavelNoPower` (Tarefa 3); `lookupPlate` e `upsertLead` reaproveitados como estão; casa idêntica.
- Nada do Gabriel na casa: fila do Power (origem fora da lista, testado), vigia-BYD (Tarefa 2), sem `upsertConversation` na instância `site4824` (grep da Tarefa 4).
- Ligar `ISA_5MIN`/`ISA_RETOMADA` como a Isa (env + `ligado_em` automático), modo teste, produção só com o dono: Tarefa 5.
- DDL: nenhuma necessária (colunas existem); checagem de CHECK em `origem` no Step 2 da Tarefa 5.

**Placeholders:** o único valor em aberto é a placa do teste (Tarefa 5, Step 8), que por regra vem do dono; `<id>`/`<n>` são saídas de comandos anteriores.

**Consistência de tipos:** `Parceiro`, `PlanoDaTela`, `ConsultaDaPlaca`, `DadosDoLeadDoParceiro` definidos na Tarefa 1 e usados com os mesmos nomes nas Tarefas 2 e 4; `responsavelNoPower(negotiationCode: string | undefined, leadId: string)` igual nas Tarefas 3 e 4; `gravarLeadDoParceiro` com os mesmos campos na Tarefa 4 (módulo e rota).
