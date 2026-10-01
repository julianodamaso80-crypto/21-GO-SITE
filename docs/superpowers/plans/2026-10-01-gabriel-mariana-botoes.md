# Gabriel Juliano — botões WhatsApp, Gastos e Lucro (Mariana, ciclo 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O consultor Gabriel Juliano passa a ver WhatsApp, Gastos e Lucro no CRM (web e app), com as telas da Mariana em branco e o Lucro no formato da Leticya, sem enxergar nenhum dado da Isa.

**Architecture:** Uma lista nova por ID de usuário (`ATENDIMENTO_MARIANA_USUARIOS`) decide quem é "atendente Mariana". O backend devolve `atendente: 'isa' | 'mariana' | null` em `/api/atendimento-isa/liberado` e ganha o modo de Lucro `mariana` (mesmos dados do modo `consultor`). O frontend usa esse campo para mostrar os itens do menu e para trocar o conteúdo das três telas; as telas da Mariana não chamam rota nenhuma da Isa.

**Tech Stack:** Backend Fastify + TypeScript + vitest. Frontend React 18 + Vite + TanStack Query + Tailwind + vitest. App = Capacitor carregando `crm21go.site` (não muda).

**Especificação:** `docs/superpowers/specs/2026-10-01-gabriel-mariana-botoes-design.md` (repo do SITE).

## Global Constraints

- Repo de implementação: `C:/Users/damas/Documents/PROJETOS/21 GO/21 GO - CRM`, a partir de **`origin/main`** (o checkout local está em `feat/esqueci-a-senha` — não usar). Trabalhar num worktree.
- Usuário do Gabriel no CRM: `ee11e4e3-64d1-457f-9f80-dbc90bf65644` (papel `vendedor`). Power salesman `274773`, PowerLink `XDmAbx6D`.
- Liberação **por ID de usuário**, nunca por papel nem por nome.
- A lista da Isa (`ATENDIMENTO_ISA_USUARIOS`) e tudo o que a Leticya vê **não mudam**.
- As telas da Mariana **não chamam** `/contatos`, `/conversa`, `/etiquetas`, `/funil`, `/gastos` nem nenhuma rota da Isa.
- Etiquetas da Mariana = as da Isa **sem** `leticya` ("Falando com Leticya") e **sem** `guilherme` ("Falando com Guilherme").
- Lucro do Gabriel: venda = **vistoria aprovada**; sem Mercado Pago; gasto do Meta em branco ("—", "ainda não conectado").
- Texto de tela em português com acentos. Comentários de código só para o "porquê", no estilo do arquivo (sem acento, como já está).
- Commits: `tipo(escopo): descrição` em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nenhuma tabela nova, nenhuma migração.

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `backend/src/modules/atendimento-isa/liberacao.ts` | + `Atendente`, `atendenteDo()` |
| `backend/src/modules/atendimento-isa/liberacao.test.ts` | + testes de `atendenteDo` |
| `backend/src/modules/atendimento-isa/lucro-consultor.regras.ts` | `ModoLucro` ganha `'mariana'`; `modoDoLucro` ganha o 3º parâmetro |
| `backend/src/modules/atendimento-isa/lucro-consultor.regras.test.ts` | + testes do modo `mariana` |
| `backend/src/modules/atendimento-isa/atendimento-isa.routes.ts` | `/liberado` devolve `atendente`; Lucro e Caixa aceitam o modo `mariana` |
| `frontend/src/services/atendimento-isa.service.ts` | tipos: `atendente` no `/liberado`; `modo: 'consultor' \| 'mariana'` |
| `frontend/src/components/layouts/menu-atendimento.ts` (novo) | regra pura de quem vê WhatsApp, Gastos e Lucro |
| `frontend/src/components/layouts/menu-atendimento.test.ts` (novo) | testes da regra do menu |
| `frontend/src/components/layouts/AppLayout.tsx` | guarda `atendente`; `canSeeItem` usa a regra pura |
| `frontend/src/pages/atendimento-isa/mariana.ts` (novo) | lista de etiquetas da Mariana |
| `frontend/src/pages/atendimento-isa/mariana.test.ts` (novo) | testes da lista |
| `frontend/src/pages/atendimento-isa/AtendimentoIsaPage.tsx` | `MesaMariana` quando `atendente === 'mariana'` |
| `frontend/src/pages/gastos/GastosMariana.tsx` (novo) | tela de gastos em branco |
| `frontend/src/pages/gastos/GastosPage.tsx` | troca para `GastosMariana` sem chamar a rota de gastos |
| `frontend/src/pages/lucro/LucroPage.tsx` | modo `mariana`: aba do consultor + bloco "Quem fechou" e gasto do Meta |

---

### Task 0: Worktree a partir de `origin/main`

**Files:** nenhum código.

- [ ] **Step 1: Criar o worktree**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/21 GO - CRM"
git fetch origin
git worktree add -b feat/gabriel-mariana "../wt-gabriel-mariana" origin/main
cd "../wt-gabriel-mariana"
git log --oneline -1
```

Expected: o último commit é o mesmo de `git log origin/main --oneline -1`.

- [ ] **Step 2: Instalar dependências e rodar a base de testes**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
npm install
cd backend && npx vitest run src/modules/atendimento-isa && cd ..
cd frontend && npx vitest run && cd ..
```

Expected: tudo PASS antes de qualquer mudança. Se algo falhar aqui, parar e anotar: não é desta tarefa.

---

### Task 1: Backend — quem é atendente Mariana

**Files:**
- Modify: `backend/src/modules/atendimento-isa/liberacao.ts` (acrescentar no fim)
- Modify: `backend/src/modules/atendimento-isa/liberacao.test.ts`
- Modify: `backend/src/modules/atendimento-isa/atendimento-isa.routes.ts` (import na linha 11, `usuarioLiberado` nas linhas 32-35, rota `/liberado` nas linhas 289-293)

**Interfaces:**
- Produces: `export type Atendente = 'isa' | 'mariana'`; `export function atendenteDo(userId: string | null | undefined, configIsa: string | undefined, configMariana: string | undefined): Atendente | null`; nas rotas, `function ehMariana(req: FastifyRequest): boolean`; `/liberado` devolve `{ liberado, usuario, lucro, atendente }`.

- [ ] **Step 1: Escrever o teste que falha** — acrescentar ao fim de `liberacao.test.ts` e trocar o import da linha 2:

```ts
import { usuarioDoPainel, atendenteDo } from './liberacao'
```

```ts
describe('atendenteDo', () => {
  const ISA = '4e9d733d-e25b-4566-82b4-68f3db9c5f4f:leticya'
  const MARIANA = 'ee11e4e3-64d1-457f-9f80-dbc90bf65644:gabriel'

  it('a Leticya continua sendo da Isa', () => {
    expect(atendenteDo('4e9d733d-e25b-4566-82b4-68f3db9c5f4f', ISA, MARIANA)).toBe('isa')
  })

  it('o Gabriel e da Mariana — e so dela, nunca da Isa', () => {
    expect(atendenteDo('ee11e4e3-64d1-457f-9f80-dbc90bf65644', ISA, MARIANA)).toBe('mariana')
    expect(usuarioDoPainel('ee11e4e3-64d1-457f-9f80-dbc90bf65644', ISA)).toBeNull()
  })

  it('quem nao esta em nenhuma lista nao tem atendente', () => {
    expect(atendenteDo('outro-id', ISA, MARIANA)).toBeNull()
    expect(atendenteDo(null, ISA, MARIANA)).toBeNull()
  })

  it('sem a env da Mariana, o Gabriel volta ao estado de hoje', () => {
    expect(atendenteDo('ee11e4e3-64d1-457f-9f80-dbc90bf65644', ISA, undefined)).toBeNull()
    expect(atendenteDo('ee11e4e3-64d1-457f-9f80-dbc90bf65644', ISA, '')).toBeNull()
  })

  it('nas duas listas, a Isa vence (nada muda para quem ja e da Isa)', () => {
    expect(atendenteDo('x', 'x:leticya', 'x:gabriel')).toBe('isa')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/backend"
npx vitest run src/modules/atendimento-isa/liberacao.test.ts
```

Expected: FAIL — `atendenteDo is not a function` (ou erro de export).

- [ ] **Step 3: Implementar** — acrescentar ao fim de `liberacao.ts`:

```ts
export type Atendente = 'isa' | 'mariana'

/**
 * Quem atende o WhatsApp deste usuario no CRM. Dono, 01/10/2026: o consultor Gabriel Juliano
 * ganha um robo proprio, a Mariana, e o que se faz para ele nao vale para mais ninguem — por
 * isso a lista dele (`ATENDIMENTO_MARIANA_USUARIOS`) e SEPARADA da lista da Isa. Estar na lista
 * da Mariana nao abre nenhuma rota da Isa: essas continuam olhando so `usuarioDoPainel` com a
 * lista da Isa. Nas duas listas, a Isa vence, para nada mudar para quem ja era dela.
 */
export function atendenteDo(
  userId: string | null | undefined,
  configIsa: string | undefined,
  configMariana: string | undefined,
): Atendente | null {
  if (usuarioDoPainel(userId, configIsa)) return 'isa'
  if (usuarioDoPainel(userId, configMariana)) return 'mariana'
  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/modules/atendimento-isa/liberacao.test.ts
```

Expected: PASS (todos os testes, os antigos inclusive).

- [ ] **Step 5: Ligar nas rotas** — em `atendimento-isa.routes.ts`:

Linha 11, trocar:

```ts
import { usuarioDoPainel } from './liberacao'
```

por:

```ts
import { usuarioDoPainel, atendenteDo } from './liberacao'
```

Logo depois da função `usuarioLiberado` (linhas 32-35), acrescentar:

```ts
/** Quem atende o WhatsApp deste usuario — 'isa', 'mariana' (o Gabriel) ou ninguem. */
function atendenteDaReq(req: FastifyRequest) {
  const u = (req as unknown as { user?: { id?: string } }).user
  return atendenteDo(u?.id, process.env.ATENDIMENTO_ISA_USUARIOS, process.env.ATENDIMENTO_MARIANA_USUARIOS)
}

/** Atendente Mariana: ve as telas DELA, nunca uma rota da Isa (`repassar` e `gastos` seguem 403). */
function ehMariana(req: FastifyRequest): boolean {
  return atendenteDaReq(req) === 'mariana'
}
```

Na rota `/liberado`, trocar:

```ts
    return { liberado: !!usuario, usuario, lucro: !!usuario && !ehEspelho(req) }
```

por:

```ts
    // `atendente` (01/10/2026): diz ao menu se este usuario ve as telas da Mariana. Para o Gabriel
    // `liberado` continua false — e o campo que abre as rotas da Isa.
    return { liberado: !!usuario, usuario, lucro: !!usuario && !ehEspelho(req), atendente: atendenteDaReq(req) }
```

- [ ] **Step 6: Conferir tipos**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/backend"
npx tsc --noEmit
```

Expected: sem erros. (`ehMariana` ainda não é usado; se o `tsc` acusar `noUnusedLocals`, seguir para a Task 2 antes de commitar e commitar as duas juntas.)

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add backend/src/modules/atendimento-isa/liberacao.ts backend/src/modules/atendimento-isa/liberacao.test.ts backend/src/modules/atendimento-isa/atendimento-isa.routes.ts
git commit -m "feat(mariana): lista propria da Mariana e campo atendente no /liberado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — modo de Lucro `mariana`

**Files:**
- Modify: `backend/src/modules/atendimento-isa/lucro-consultor.regras.ts:15-24`
- Modify: `backend/src/modules/atendimento-isa/lucro-consultor.regras.test.ts`
- Modify: `backend/src/modules/atendimento-isa/atendimento-isa.routes.ts` (rotas `/lucro`, `/lucro/:code`, `donoDoCaixa`)

**Interfaces:**
- Consumes: `ehMariana(req)` da Task 1.
- Produces: `export type ModoLucro = 'leticya' | 'consultor' | 'mariana'`; `modoDoLucro(liberadoIsa: boolean, papel: string | null | undefined, liberadoMariana?: boolean): ModoLucro | null`; `GET /lucro` devolve o painel do consultor com `modo: 'mariana'` para o Gabriel.

- [ ] **Step 1: Escrever o teste que falha** — acrescentar dentro do `describe('modoDoLucro', ...)` de `lucro-consultor.regras.test.ts`:

```ts
  it('o atendente Mariana (o Gabriel) ve a aba no formato da Leticya com as vendas dele', () => {
    expect(modoDoLucro(false, 'vendedor', true)).toBe('mariana')
  })
  it('a lista da Isa vence a da Mariana — a Leticya nao muda', () => {
    expect(modoDoLucro(true, 'vendedor', true)).toBe('leticya')
  })
  it('sem a lista da Mariana, nada muda para os outros', () => {
    expect(modoDoLucro(false, 'vendedor', false)).toBe('consultor')
    expect(modoDoLucro(false, 'admin', false)).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/backend"
npx vitest run src/modules/atendimento-isa/lucro-consultor.regras.test.ts
```

Expected: FAIL — o primeiro teste novo recebe `'consultor'` em vez de `'mariana'`.

- [ ] **Step 3: Implementar** — em `lucro-consultor.regras.ts`, trocar o bloco das linhas 15-24:

```ts
export type ModoLucro = 'leticya' | 'consultor'

/**
 * Quem esta na lista da Isa (ATENDIMENTO_ISA_USUARIOS) ve a aba da Leticya, como sempre viu.
 * Todo outro `vendedor` ve a propria. O resto nao ve aba nenhuma.
 */
export function modoDoLucro(liberadoIsa: boolean, papel: string | null | undefined): ModoLucro | null {
  if (liberadoIsa) return 'leticya'
  if (papel === 'vendedor') return 'consultor'
  return null
}
```

por:

```ts
export type ModoLucro = 'leticya' | 'consultor' | 'mariana'

/**
 * Quem esta na lista da Isa (ATENDIMENTO_ISA_USUARIOS) ve a aba da Leticya, como sempre viu.
 * Quem esta na lista da Mariana (ATENDIMENTO_MARIANA_USUARIOS, so o Gabriel — dono, 01/10/2026)
 * ve a aba no formato da Leticya com as vendas DELE (vistoria aprovada, os dados do `consultor`).
 * Todo outro `vendedor` ve a propria. O resto nao ve aba nenhuma.
 */
export function modoDoLucro(
  liberadoIsa: boolean,
  papel: string | null | undefined,
  liberadoMariana = false,
): ModoLucro | null {
  if (liberadoIsa) return 'leticya'
  if (liberadoMariana) return 'mariana'
  if (papel === 'vendedor') return 'consultor'
  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/modules/atendimento-isa/lucro-consultor.regras.test.ts
```

Expected: PASS (antigos e novos).

- [ ] **Step 5: Ligar nas rotas** — em `atendimento-isa.routes.ts` há **três** linhas iguais a esta (em `GET /lucro`, `PUT /lucro/:code` e `donoDoCaixa`):

```ts
    const modo = ehEspelho(req) ? null : modoDoLucro(!!usuarioLiberado(req), role)
```

Trocar as três por:

```ts
    const modo = ehEspelho(req) ? null : modoDoLucro(!!usuarioLiberado(req), role, ehMariana(req))
```

Conferir com `git grep -n "modoDoLucro(" backend/src` — as três chamadas têm que ter o terceiro argumento.

Em `GET /lucro`, trocar:

```ts
    if (modo === 'consultor') return painelLucroConsultor(companyId, id, { mes, de, ate })
```

por:

```ts
    if (modo === 'consultor') return painelLucroConsultor(companyId, id, { mes, de, ate })
    // Mariana (o Gabriel): os mesmos dados do consultor; a tela troca so o formato.
    if (modo === 'mariana') return { ...(await painelLucroConsultor(companyId, id, { mes, de, ate })), modo }
```

Em `PUT /lucro/:code`, trocar:

```ts
    if (modo === 'consultor') {
```

por:

```ts
    if (modo === 'consultor' || modo === 'mariana') {
```

`donoDoCaixa` não precisa de outra mudança: `dono: modo === 'leticya' ? 'leticya' : id` já põe o caixa do Gabriel no ID dele, o mesmo de hoje.

- [ ] **Step 6: Tipos e testes do módulo**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/backend"
npx tsc --noEmit
npx vitest run src/modules/atendimento-isa
```

Expected: `tsc` sem erros; vitest tudo PASS.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add backend/src/modules/atendimento-isa/lucro-consultor.regras.ts backend/src/modules/atendimento-isa/lucro-consultor.regras.test.ts backend/src/modules/atendimento-isa/atendimento-isa.routes.ts
git commit -m "feat(mariana): modo de Lucro mariana com as vendas do proprio consultor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — tipos e menu

**Files:**
- Modify: `frontend/src/services/atendimento-isa.service.ts` (`PainelLucroConsultor.modo`, linha ~196; `liberado`, linhas 209-210)
- Create: `frontend/src/components/layouts/menu-atendimento.ts`
- Create: `frontend/src/components/layouts/menu-atendimento.test.ts`
- Modify: `frontend/src/components/layouts/AppLayout.tsx` (estado nas linhas 240-251; `canSeeItem` nas linhas 383-388)

**Interfaces:**
- Consumes: `/liberado` devolvendo `atendente` (Task 1).
- Produces: `export type Atendente = 'isa' | 'mariana'` em `menu-atendimento.ts`; `itemDoAtendimento(path: string, a: { atendente: Atendente | null; lucroIsa: boolean; papel: string | null | undefined }): boolean | null`; no serviço, `liberado()` tipado com `atendente?: 'isa' | 'mariana' | null`, e `PainelLucroConsultor.modo: 'consultor' | 'mariana'`.

- [ ] **Step 1: Escrever o teste que falha** — criar `frontend/src/components/layouts/menu-atendimento.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { itemDoAtendimento } from './menu-atendimento'

const leticya = { atendente: 'isa' as const, lucroIsa: true, papel: 'vendedor' }
const gabriel = { atendente: 'mariana' as const, lucroIsa: false, papel: 'vendedor' }
const vendedor = { atendente: null, lucroIsa: false, papel: 'vendedor' }
const admin = { atendente: null, lucroIsa: false, papel: 'admin' }

describe('itemDoAtendimento', () => {
  it('a Leticya continua vendo WhatsApp, Gastos e Lucro', () => {
    for (const p of ['/atendimento', '/gastos', '/lucro']) expect(itemDoAtendimento(p, leticya)).toBe(true)
  })
  it('o Gabriel (Mariana) ve WhatsApp, Gastos e Lucro', () => {
    for (const p of ['/atendimento', '/gastos', '/lucro']) expect(itemDoAtendimento(p, gabriel)).toBe(true)
  })
  it('outro vendedor so ve o Lucro, como hoje', () => {
    expect(itemDoAtendimento('/atendimento', vendedor)).toBe(false)
    expect(itemDoAtendimento('/gastos', vendedor)).toBe(false)
    expect(itemDoAtendimento('/lucro', vendedor)).toBe(true)
  })
  it('admin fora das listas nao ve nenhum dos tres', () => {
    for (const p of ['/atendimento', '/gastos', '/lucro']) expect(itemDoAtendimento(p, admin)).toBe(false)
  })
  it('outros itens do menu nao sao decididos aqui', () => {
    expect(itemDoAtendimento('/pipes', gabriel)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx vitest run src/components/layouts/menu-atendimento.test.ts
```

Expected: FAIL — o arquivo `./menu-atendimento` não existe.

- [ ] **Step 3: Implementar** — criar `frontend/src/components/layouts/menu-atendimento.ts`:

```ts
/**
 * Quem ve WhatsApp, Gastos e Lucro no menu. Nao e por papel: o backend diz o `atendente` pelo ID
 * do usuario (`/atendimento-isa/liberado`). 'isa' = a Leticya; 'mariana' = o Gabriel Juliano
 * (dono, 01/10/2026), que ve as telas DELE, nunca as da Isa. Lucro continua aberto a todo vendedor
 * (24/09/2026). `null` = este item nao e decidido aqui.
 */
export type Atendente = 'isa' | 'mariana'

export function itemDoAtendimento(
  path: string,
  a: { atendente: Atendente | null; lucroIsa: boolean; papel: string | null | undefined },
): boolean | null {
  if (path === '/atendimento' || path === '/gastos') return a.atendente !== null
  if (path === '/lucro') return a.lucroIsa || a.atendente === 'mariana' || a.papel === 'vendedor'
  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/components/layouts/menu-atendimento.test.ts
```

Expected: PASS.

- [ ] **Step 5: Tipos do serviço** — em `atendimento-isa.service.ts`:

Em `PainelLucroConsultor`, trocar:

```ts
  modo: 'consultor'
```

por:

```ts
  /** 'mariana' = o Gabriel (01/10/2026): mesmos dados, a tela mostra no formato da Leticya. */
  modo: 'consultor' | 'mariana'
```

Em `liberado`, trocar:

```ts
    api.get<{ liberado: boolean; usuario: string | null; lucro?: boolean }>(`${BASE}/liberado`).then((r) => r.data),
```

por:

```ts
    api.get<{ liberado: boolean; usuario: string | null; lucro?: boolean; atendente?: 'isa' | 'mariana' | null }>(`${BASE}/liberado`).then((r) => r.data),
```

- [ ] **Step 6: Ligar no `AppLayout.tsx`**

Acrescentar o import junto dos outros imports de `./arranque`:

```ts
import { itemDoAtendimento, type Atendente } from './menu-atendimento'
```

Logo depois de `const [lucroIsa, setLucroIsa] = useState(false)`, acrescentar:

```ts
  // Mariana (o Gabriel, 01/10/2026): ve WhatsApp e Gastos DELA. `whatsappIsa` continua so da Isa,
  // e e ele que decide o arranque — a tela inicial do Gabriel nao muda.
  const [atendente, setAtendente] = useState<Atendente | null>(null)
```

No `.then` do `liberado()`, trocar:

```ts
      .then((r) => { if (vivo) { setWhatsappIsa(r.liberado); setLucroIsa(r.lucro === true) } })
```

por:

```ts
      .then((r) => {
        if (!vivo) return
        setWhatsappIsa(r.liberado)
        setLucroIsa(r.lucro === true)
        // Backend antigo, sem `atendente`: quem tem `liberado` e da Isa, como sempre foi.
        setAtendente(r.atendente ?? (r.liberado ? 'isa' : null))
      })
```

Em `canSeeItem`, trocar as linhas:

```ts
    // Mesmo criterio: so aparece depois que o backend confirma que este usuario ve o WhatsApp.
    if (item.path === '/atendimento' && !whatsappIsa) return false
    if (item.path === '/gastos' && !whatsappIsa) return false
    // Lucro: a Leticya ve a dela (lista da Isa) e todo outro consultor ve a propria (dono, 24/09/2026).
    // Pelo papel do TOKEN, que e o que o backend confere — ver `modoDoLucro`.
    if (item.path === '/lucro') return lucroIsa || papelReal === 'vendedor'
```

por:

```ts
    // WhatsApp, Gastos e Lucro: so depois que o backend confirma quem atende este usuario (Isa ou
    // Mariana). Lucro tambem pelo papel do TOKEN, que e o que o backend confere — ver `modoDoLucro`.
    const doAtendimento = itemDoAtendimento(item.path, { atendente, lucroIsa, papel: papelReal })
    if (doAtendimento !== null) return doAtendimento
```

- [ ] **Step 7: Tipos e testes**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` pode acusar `LucroPage.tsx` (comparações com `modo`) — se acusar, é corrigido na Task 6; anotar o erro e seguir. Nenhum outro erro. vitest PASS.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add frontend/src/services/atendimento-isa.service.ts frontend/src/components/layouts/menu-atendimento.ts frontend/src/components/layouts/menu-atendimento.test.ts frontend/src/components/layouts/AppLayout.tsx
git commit -m "feat(mariana): menu mostra WhatsApp, Gastos e Lucro para o atendente Mariana

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — tela WhatsApp da Mariana

**Files:**
- Create: `frontend/src/pages/atendimento-isa/mariana.ts`
- Create: `frontend/src/pages/atendimento-isa/mariana.test.ts`
- Modify: `frontend/src/pages/atendimento-isa/AtendimentoIsaPage.tsx` (`AtendimentoIsaPage`, linhas ~119-139; nova função `MesaMariana` logo antes de `function Mesa`)

**Interfaces:**
- Consumes: `svc.liberado()` com `atendente` (Task 3); `Chip` e `FUNDO`, já existentes no mesmo arquivo; tipo `Etiqueta` do serviço.
- Produces: `export const ETIQUETAS_MARIANA: Etiqueta[]`.

- [ ] **Step 1: Escrever o teste que falha** — criar `frontend/src/pages/atendimento-isa/mariana.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ETIQUETAS_MARIANA } from './mariana'

describe('ETIQUETAS_MARIANA', () => {
  it('sem "Falando com Leticya" e sem "Falando com Guilherme" (dono, 01/10/2026)', () => {
    const ids = ETIQUETAS_MARIANA.map((e) => e.id)
    expect(ids).not.toContain('leticya')
    expect(ids).not.toContain('guilherme')
    expect(ETIQUETAS_MARIANA.some((e) => /leticya|guilherme/i.test(e.nome))).toBe(false)
  })
  it('as outras etiquetas da Isa, na mesma ordem', () => {
    expect(ETIQUETAS_MARIANA.map((e) => e.id)).toEqual(['urgente', 'quente', 'pensando', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx vitest run src/pages/atendimento-isa/mariana.test.ts
```

Expected: FAIL — `./mariana` não existe.

- [ ] **Step 3: Implementar** — criar `frontend/src/pages/atendimento-isa/mariana.ts` (cores copiadas de `21go-website/src/lib/isa/etiquetas.regras.ts`):

```ts
import type { Etiqueta } from '../../services/atendimento-isa.service'

/**
 * Etiquetas da Mariana, o robo do Gabriel Juliano (dono, 01/10/2026). As mesmas da Isa sem
 * "Falando com Leticya" e sem "Falando com Guilherme" — as duas sao gente da casa, nao do Gabriel.
 * Ficam aqui, fixas, porque a lista da Isa mora no 21go.site e a Mariana nao pode chamar rota da Isa.
 */
export const ETIQUETAS_MARIANA: Etiqueta[] = [
  { id: 'urgente', nome: 'Urgente', cor: '#DC2626', claro: false },
  { id: 'quente', nome: 'Quente', cor: '#EF4444', claro: false },
  { id: 'pensando', nome: 'Pensando', cor: '#FACC15', claro: true },
  { id: 'documento', nome: 'Enviou documento', cor: '#93C5FD', claro: true },
  { id: 'vistoria', nome: 'Vistoria', cor: '#C4B5FD', claro: true },
  { id: 'fechou', nome: 'Fechou', cor: '#22C55E', claro: false },
  { id: 'consultor', nome: 'Consultores', cor: '#2DD4BF', claro: true },
  { id: 'frio', nome: 'Frio', cor: '#64748B', claro: false },
]
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/pages/atendimento-isa/mariana.test.ts
```

Expected: PASS.

- [ ] **Step 5: Ligar na página** — em `AtendimentoIsaPage.tsx`:

Acrescentar o import depois do import de `../../lib/erro-api`:

```ts
import { ETIQUETAS_MARIANA } from './mariana'
```

Trocar o começo de `AtendimentoIsaPage`:

```tsx
export function AtendimentoIsaPage() {
  const [liberado, setLiberado] = useState<boolean | null>(null)
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])

  useEffect(() => {
    svc.liberado().then((r) => setLiberado(r.liberado)).catch(() => setLiberado(false))
    svc.etiquetas().then(setEtiquetas).catch(() => {})
  }, [])

  if (liberado === null) return <div className="grid h-full place-items-center text-sm text-gray-400">carregando…</div>
  if (!liberado) {
```

por:

```tsx
export function AtendimentoIsaPage() {
  const [liberado, setLiberado] = useState<boolean | null>(null)
  const [mariana, setMariana] = useState(false)
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])

  useEffect(() => {
    svc.liberado()
      .then((r) => {
        setMariana(r.atendente === 'mariana')
        setLiberado(r.liberado)
        // As etiquetas sao da Isa: so quem e da Isa pergunta (a Mariana nao chama rota da Isa).
        if (r.liberado) svc.etiquetas().then(setEtiquetas).catch(() => {})
      })
      .catch(() => setLiberado(false))
  }, [])

  if (liberado === null) return <div className="grid h-full place-items-center text-sm text-gray-400">carregando…</div>
  if (!liberado && mariana) {
    return (
      <div className="h-full min-h-[480px] overflow-hidden text-[#E9ECF8]" style={FUNDO}>
        <MesaMariana />
      </div>
    )
  }
  if (!liberado) {
```

Logo antes de `function Mesa({ etiquetas }: { etiquetas: Etiqueta[] }) {`, acrescentar:

```tsx
/**
 * A mesa da Mariana, o robo do Gabriel Juliano (dono, 01/10/2026). Ainda em branco: a Mariana nao
 * atende enquanto nao tiver numero proprio. Nao chama nenhuma rota da Isa.
 */
function MesaMariana() {
  const [filtro, setFiltro] = useState('')
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#C7D301] text-sm font-bold text-[#141d45]">M</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Mariana</p>
          <p className="text-xs text-[#9AA3C7]">Atendimento do Gabriel</p>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA3C7]">Etiquetas</span>
        {ETIQUETAS_MARIANA.map((e) => (
          <Chip key={e.id} etiqueta={e} ativa={filtro === e.id} onClick={() => setFiltro(filtro === e.id ? '' : e.id)} />
        ))}
      </div>
      <div className="grid flex-1 place-items-center p-6 text-center">
        <p className="max-w-sm text-sm text-[#9AA3C7]">
          A Mariana ainda não está atendendo. Quando ela começar, as conversas aparecem aqui.
        </p>
      </div>
    </div>
  )
}

```

- [ ] **Step 6: Tipos e testes**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx tsc --noEmit
npx vitest run
```

Expected: sem erros novos (o de `LucroPage.tsx`, se apareceu na Task 3, ainda pode estar lá). vitest PASS.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add frontend/src/pages/atendimento-isa/mariana.ts frontend/src/pages/atendimento-isa/mariana.test.ts frontend/src/pages/atendimento-isa/AtendimentoIsaPage.tsx
git commit -m "feat(mariana): tela de WhatsApp da Mariana, em branco, sem as etiquetas da Leticya e do Guilherme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — tela Gastos da Mariana

**Files:**
- Create: `frontend/src/pages/gastos/GastosMariana.tsx`
- Modify: `frontend/src/pages/gastos/GastosPage.tsx` (início de `GastosPage`, linhas ~55-64, e o `return` principal)

**Interfaces:**
- Consumes: `svc.liberado()` com `atendente` (Task 3).
- Produces: `export function GastosMariana(): JSX.Element`.

- [ ] **Step 1: Criar a tela em branco** — `frontend/src/pages/gastos/GastosMariana.tsx`:

```tsx
import { DollarSign, MessageCircle } from 'lucide-react'

/**
 * GASTOS DO GABRIEL (dono, 01/10/2026): gasto = o que ele gasta no Meta. Em branco ate a conta de
 * anuncio dele e o numero da Mariana existirem. Nao chama a rota de gastos da Isa.
 */
export function GastosMariana() {
  return (
    <div className="page-enter mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-display font-bold text-dark-50">Gastos</h1>
        <p className="text-sm text-dark-300">O que você gasta na Meta: seus anúncios e o WhatsApp da Mariana.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Quadro icone={<DollarSign className="h-4 w-4" />} titulo="Meta Ads (Gabriel)" />
        <Quadro icone={<MessageCircle className="h-4 w-4" />} titulo="WhatsApp da Mariana" />
      </div>
    </div>
  )
}

function Quadro({ icone, titulo }: { icone: React.ReactNode; titulo: string }) {
  return (
    <div className="rounded-xl border border-dark-600 bg-dark-800/70 p-4">
      <p className="flex items-center gap-2 text-xs text-dark-300">{icone} {titulo}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-dark-50">—</p>
      <p className="mt-1 text-[11px] text-dark-400">ainda não conectado</p>
    </div>
  )
}
```

- [ ] **Step 2: Ligar na página** — em `GastosPage.tsx`:

Acrescentar o import:

```ts
import { GastosMariana } from './GastosMariana'
```

No começo de `GastosPage`, trocar:

```tsx
  const painel = useQuery({
    queryKey: ['gastos-whatsapp', de, ate],
    queryFn: () => svc.gastos(de, ate),
    staleTime: 5 * 60_000,
  })
```

por:

```tsx
  // Mariana (o Gabriel, 01/10/2026): ve os gastos DELE, em branco; nunca chama a rota da Isa.
  const acesso = useQuery({ queryKey: ['atendimento-liberado'], queryFn: svc.liberado, staleTime: 5 * 60_000 })
  const mariana = acesso.data?.atendente === 'mariana'
  const painel = useQuery({
    queryKey: ['gastos-whatsapp', de, ate],
    queryFn: () => svc.gastos(de, ate),
    staleTime: 5 * 60_000,
    enabled: acesso.isFetched && !mariana,
  })
```

Logo antes do `return (` principal do componente (depois de `const periodo = ...`), acrescentar:

```tsx
  if (mariana) return <GastosMariana />
```

- [ ] **Step 3: Tipos e testes**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx tsc --noEmit
npx vitest run
```

Expected: sem erros novos; vitest PASS.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add frontend/src/pages/gastos/GastosMariana.tsx frontend/src/pages/gastos/GastosPage.tsx
git commit -m "feat(mariana): tela de Gastos do Gabriel, em branco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — Lucro no formato da Leticya para a Mariana

**Files:**
- Modify: `frontend/src/pages/lucro/LucroPage.tsx` (`LucroPage`, linhas ~97 e ~155-156; `LucroConsultor`, depois de `{caixa}`; novo componente depois de `LucroConsultor`)

**Interfaces:**
- Consumes: `PainelLucroConsultor.modo: 'consultor' | 'mariana'` (Task 3); `Dono`, `COR`, `fraseDoPeriodo`, `Bot`, `UserRound`, já no arquivo.
- Produces: `function QuemFechouMariana({ d }: { d: PainelLucroConsultor })`.

- [ ] **Step 1: Página escolhe a aba certa** — em `LucroPage`, trocar:

```tsx
  const consultor = d?.modo === 'consultor'
```

por:

```tsx
  // Mariana (o Gabriel, 01/10/2026): os dados do consultor, no formato da Leticya.
  const consultor = d?.modo === 'consultor' || d?.modo === 'mariana'
```

E trocar as duas linhas:

```tsx
      {d?.modo === 'consultor' && <LucroConsultor d={d} caixa={modo === 'mes' ? <Caixa mes={d.mes} lucro={d.resumo.lucro} /> : <CaixaSoNoMes />} />}
      {d && d.modo !== 'consultor' && <LucroLeticya d={d} caixa={modo === 'mes' ? <Caixa mes={d.mes} lucro={d.resumo.donos.total.lucro} /> : <CaixaSoNoMes />} />}
```

por:

```tsx
      {d && d.modo !== 'leticya' && <LucroConsultor d={d} caixa={modo === 'mes' ? <Caixa mes={d.mes} lucro={d.resumo.lucro} /> : <CaixaSoNoMes />} />}
      {d?.modo === 'leticya' && <LucroLeticya d={d} caixa={modo === 'mes' ? <Caixa mes={d.mes} lucro={d.resumo.donos.total.lucro} /> : <CaixaSoNoMes />} />}
```

- [ ] **Step 2: Bloco "Quem fechou" na aba do consultor** — em `LucroConsultor`, trocar:

```tsx
      {caixa}

      <section className="rounded-xl border border-dark-600 bg-dark-800/70">
```

por:

```tsx
      {caixa}

      {d.modo === 'mariana' && <QuemFechouMariana d={d} />}

      <section className="rounded-xl border border-dark-600 bg-dark-800/70">
```

Depois do fim da função `LucroConsultor`, acrescentar:

```tsx
const RESUMO_ZERO: ResumoDonoLucro = { vendas: 0, confirmadas: 0, receita: 0, taxa: 0, rastreador: 0, lucro: 0 }

/**
 * O "Quem fechou" da aba da Leticya, para o Gabriel (dono, 01/10/2026): Mariana x Gabriel. Ate a
 * Mariana atender, todas as vendas sao dele. O gasto do Meta fica em branco ate a conta de anuncio
 * dele estar ligada — e fora da conta do lucro, porque nao ha numero.
 */
function QuemFechouMariana({ d }: { d: PainelLucroConsultor }) {
  const t = d.resumo
  return (
    <section className="rounded-xl border border-dark-600 bg-dark-800/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-dark-50">Quem fechou</h2>
        <p className="text-base font-bold text-dark-50">{t.vendas} vendas {fraseDoPeriodo(d)}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Dono icone={<Bot className="h-4 w-4" />} nome="Mariana" cor={COR.isa} r={RESUMO_ZERO} total={t.vendas}
          detalhe="A Mariana ainda não está atendendo." />
        <Dono icone={<UserRound className="h-4 w-4" />} nome="Gabriel" cor={COR.clique} r={t} total={t.vendas}
          detalhe="Vendas com vistoria aprovada no Power." />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-dark-600 px-3 py-2 text-sm">
        <span className="text-dark-300">Gasto no Meta</span>
        <span className="font-semibold text-dark-50">— <span className="text-xs font-normal text-dark-400">ainda não conectado</span></span>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Tipos e testes**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: `tsc` **sem nenhum erro** (o de `LucroPage.tsx` da Task 3, se houve, some aqui); vitest PASS; `vite build` termina sem erro.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git add frontend/src/pages/lucro/LucroPage.tsx
git commit -m "feat(mariana): Lucro do Gabriel no formato da Leticya (Mariana x Gabriel, gasto do Meta em branco)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Conferência visual local (sem tocar produção)

**Files:** script de conferência no scratchpad da sessão (não vai para o repo).

O backend local precisa de banco; por isso a conferência visual usa o frontend em `vite dev` com as respostas da API **simuladas** pelo Playwright. Isso confere a tela; a regra de quem vê o quê já está coberta pelos testes das Tasks 1-3.

- [ ] **Step 1: Subir o frontend**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana/frontend"
npm run dev
```

(em segundo plano; porta 5173)

- [ ] **Step 2: Rodar o script** — criar `<scratchpad>/conferir-mariana.mjs` e rodar com `node` de dentro de uma pasta que tenha `playwright` (o `21go-website` tem puppeteer; usar o MCP de Playwright também serve). O script:

1. Grava em `localStorage['crm-auth-storage']` um estado persistido do zustand com `user` (id `ee11e4e3-64d1-457f-9f80-dbc90bf65644`, `firstName: 'Gabriel'`, `role: { id: 'vendedor', name: 'vendedor', displayName: 'Vendedor', level: 5 }`), `token: 'x'`, `isAuthenticated: true`, `realRole: 'vendedor'` (formato `{ state: {...}, version: 0 }`).
2. Intercepta `**/api/**`:
   - `/api/atendimento-isa/liberado` → `{ liberado: false, usuario: null, lucro: false, atendente: 'mariana' }`
   - `/api/atendimento-isa/lucro` → `{ modo: 'mariana', mes: '2026-10', de: '2026-10-01', ate: '2026-10-31', semPower: false, vendas: [], resumo: { vendas: 0, confirmadas: 0, receita: 0, taxa: 0, rastreador: 0, lucro: 0 } }`
   - `/api/atendimento-isa/lucro/caixa` → `{ caixa: 0, gastos: [] }`
   - qualquer chamada a `/api/atendimento-isa/contatos|conversa|etiquetas|funil|gastos` → **registrar como erro** (a Mariana não pode chamar) e responder 403
   - todo o resto → `200 {}` (ou `[]` para listas)
3. Abre `/atendimento`, `/gastos` e `/lucro` em 390x844 e 1366x768 e tira print de cada.

- [ ] **Step 3: Conferir os prints e o registro**

Expected:
- Menu com WhatsApp, Gastos e Lucro.
- `/atendimento`: cabeçalho "Mariana", 8 etiquetas, nenhuma "Falando com …", aviso de que ainda não atende.
- `/gastos`: dois quadros com "—" e "ainda não conectado".
- `/lucro`: bloco "Quem fechou" com Mariana e Gabriel e "Gasto no Meta —".
- Nenhuma rota da Isa chamada (registro vazio).
- Sem rolagem horizontal no celular.

Se algo falhar, corrigir na Task correspondente, rodar de novo e só então seguir.

- [ ] **Step 4: Parar o `vite dev`.**

---

### Task 8: Publicar em produção

**Files:** nenhum código. Servidor: `ubuntu@56.126.48.234` (chave `~/.ssh/claude_21go`), código em `/opt/crm21go`, env em `/opt/crm21go/.env.producao`.

- [ ] **Step 1: Linha de base** — o CRM tem que estar no ar antes de mexer:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm21go.site/login
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 'sudo docker exec crm printenv GIT_SHA'
```

Expected: `200` e um SHA. Anotar o SHA (é o que volta se der errado).

- [ ] **Step 2: Conferir que ninguém mais está deployando** — `git log origin/main --oneline -3` local e o SHA do container: se o `main` andou depois do worktree, fazer `git rebase origin/main` no branch e repetir os testes da Task 6, Step 3, e do backend (`npx vitest run src/modules/atendimento-isa` + `npx tsc --noEmit`).

- [ ] **Step 3: Subir o código para `main`**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/wt-gabriel-mariana"
git push origin feat/gabriel-mariana
git push origin feat/gabriel-mariana:main
```

Expected: o push em `main` é fast-forward. Se for recusado, `git fetch && git rebase origin/main`, testes de novo, push de novo. Nunca `--force` em `main`.

- [ ] **Step 4: Variável nova no servidor (aditiva, com cópia antes)**

```bash
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 '
set -euo pipefail
sudo cp /opt/crm21go/.env.producao /opt/crm21go/.env.producao.bak-$(date +%Y%m%d%H%M)
sudo grep -q "^ATENDIMENTO_MARIANA_USUARIOS=" /opt/crm21go/.env.producao || echo "ATENDIMENTO_MARIANA_USUARIOS=ee11e4e3-64d1-457f-9f80-dbc90bf65644:gabriel" | sudo tee -a /opt/crm21go/.env.producao >/dev/null
sudo sed -n "s/^ATENDIMENTO_MARIANA_USUARIOS=//p" /opt/crm21go/.env.producao
sudo sed -n "s/^ATENDIMENTO_ISA_USUARIOS=//p" /opt/crm21go/.env.producao | cut -c1-12
'
```

Expected: a linha da Mariana com o ID do Gabriel; a da Isa começando em `4e9d733d-e25` (inalterada).

- [ ] **Step 5: Build e troca do container** (mecânica da seção 14 do `CLAUDE.md` do CRM; `--cpuset-cpus` e `TZ` obrigatórios)

```bash
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 '
set -euo pipefail
cd /opt/crm21go
sudo git fetch origin main
sudo git reset --hard origin/main
SHA=$(sudo git rev-parse --short HEAD)
echo "SHA=$SHA"
sudo docker build --cpuset-cpus="0,1" -t crm21go:latest .
sudo docker rm -f crm
sudo docker run -d --name crm --restart unless-stopped \
  -e TZ=America/Sao_Paulo -e GIT_SHA=$SHA \
  --log-opt max-size=50m --log-opt max-file=5 \
  --env-file /opt/crm21go/.env.producao -e PORT=3333 -e NODE_ENV=production \
  -p 127.0.0.1:3333:3333 crm21go:latest
'
```

Expected: o SHA impresso é o do último commit da Task 6; o container sobe.

- [ ] **Step 6: Verificação obrigatória depois do deploy**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm21go.site/login
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 'sudo docker exec crm printenv GIT_SHA; sudo docker exec crm printenv ATENDIMENTO_MARIANA_USUARIOS; sudo docker exec crm date; sudo docker logs --tail 30 crm'
curl -s -o /dev/null -w "%{http_code}\n" https://crm21go.site/api/atendimento-isa/liberado
```

Expected: `200`; o SHA novo; a env da Mariana com o ID do Gabriel; `date` terminando em `-03`; logs sem erro de inicialização; a rota `/liberado` sem token responde `401` (está no ar e protegida).

Se o CRM não voltar `200`: restaurar já — `git reset --hard <SHA anotado no Step 1>` no servidor, build e `docker run` do Step 5 com esse SHA. Restaurar vem antes de investigar.

- [ ] **Step 7: Limpar o worktree**

```bash
cd "C:/Users/damas/Documents/PROJETOS/21 GO/21 GO - CRM"
git worktree remove "../wt-gabriel-mariana"
```

- [ ] **Step 8: Avisar o dono** — o que ficou no ar, o SHA, e que a conferência no login do próprio Gabriel não foi feita (sem a senha dele): pedir que ele abra o CRM do Gabriel e confirme os três botões.

---

## Fora deste plano

- A Mariana atendendo (número próprio, prompt com o nome Mariana, painel de conversas) — ciclo 2.
- Gasto real do Meta Ads do Gabriel e custo do WhatsApp da Mariana.
