# Painel do Consultor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Anderson Agripino um painel em `parceiroanderson.21go.com.br` onde ele vê os leads do site dele, cadastra divulgadores com login próprio e sabe quem trouxe cada lead — enquanto cada divulgador vê só o que ele mesmo trouxe.

**Architecture:** Tudo dentro do app Next que já serve `21go.com.br` (container `site21go` no Lightsail). O middleware ganha duas regras novas: host de parceiro → rewrite pra `/painel/<slug>/…`, e `/andersonagripino/<vendedor>` → home do consultor + cookie de atribuição. A posse do lead, que hoje só existe no PowerLink mandado ao PowerCRM, passa a ser gravada em duas colunas novas na tabela `leads`. Login com `crypto.scrypt` e sessão em cookie HMAC — nenhuma dependência nova.

**Tech Stack:** Next 15 (App Router) · React 19 · Tailwind 4 · Supabase (REST via service role) · `node:crypto` · `node --test` com TypeScript nativo do Node 24.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-18-painel-consultor-design.md`. Toda decisão já tomada mora lá.
- **REGRA 0 do projeto:** `21go.com.br` está vendido pra 18 consultores. Baseline de HTTP 200 antes e depois de qualquer deploy, sempre.
- **REGRA 0.1:** num site de consultor, todo contato vai pro número dele. Nada neste plano muda isso: o WhatsApp do sub-link do vendedor continua sendo o do Anderson.
- **Nenhuma dependência npm nova.** Build no VPS leva 20min–1h e lib nativa é o que estoura.
- **Nunca `import Link from 'next/link'`** — só `@/components/Link`. O `prebuild` (`scripts/verificar-consultor.mjs`) quebra o build se alguém fizer isso, e também se uma pasta nova de `src/app/` não entrar em `ROTAS_RESERVADAS`.
- **`<a href="/algo">` cru é proibido** pelo mesmo verificador. Use `<Link>` ou marque `data-sai-do-slug`.
- **Migração no banco compartilhado com o CRM:** só `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`. Nunca `drizzle-kit push`, nunca seed.
- **Paleta obrigatória da marca:** azul `#293C82`, laranja `#F2911D`, verde `#C7D301`.
- **Módulos puros (`src/lib/painel/*.ts`) não importam uns aos outros nem usam o alias `@/`.** Tudo que precisam chega por parâmetro. É o que permite `node --test` rodá-los direto, sem bundler.
- **Comentários em português**, explicando o *porquê* não-óbvio, no tom do resto do repo.
- **Commits em português:** `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Acesso à produção:** `ssh -i C:/Users/damas/.ssh/claude_21go ubuntu@56.126.48.234`. Container `site21go` em `127.0.0.1:3100`. Deploy: `sudo /opt/blog-autodeploy.sh`. Env canônico: `/opt/site21go/.env-site`.

---

### Task 1: Núcleo puro — slug, senha, sessão e formatação

Quatro módulos sem dependência de nada (nem entre si). São a parte do painel que dá pra provar com teste de verdade, então vêm primeiro.

**Files:**
- Create: `21go-website/src/lib/painel/slug.ts`
- Create: `21go-website/src/lib/painel/senha.ts`
- Create: `21go-website/src/lib/painel/sessao.ts`
- Create: `21go-website/src/lib/painel/formato.ts`
- Create: `21go-website/testes/painel/slug.test.ts`
- Create: `21go-website/testes/painel/senha.test.ts`
- Create: `21go-website/testes/painel/sessao.test.ts`
- Create: `21go-website/testes/painel/formato.test.ts`
- Modify: `21go-website/package.json` (script `test:painel`)
- Modify: `21go-website/tsconfig.json` (`exclude`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizarSlug(nome: string): string`
  - `slugDeVendedor(a: { nome: string; whatsapp: string; existentes: Set<string>; reservadas: Set<string> }): string | null`
  - `hashSenha(senha: string): string` · `conferirSenha(senha: string, hash: string): boolean` · `gerarSenha(tamanho?: number): string`
  - `type Papel = 'admin' | 'vendedor'`
  - `interface Sessao { uid: string; slug: string; papel: Papel; v: number; exp: number }`
  - `assinarSessao(s: Sessao, segredo: string): string` · `lerSessao(token: string, segredo: string, agora?: number): Sessao | null`
  - `normalizarWhatsapp(bruto: string): string | null` · `mascararTelefone(tel: string): string` · `formatarTelefone(tel: string): string`

- [ ] **Step 1: Abrir espaço pros testes fora do olhar do Next**

`21go-website/tsconfig.json` — adicionar `"testes"` ao `exclude`:

```json
  "exclude": [
    "node_modules",
    "testes"
  ]
```

O Next roda `tsc` sobre tudo que o `include` alcança. Arquivo de teste importa com extensão `.ts` explícita (o Node exige), e isso é erro pro TS com `moduleResolution: bundler` — mantendo os testes fora do `include`, as duas ferramentas convivem sem flag nova.

`21go-website/package.json` — adicionar o script:

```json
    "test:painel": "node --test testes/painel/",
```

- [ ] **Step 2: Escrever os testes que falham**

`21go-website/testes/painel/slug.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarSlug, slugDeVendedor } from '../../src/lib/painel/slug.ts'

const RESERVADAS = new Set(['cotacao', 'faq', 'blog'])

test('normaliza tirando acento, espaço e maiúscula', () => {
  assert.equal(normalizarSlug('José da Silva'), 'josedasilva')
  assert.equal(normalizarSlug('Juliano'), 'juliano')
})

test('corta em 40 caracteres', () => {
  assert.equal(normalizarSlug('a'.repeat(60)).length, 40)
})

test('nome livre vira o próprio slug', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano')
})

test('nome repetido ganha os 4 últimos dígitos do celular', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(['juliano']),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano8062')
})

test('mesmo nome e mesmo final de celular ainda desempata', () => {
  const s = slugDeVendedor({
    nome: 'Juliano',
    whatsapp: '5521992208062',
    existentes: new Set(['juliano', 'juliano8062']),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'juliano80622')
})

test('nunca devolve rota do site — senão a cotação do consultor sai do ar', () => {
  const s = slugDeVendedor({
    nome: 'Cotação',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, 'cotacao8062')
})

test('nome curto demais não vira slug', () => {
  const s = slugDeVendedor({
    nome: 'Jô',
    whatsapp: '5521992208062',
    existentes: new Set(),
    reservadas: RESERVADAS,
  })
  assert.equal(s, null)
})

test('slug com sufixo nunca passa de 40 caracteres', () => {
  const s = slugDeVendedor({
    nome: 'a'.repeat(60),
    whatsapp: '5521992208062',
    existentes: new Set(['a'.repeat(40)]),
    reservadas: RESERVADAS,
  })
  assert.equal(s!.length, 40)
  assert.ok(s!.endsWith('8062'))
})
```

`21go-website/testes/painel/senha.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashSenha, conferirSenha, gerarSenha } from '../../src/lib/painel/senha.ts'

test('senha certa confere', () => {
  const h = hashSenha('segredo123')
  assert.ok(conferirSenha('segredo123', h))
})

test('senha errada não confere', () => {
  const h = hashSenha('segredo123')
  assert.equal(conferirSenha('segredo124', h), false)
})

test('mesma senha gera hashes diferentes — o salt é por senha', () => {
  assert.notEqual(hashSenha('segredo123'), hashSenha('segredo123'))
})

test('hash corrompido não derruba, só devolve falso', () => {
  assert.equal(conferirSenha('x', 'lixo'), false)
  assert.equal(conferirSenha('x', 'scrypt$zz$zz'), false)
})

test('senha gerada não tem caractere que se confunde em print', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(gerarSenha(), /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/)
  }
})
```

`21go-website/testes/painel/sessao.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assinarSessao, lerSessao, type Sessao } from '../../src/lib/painel/sessao.ts'

const SEGREDO = 'segredo-de-teste'
const BASE: Sessao = {
  uid: 'pu_abc',
  slug: 'andersonagripino',
  papel: 'admin',
  v: 1,
  exp: 2_000_000_000_000,
}

test('ida e volta preserva a sessão', () => {
  const lida = lerSessao(assinarSessao(BASE, SEGREDO), SEGREDO, 1_000)
  assert.deepEqual(lida, BASE)
})

test('assinatura de outro segredo é recusada', () => {
  assert.equal(lerSessao(assinarSessao(BASE, 'outro'), SEGREDO, 1_000), null)
})

test('payload adulterado é recusado', () => {
  const token = assinarSessao(BASE, SEGREDO)
  const [carga, assinatura] = token.split('.')
  const falso = Buffer.from(
    JSON.stringify({ ...BASE, papel: 'admin', uid: 'pu_outro' }),
  ).toString('base64url')
  assert.notEqual(carga, falso)
  assert.equal(lerSessao(`${falso}.${assinatura}`, SEGREDO, 1_000), null)
})

test('sessão vencida é recusada', () => {
  const vencida = { ...BASE, exp: 1_000 }
  assert.equal(lerSessao(assinarSessao(vencida, SEGREDO), SEGREDO, 2_000), null)
})

test('lixo não derruba', () => {
  assert.equal(lerSessao('', SEGREDO, 1), null)
  assert.equal(lerSessao('sem-ponto', SEGREDO, 1), null)
  assert.equal(lerSessao('a.b.c', SEGREDO, 1), null)
})
```

`21go-website/testes/painel/formato.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarWhatsapp,
  mascararTelefone,
  formatarTelefone,
} from '../../src/lib/painel/formato.ts'

test('normaliza celular digitado de qualquer jeito', () => {
  assert.equal(normalizarWhatsapp('(21) 99220-8062'), '5521992208062')
  assert.equal(normalizarWhatsapp('+55 21 99220-8062'), '5521992208062')
  assert.equal(normalizarWhatsapp('21992208062'), '5521992208062')
})

test('número curto demais não passa', () => {
  assert.equal(normalizarWhatsapp('9922'), null)
  assert.equal(normalizarWhatsapp(''), null)
})

test('máscara mostra DDD e 4 últimos — o resto não', () => {
  assert.equal(mascararTelefone('5521992208062'), '(21) *****-8062')
})

test('máscara aguenta valor estranho sem estourar', () => {
  assert.equal(mascararTelefone(''), '—')
  assert.equal(mascararTelefone('123'), '—')
})

test('admin vê o número inteiro, legível', () => {
  assert.equal(formatarTelefone('5521992208062'), '(21) 99220-8062')
  assert.equal(formatarTelefone('552133334444'), '(21) 3333-4444')
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "21go-website" && npm run test:painel
```

Esperado: FAIL — `Cannot find module '.../src/lib/painel/slug.ts'` nos quatro arquivos.

- [ ] **Step 4: Implementar `slug.ts`**

`21go-website/src/lib/painel/slug.ts`:

```ts
/**
 * O slug do divulgador dentro do site do consultor: `/andersonagripino/juliano`.
 *
 * Modulo puro de proposito — nao importa nada, nem o `@/lib/rotas-reservadas`.
 * A lista de rotas chega por parametro. E o que permite `node --test` rodar
 * isto direto, sem bundler, e e a unica parte do painel que da pra provar sem
 * subir servidor.
 */

const TAMANHO_MAXIMO = 40
const TAMANHO_MINIMO = 3

export function normalizarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, TAMANHO_MAXIMO)
}

/**
 * Devolve `null` quando o nome nao gera slug valido (ex.: "Jo"). Quem chama
 * transforma isso em "digite seu nome completo" — melhor que emitir um link
 * que o consultor vai imprimir e depois nao resolver.
 */
export function slugDeVendedor(a: {
  nome: string
  whatsapp: string
  existentes: Set<string>
  reservadas: Set<string>
}): string | null {
  const base = normalizarSlug(a.nome)
  if (base.length < TAMANHO_MINIMO) return null

  const ocupado = (s: string) => a.existentes.has(s) || a.reservadas.has(s)

  if (!ocupado(base)) return base

  /**
   * Desempate pelos 4 ultimos digitos do celular, e nao por "2", "3": o link e
   * ditado no WhatsApp e escrito em post de Instagram. "juliano8062" a pessoa
   * reconhece como dela; "juliano2" ninguem lembra de quem e.
   */
  const finalCelular = a.whatsapp.replace(/\D/g, '').slice(-4)
  const comFinal = `${base.slice(0, TAMANHO_MAXIMO - finalCelular.length)}${finalCelular}`
  if (!ocupado(comFinal)) return comFinal

  for (let n = 2; n < 100; n++) {
    const sufixo = `${finalCelular}${n}`
    const tentativa = `${base.slice(0, TAMANHO_MAXIMO - sufixo.length)}${sufixo}`
    if (!ocupado(tentativa)) return tentativa
  }
  return null
}
```

- [ ] **Step 5: Implementar `senha.ts`**

`21go-website/src/lib/painel/senha.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Senha do painel. `scrypt` do proprio Node em vez de bcrypt: o build roda num
 * VPS que leva de 20min a 1h e ja estourou memoria por lib pesada — dependencia
 * nativa nova ali e risco desproporcional pra um painel de um cliente.
 */

const SAL_BYTES = 16
const CHAVE_BYTES = 64

/** Sem `0/O` e sem `1/I/l`: a senha vai ser lida em print de celular. */
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz'

export function hashSenha(senha: string): string {
  const sal = randomBytes(SAL_BYTES)
  const chave = scryptSync(senha, sal, CHAVE_BYTES)
  return `scrypt$${sal.toString('hex')}$${chave.toString('hex')}`
}

export function conferirSenha(senha: string, hash: string): boolean {
  try {
    const [algoritmo, salHex, chaveHex] = hash.split('$')
    if (algoritmo !== 'scrypt' || !salHex || !chaveHex) return false
    const esperada = Buffer.from(chaveHex, 'hex')
    if (esperada.length !== CHAVE_BYTES) return false
    const calculada = scryptSync(senha, Buffer.from(salHex, 'hex'), CHAVE_BYTES)
    return timingSafeEqual(esperada, calculada)
  } catch {
    // Hash corrompido nao pode virar erro 500 na tela de login: vira "senha
    // incorreta", que e o efeito pratico correto.
    return false
  }
}

export function gerarSenha(tamanho = 8): string {
  const bytes = randomBytes(tamanho)
  let s = ''
  for (let i = 0; i < tamanho; i++) s += ALFABETO[bytes[i] % ALFABETO.length]
  return s
}
```

- [ ] **Step 6: Implementar `sessao.ts`**

`21go-website/src/lib/painel/sessao.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Sessao do painel num cookie assinado, sem tabela de sessao.
 *
 * O `v` e o `token_versao` do usuario. Excluir, desativar ou redefinir a senha
 * incrementa a coluna — e toda sessao viva daquela pessoa morre no request
 * seguinte, sem precisar caçar token nenhum.
 */

export type Papel = 'admin' | 'vendedor'

export interface Sessao {
  uid: string
  slug: string
  papel: Papel
  v: number
  /** Epoch em ms. */
  exp: number
}

export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000

function assinar(carga: string, segredo: string): string {
  return createHmac('sha256', segredo).update(carga).digest('base64url')
}

export function assinarSessao(s: Sessao, segredo: string): string {
  const carga = Buffer.from(JSON.stringify(s)).toString('base64url')
  return `${carga}.${assinar(carga, segredo)}`
}

export function lerSessao(token: string, segredo: string, agora = Date.now()): Sessao | null {
  try {
    const partes = token.split('.')
    if (partes.length !== 2) return null
    const [carga, assinatura] = partes

    const esperada = Buffer.from(assinar(carga, segredo))
    const recebida = Buffer.from(assinatura)
    if (esperada.length !== recebida.length) return null
    if (!timingSafeEqual(esperada, recebida)) return null

    const s = JSON.parse(Buffer.from(carga, 'base64url').toString()) as Sessao
    if (!s?.uid || !s?.slug || (s.papel !== 'admin' && s.papel !== 'vendedor')) return null
    if (typeof s.exp !== 'number' || s.exp <= agora) return null
    return s
  } catch {
    return null
  }
}
```

- [ ] **Step 7: Implementar `formato.ts`**

`21go-website/src/lib/painel/formato.ts`:

```ts
/**
 * Telefone na tela do painel.
 *
 * O vendedor ve o numero MASCARADO. Ele trouxe o lead, mas quem atende e fecha
 * e o consultor — numero cheio na mao do divulgador e o caminho pra ele fechar
 * por fora e o consultor pagar comissao por uma venda que nao existiu no funil
 * dele. Admin ve inteiro.
 */

export function normalizarWhatsapp(bruto: string): string | null {
  const so = (bruto || '').replace(/\D/g, '')
  if (so.length < 10) return null
  const com55 = so.startsWith('55') ? so : `55${so}`
  if (com55.length < 12 || com55.length > 13) return null
  return com55
}

function partes(tel: string): { ddd: string; numero: string } | null {
  const so = (tel || '').replace(/\D/g, '')
  const sem55 = so.startsWith('55') ? so.slice(2) : so
  if (sem55.length < 10 || sem55.length > 11) return null
  return { ddd: sem55.slice(0, 2), numero: sem55.slice(2) }
}

export function mascararTelefone(tel: string): string {
  const p = partes(tel)
  if (!p) return '—'
  return `(${p.ddd}) ${'*'.repeat(p.numero.length - 4)}-${p.numero.slice(-4)}`
}

export function formatarTelefone(tel: string): string {
  const p = partes(tel)
  if (!p) return '—'
  const corte = p.numero.length - 4
  return `(${p.ddd}) ${p.numero.slice(0, corte)}-${p.numero.slice(corte)}`
}
```

- [ ] **Step 8: Rodar e ver passar**

```bash
cd "21go-website" && npm run test:painel
```

Esperado: PASS — `pass 24`, `fail 0`.

- [ ] **Step 9: Commit**

```bash
git add 21go-website/src/lib/painel 21go-website/testes 21go-website/package.json 21go-website/tsconfig.json
git commit -m "feat(painel): nucleo puro — slug do vendedor, senha, sessao e mascara de telefone

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Migração 276 — tabela de usuários e a posse do lead

A tabela `leads` não guarda de quem é o lead: a posse hoje só existe no `slsmnNwId` mandado pro PowerCRM. Sem essas duas colunas, nenhuma tela do painel existe.

**Files:**
- Create: `21go-website/supabase/migrations/276_painel_consultor.sql`
- Create: `21go-website/scripts/aplicar-migracao.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `painel_usuarios` e colunas `leads.consultor_slug` / `leads.vendedor_slug`.

- [ ] **Step 1: Escrever a migração**

`21go-website/supabase/migrations/276_painel_consultor.sql`:

```sql
-- =============================================================================
-- 276_painel_consultor.sql
-- Painel do parceiro: o consultor ve os leads do site dele e quem trouxe cada
-- um; o divulgador ve so o que ele mesmo trouxe.
--
-- ⚠️ Banco compartilhado com o CRM. Tudo aqui e ADITIVO: nenhuma coluna
-- existente e tocada, nenhuma linha e reescrita fora do backfill explicito la
-- embaixo (que so preenche coluna nova).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.painel_usuarios (
  id             text PRIMARY KEY,
  company_id     text NOT NULL DEFAULT 'company-21go',

  -- De quem e o painel. Toda query filtra por isto, sempre tirado da SESSAO —
  -- nunca do host nem da URL.
  consultor_slug text NOT NULL,

  papel          text NOT NULL DEFAULT 'vendedor',   -- 'admin' | 'vendedor'
  nome           text NOT NULL,
  email          text NOT NULL,
  senha_hash     text NOT NULL,
  whatsapp       text,                                -- E.164 sem '+'

  -- O `<este>` de 21go.com.br/andersonagripino/<este>. Imutavel depois de
  -- emitido: a pessoa espalha o link em post e print, e trocar quebra tudo que
  -- ela ja divulgou.
  vendedor_slug  text NOT NULL,

  -- Sobe de 1 a cada exclusao, desativacao ou troca de senha. Como a sessao
  -- carrega este numero assinado, subir aqui mata toda sessao viva da pessoa no
  -- request seguinte — sem tabela de sessao, sem consulta extra.
  token_versao   integer NOT NULL DEFAULT 1,

  ativo          boolean NOT NULL DEFAULT true,

  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_login_em timestamptz
);

-- Um e-mail entra uma vez por painel. Dois cadastros do mesmo e-mail seriam
-- dois links concorrendo pela mesma pessoa, cada um contando metade.
CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_email
  ON public.painel_usuarios(consultor_slug, lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_vendedor
  ON public.painel_usuarios(consultor_slug, vendedor_slug);

CREATE INDEX IF NOT EXISTS ix_painel_usuarios_consultor
  ON public.painel_usuarios(consultor_slug) WHERE ativo;

-- ─── a posse do lead ────────────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consultor_slug text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vendedor_slug  text;

CREATE INDEX IF NOT EXISTS ix_leads_consultor_slug
  ON public.leads(consultor_slug, created_at DESC) WHERE consultor_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_leads_vendedor_slug
  ON public.leads(vendedor_slug, created_at DESC) WHERE vendedor_slug IS NOT NULL;

-- ─── backfill best-effort do historico ──────────────────────────────────────
-- O carimbo nao existia, mas a URL de entrada foi guardada. Vendedor historico
-- nao ha: o link nunca foi emitido, entao o painel do divulgador comeca zerado
-- e isso esta certo.
UPDATE public.leads
   SET consultor_slug = 'andersonagripino'
 WHERE consultor_slug IS NULL
   AND landing_page ILIKE '%/andersonagripino%';
```

- [ ] **Step 2: Escrever o aplicador**

`21go-website/scripts/aplicar-migracao.mjs`:

```js
import { readFileSync } from 'node:fs'
import pg from 'pg'

/**
 * Aplica UM arquivo .sql no banco, por conexao direta.
 *
 * Roda DENTRO do container (`docker exec site21go node /tmp/aplicar-migracao.mjs
 * /tmp/276.sql`): a `SUPABASE_DB_URL` so existe la, e de proposito.
 *
 * Sem transacao envolvendo tudo? Nao — tem transacao: ou a migracao inteira
 * entra, ou nada entra. Meia migracao num banco compartilhado com o CRM e o
 * pior dos mundos.
 */

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('uso: node aplicar-migracao.mjs <arquivo.sql>')
  process.exit(1)
}

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL ausente — rode isto dentro do container site21go')
  process.exit(1)
}

const sql = readFileSync(arquivo, 'utf8')
const cliente = new pg.Client({ connectionString: url })

await cliente.connect()
try {
  await cliente.query('BEGIN')
  await cliente.query(sql)
  await cliente.query('COMMIT')
  console.log(`✓ aplicado: ${arquivo}`)
} catch (err) {
  await cliente.query('ROLLBACK')
  console.error(`✗ falhou, nada foi aplicado: ${err.message}`)
  process.exitCode = 1
} finally {
  await cliente.end()
}
```

- [ ] **Step 3: Baseline antes de tocar no banco (REGRA 0)**

```bash
curl -s -o /dev/null -w "site=%{http_code}\n" https://21go.com.br
curl -s -o /dev/null -w "consultor=%{http_code}\n" https://21go.com.br/andersonagripino
```

Esperado: `site=200`, `consultor=200`. Se algum não for 200, **parar** — não é hora de migrar.

- [ ] **Step 4: Aplicar no Supabase**

```bash
SSH="ssh -i C:/Users/damas/.ssh/claude_21go ubuntu@56.126.48.234"
scp -i C:/Users/damas/.ssh/claude_21go \
  "21go-website/supabase/migrations/276_painel_consultor.sql" \
  "21go-website/scripts/aplicar-migracao.mjs" \
  ubuntu@56.126.48.234:/tmp/
$SSH "docker cp /tmp/276_painel_consultor.sql site21go:/tmp/276.sql \
  && docker cp /tmp/aplicar-migracao.mjs site21go:/tmp/aplicar-migracao.mjs \
  && docker exec site21go node /tmp/aplicar-migracao.mjs /tmp/276.sql"
```

Esperado: `✓ aplicado: /tmp/276.sql`

- [ ] **Step 5: Conferir que entrou (e que o CRM não sentiu)**

```bash
$SSH "docker exec site21go node -e \"
const pg=require('pg');const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL});
c.connect().then(async()=>{
  const t=await c.query(\\\"select count(*)::int n from information_schema.columns where table_name='painel_usuarios'\\\");
  const l=await c.query(\\\"select count(*)::int n from information_schema.columns where table_name='leads' and column_name in ('consultor_slug','vendedor_slug')\\\");
  const b=await c.query(\\\"select count(*)::int n from leads where consultor_slug='andersonagripino'\\\");
  console.log('colunas painel_usuarios:',t.rows[0].n,'| colunas novas em leads:',l.rows[0].n,'| leads do anderson:',b.rows[0].n);
  await c.end();
});\""
```

Esperado: `colunas painel_usuarios: 14 | colunas novas em leads: 2 | leads do anderson: <n>`, com `n ≥ 0`.

- [ ] **Step 6: Commit**

```bash
git add 21go-website/supabase/migrations/276_painel_consultor.sql 21go-website/scripts/aplicar-migracao.mjs
git commit -m "feat(painel): migracao 276 — painel_usuarios e a posse do lead em leads

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Atribuição — o link `/andersonagripino/juliano`

Aqui mora o risco do plano inteiro: o middleware serve os 18 sites vendidos. A regra nova só roda pra quem está no mapa.

**Files:**
- Create: `21go-website/src/lib/consultores-painel.ts`
- Create: `21go-website/src/lib/painel/rotas.ts`
- Create: `21go-website/testes/painel/rotas.test.ts`
- Modify: `21go-website/src/middleware.ts`

**Interfaces:**
- Consumes: `ROTAS_RESERVADAS` de `@/lib/rotas-reservadas`.
- Produces:
  - `PAINEL_POR_HOST: Record<string, string>` · `PAINEL_POR_CONSULTOR: Set<string>` · `COOKIE_VENDEDOR = 'c21go_vend'`
  - `painelDoHost(host: string, mapa: Record<string, string>): string | null`
  - `vendedorDoCaminho(segmentos: string[], reservadas: Set<string>): { vendedor: string; resto: string } | null`

- [ ] **Step 1: Escrever o teste que falha**

`21go-website/testes/painel/rotas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { painelDoHost, vendedorDoCaminho } from '../../src/lib/painel/rotas.ts'

const MAPA = { 'parceiroanderson.21go.com.br': 'andersonagripino' }
const RESERVADAS = new Set(['cotacao', 'faq', 'blog', 'api', 'painel'])

test('host de parceiro devolve o consultor', () => {
  assert.equal(painelDoHost('parceiroanderson.21go.com.br', MAPA), 'andersonagripino')
})

test('host com porta ainda resolve', () => {
  assert.equal(painelDoHost('parceiroanderson.21go.com.br:3000', MAPA), 'andersonagripino')
})

test('host normal do site não é painel', () => {
  assert.equal(painelDoHost('21go.com.br', MAPA), null)
  assert.equal(painelDoHost('painel.21go.com.br', MAPA), null)
  assert.equal(painelDoHost('', MAPA), null)
})

test('segundo segmento comum vira vendedor e o resto é a home', () => {
  assert.deepEqual(vendedorDoCaminho(['andersonagripino', 'juliano'], RESERVADAS), {
    vendedor: 'juliano',
    resto: '/',
  })
})

test('vendedor com página depois preserva o caminho', () => {
  assert.deepEqual(
    vendedorDoCaminho(['andersonagripino', 'juliano', 'cotacao'], RESERVADAS),
    { vendedor: 'juliano', resto: '/cotacao' },
  )
})

test('rota do site NÃO é vendedor — senão a cotação sai do ar', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino', 'cotacao'], RESERVADAS), null)
  assert.equal(vendedorDoCaminho(['andersonagripino', 'blog', 'post'], RESERVADAS), null)
})

test('só o slug do consultor não é vendedor', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino'], RESERVADAS), null)
})

test('segmento fora do formato não é vendedor', () => {
  assert.equal(vendedorDoCaminho(['andersonagripino', 'ab'], RESERVADAS), null)
  assert.equal(vendedorDoCaminho(['andersonagripino', 'jo-ao'], RESERVADAS), null)
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "21go-website" && npm run test:painel
```

Esperado: FAIL — `Cannot find module '.../src/lib/painel/rotas.ts'`.

- [ ] **Step 3: Implementar `rotas.ts`**

`21go-website/src/lib/painel/rotas.ts`:

```ts
/**
 * As duas decisoes de roteamento do painel. Puro e sem import de proposito:
 * quem roda isto e o middleware, que roda em TODA navegacao dos 18 sites
 * vendidos. Erro aqui nao aparece como erro — aparece como consultor
 * reclamando que pagou anuncio e nao recebeu lead.
 */

const FORMATO_SLUG = /^[a-z0-9]{3,40}$/

/** `parceiroanderson.21go.com.br` -> `andersonagripino`. */
export function painelDoHost(host: string, mapa: Record<string, string>): string | null {
  if (!host) return null
  // `host` vem com porta em dev (`...:3000`).
  return mapa[host.split(':')[0].toLowerCase()] ?? null
}

/**
 * `/andersonagripino/juliano/cotacao` -> vendedor `juliano`, resto `/cotacao`.
 *
 * Quem chama ja conferiu que o 1o segmento e um consultor COM painel. Sem esse
 * corte, `/manghi/qualquercoisa` deixaria de ser 404 nos outros 17 sites.
 */
export function vendedorDoCaminho(
  segmentos: string[],
  reservadas: Set<string>,
): { vendedor: string; resto: string } | null {
  const candidato = segmentos[1]
  if (!candidato) return null
  if (reservadas.has(candidato)) return null
  if (!FORMATO_SLUG.test(candidato)) return null
  return { vendedor: candidato, resto: `/${segmentos.slice(2).join('/')}` }
}
```

- [ ] **Step 4: Implementar o mapa**

`21go-website/src/lib/consultores-painel.ts`:

```ts
/**
 * Quem tem painel de parceiro, e em qual endereco.
 *
 * Mora no codigo, e nao no banco, pelo mesmo motivo do `PIXEL_POR_CONSULTOR` e
 * do `VIDEO_POR_CONSULTOR`: o middleware le isto a cada request e uma consulta
 * por pageview num banco compartilhado com o CRM ja derrubou a gravacao de lead
 * do site uma vez.
 *
 * Parceiro novo = 3 passos aditivos: registro A no Cloudflare apontando pra
 * 56.126.48.234 DNS-ONLY (proxied quebra a emissao do certificado pelo Caddy),
 * bloco novo no /etc/caddy/Caddyfile com reverse_proxy 127.0.0.1:3100, e uma
 * linha aqui.
 */
export const PAINEL_POR_HOST: Record<string, string> = {
  'parceiroanderson.21go.com.br': 'andersonagripino',
}

/**
 * Os consultores cujo site aceita `/<slug>/<vendedor>`. Derivado do mapa acima
 * de proposito: um painel sem link de divulgacao, ou um link sem painel pra
 * conferir o resultado, seria meia funcionalidade.
 */
export const PAINEL_POR_CONSULTOR = new Set(Object.values(PAINEL_POR_HOST))

/**
 * Quem trouxe a visita. Vive 30 dias, ao contrario do `c21go_dono` (que e de
 * sessao): o dono existe pra sobreviver a um clique perdido dentro da mesma
 * visita; este define quem recebe comissao, e o visitante costuma voltar
 * depois pra fechar.
 */
export const COOKIE_VENDEDOR = 'c21go_vend'
export const DIAS_COOKIE_VENDEDOR = 30
```

- [ ] **Step 5: Ligar no middleware**

`21go-website/src/middleware.ts` — adicionar aos imports do topo:

```ts
import {
  PAINEL_POR_HOST,
  PAINEL_POR_CONSULTOR,
  COOKIE_VENDEDOR,
  DIAS_COOKIE_VENDEDOR,
} from '@/lib/consultores-painel'
import { painelDoHost, vendedorDoCaminho } from '@/lib/painel/rotas'
```

Logo depois do bloco do `meusite.` (antes de `const segmentos = ...`), inserir:

```ts
  /**
   * `parceiroanderson.21go.com.br` — o painel do parceiro.
   *
   * Vem antes da logica de slug pelo mesmo motivo do `meusite.`: nada num host
   * de painel pode ser lido como site de consultor. O slug sai do HOST, nunca
   * da URL, e as rotas ainda conferem contra a sessao.
   */
  const slugDoPainel = painelDoHost(req.headers.get('host') ?? '', PAINEL_POR_HOST)
  if (slugDoPainel) {
    const res = NextResponse.rewrite(
      new URL(`/painel/${slugDoPainel}${pathname === '/' ? '' : pathname}${search}`, req.url),
    )
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }
```

E dentro do trecho que já trata slug de consultor, **depois** de `const ehHome = segmentos.length === 1`, inserir:

```ts
  /**
   * `/andersonagripino/juliano` — o link do divulgador.
   *
   * So pra quem tem painel: sem este corte, `/manghi/qualquercoisa` deixaria de
   * ser 404 nos outros 17 sites vendidos, e um erro de digitacao passaria a
   * servir a home como se fosse pagina de alguem.
   *
   * O slug do vendedor NAO precisa sobreviver na URL: o cookie carrega a
   * atribuicao, a mesma rede que ja resolve a corrida de hidratacao da REGRA
   * 0.1. Por isso o rewrite manda pro caminho normal do site.
   */
  if (PAINEL_POR_CONSULTOR.has(primeiro)) {
    const doVendedor = vendedorDoCaminho(segmentos, ROTAS_RESERVADAS)
    if (doVendedor) {
      const res = NextResponse.rewrite(new URL(`${doVendedor.resto}${search}`, req.url))
      res.headers.set('X-Robots-Tag', 'noindex, nofollow')
      marcarDono(res, primeiro)
      res.cookies.set(COOKIE_VENDEDOR, doVendedor.vendedor, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        maxAge: DIAS_COOKIE_VENDEDOR * 24 * 60 * 60,
      })
      return res
    }
  }
```

- [ ] **Step 6: Gravar a atribuição no lead**

`21go-website/src/lib/supabase-store.ts` — na interface `UpsertLeadInput`, junto dos outros campos opcionais:

```ts
  // Posse do lead. Ate 08/2026 isto so existia no `slsmnNwId` mandado pro
  // PowerCRM — nao dava pra montar nenhuma tela a partir do nosso banco.
  consultor_slug?: string | null
  vendedor_slug?: string | null
```

E no objeto `row`, junto de `indicado_por`:

```ts
    consultor_slug: input.consultor_slug ?? null,
    vendedor_slug: input.vendedor_slug ?? null,
```

`21go-website/src/app/api/vehicle/lead/route.ts` — junto de onde o `consultorSlug` já é resolvido pelo cookie (por volta da linha 166), acrescentar a resolução do vendedor:

```ts
  /**
   * Quem trouxe. Mesmo padrao do `consultorSlug`: o corpo so vem preenchido se
   * a pagina ja tinha hidratado, entao o cookie carimbado pelo servidor e a
   * rede. Conferimos contra o banco antes de gravar — carimbo errado vale menos
   * que carimbo nenhum, porque vira comissao paga pra quem nao trouxe.
   */
  const vendedorSlug = await vendedorValido(
    body.consultorSlug ?? null,
    body.vendedorSlug ?? req.cookies.get('c21go_vend')?.value ?? null,
  )
```

Adicionar `vendedorSlug?: string | null` na interface do corpo (junto de `consultorSlug`), e a função auxiliar logo abaixo de `powerlinkDoLead`:

```ts
/**
 * Devolve o slug do vendedor so se ele existir e estiver ativo naquele painel.
 * Uma consulta por lead — nao por pageview — entao o custo e desprezivel.
 */
async function vendedorValido(
  consultorSlug: string | null,
  vendedorSlug: string | null,
): Promise<string | null> {
  if (!consultorSlug || !vendedorSlug) return null
  try {
    const { data } = await supabaseAdmin()
      .from('painel_usuarios')
      .select('vendedor_slug')
      .eq('consultor_slug', consultorSlug)
      .eq('vendedor_slug', vendedorSlug)
      .eq('ativo', true)
      .maybeSingle()
    return data ? vendedorSlug : null
  } catch {
    return null
  }
}
```

E onde o `upsertLead` é chamado (por volta da linha 858), passar os dois campos:

```ts
      consultor_slug: body.consultorSlug ?? null,
      vendedor_slug: vendedorSlug,
```

- [ ] **Step 7: Rodar os testes e o build**

```bash
cd "21go-website" && npm run test:painel && npm run build
```

Esperado: `pass 32, fail 0` e build concluído (o `prebuild` imprime `✓ sites de consultor: …`).

- [ ] **Step 8: Commit**

```bash
git add 21go-website/src/lib/consultores-painel.ts 21go-website/src/lib/painel/rotas.ts \
        21go-website/testes/painel/rotas.test.ts 21go-website/src/middleware.ts \
        21go-website/src/lib/supabase-store.ts 21go-website/src/app/api/vehicle/lead/route.ts
git commit -m "feat(painel): link /andersonagripino/<vendedor> carimba quem trouxe o lead

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Usuários e sessão no servidor

**Files:**
- Create: `21go-website/src/lib/painel/usuarios.ts`
- Create: `21go-website/src/lib/painel/contexto.ts`
- Create: `21go-website/src/app/api/painel/entrar/route.ts`
- Create: `21go-website/src/app/api/painel/sair/route.ts`
- Create: `21go-website/src/app/api/painel/cadastro/route.ts`

**Interfaces:**
- Consumes: `hashSenha`, `conferirSenha`, `gerarSenha` (`@/lib/painel/senha`); `assinarSessao`, `lerSessao`, `DURACAO_SESSAO_MS`, `type Sessao`, `type Papel` (`@/lib/painel/sessao`); `slugDeVendedor` (`@/lib/painel/slug`); `normalizarWhatsapp` (`@/lib/painel/formato`); `PAINEL_POR_HOST`, `painelDoHost`; `supabaseAdmin`; `ROTAS_RESERVADAS`.
- Produces:
  - `interface UsuarioPainel { id, consultorSlug, papel, nome, email, whatsapp, vendedorSlug, tokenVersao, ativo, criadoEm, ultimoLoginEm }`
  - `buscarPorEmail(consultorSlug, email): Promise<(UsuarioPainel & { senhaHash: string }) | null>`
  - `listarUsuarios(consultorSlug): Promise<UsuarioPainel[]>`
  - `criarUsuario(a: { consultorSlug, nome, email, whatsapp, senha, papel }): Promise<UsuarioPainel>` — lança `Error('email_em_uso')` ou `Error('nome_invalido')`
  - `atualizarUsuario(id, consultorSlug, patch)`, `redefinirSenha(id, consultorSlug, senha?)`, `desativarUsuario(id, consultorSlug)`
  - `COOKIE_SESSAO = 'painel_sess'` · `segredoSessao(): string` · `sessaoDaRequisicao(req): Promise<Sessao | null>` · `exigirSessao(req, papel?)`

- [ ] **Step 1: Repositório de usuários**

`21go-website/src/lib/painel/usuarios.ts`:

```ts
import 'server-only'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '../supabase-admin'
import { ROTAS_RESERVADAS } from '../rotas-reservadas'
import { hashSenha, gerarSenha } from './senha'
import { slugDeVendedor } from './slug'
import type { Papel } from './sessao'

export interface UsuarioPainel {
  id: string
  consultorSlug: string
  papel: Papel
  nome: string
  email: string
  whatsapp: string | null
  vendedorSlug: string
  tokenVersao: number
  ativo: boolean
  criadoEm: string
  ultimoLoginEm: string | null
}

const COLUNAS =
  'id, consultor_slug, papel, nome, email, whatsapp, vendedor_slug, token_versao, ativo, criado_em, ultimo_login_em'

function daLinha(l: Record<string, unknown>): UsuarioPainel {
  return {
    id: l.id as string,
    consultorSlug: l.consultor_slug as string,
    papel: l.papel as Papel,
    nome: l.nome as string,
    email: l.email as string,
    whatsapp: (l.whatsapp as string) ?? null,
    vendedorSlug: l.vendedor_slug as string,
    tokenVersao: l.token_versao as number,
    ativo: l.ativo as boolean,
    criadoEm: l.criado_em as string,
    ultimoLoginEm: (l.ultimo_login_em as string) ?? null,
  }
}

export async function buscarPorEmail(
  consultorSlug: string,
  email: string,
): Promise<(UsuarioPainel & { senhaHash: string }) | null> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(`${COLUNAS}, senha_hash`)
    .eq('consultor_slug', consultorSlug)
    .ilike('email', email.trim())
    .maybeSingle()

  // O client do Supabase NAO lanca em falha de HTTP: sem este throw, banco fora
  // do ar viraria "senha incorreta" e o dono passaria a tarde tentando entrar.
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...daLinha(data), senhaHash: data.senha_hash as string }
}

export async function buscarPorId(
  id: string,
  consultorSlug: string,
): Promise<UsuarioPainel | null> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(COLUNAS)
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? daLinha(data) : null
}

export async function listarUsuarios(consultorSlug: string): Promise<UsuarioPainel[]> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(COLUNAS)
    .eq('consultor_slug', consultorSlug)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(daLinha)
}

export async function criarUsuario(a: {
  consultorSlug: string
  nome: string
  email: string
  whatsapp: string | null
  senha: string
  papel?: Papel
}): Promise<UsuarioPainel> {
  const existentes = new Set((await listarUsuarios(a.consultorSlug)).map((u) => u.vendedorSlug))
  const vendedorSlug = slugDeVendedor({
    nome: a.nome,
    whatsapp: a.whatsapp ?? '',
    existentes,
    reservadas: ROTAS_RESERVADAS,
  })
  if (!vendedorSlug) throw new Error('nome_invalido')

  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .insert({
      id: `pu_${randomBytes(9).toString('hex')}`,
      consultor_slug: a.consultorSlug,
      papel: a.papel ?? 'vendedor',
      nome: a.nome.trim(),
      email: a.email.trim().toLowerCase(),
      whatsapp: a.whatsapp,
      senha_hash: hashSenha(a.senha),
      vendedor_slug: vendedorSlug,
    })
    .select(COLUNAS)
    .single()

  // 23505 = unique violation. O unico unique que o usuario consegue provocar e
  // o do e-mail (o slug ja foi desempatado acima).
  if (error) throw new Error(error.code === '23505' ? 'email_em_uso' : error.message)
  return daLinha(data)
}

export async function atualizarUsuario(
  id: string,
  consultorSlug: string,
  patch: { nome?: string; email?: string; whatsapp?: string | null },
): Promise<UsuarioPainel> {
  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.nome !== undefined) campos.nome = patch.nome.trim()
  if (patch.email !== undefined) campos.email = patch.email.trim().toLowerCase()
  if (patch.whatsapp !== undefined) campos.whatsapp = patch.whatsapp

  // O `vendedor_slug` NAO entra aqui, nunca. Ele foi impresso, postado e mandado
  // em grupo — trocar quebra tudo que a pessoa ja divulgou.
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update(campos)
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
    .select(COLUNAS)
    .single()
  if (error) throw new Error(error.code === '23505' ? 'email_em_uso' : error.message)
  return daLinha(data)
}

/** Devolve a senha em claro pra tela mostrar — ela nao existe em outro lugar. */
export async function redefinirSenha(
  id: string,
  consultorSlug: string,
  senha?: string,
): Promise<string> {
  const nova = senha && senha.length >= 8 ? senha : gerarSenha()
  const usuario = await buscarPorId(id, consultorSlug)
  if (!usuario) throw new Error('nao_encontrado')

  const { error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update({
      senha_hash: hashSenha(nova),
      // Derruba as sessoes vivas: quem estava logado com a senha antiga sai.
      token_versao: usuario.tokenVersao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
  if (error) throw new Error(error.message)
  return nova
}

/**
 * Exclusao e SOFT de proposito: apagar a linha soltaria o `vendedor_slug` pra
 * outra pessoa e reescreveria o historico de quem trouxe cada lead.
 */
export async function desativarUsuario(
  id: string,
  consultorSlug: string,
  ativo = false,
): Promise<void> {
  const usuario = await buscarPorId(id, consultorSlug)
  if (!usuario) throw new Error('nao_encontrado')
  if (usuario.papel === 'admin' && !ativo) throw new Error('admin_nao_desativa')

  const { error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update({
      ativo,
      token_versao: usuario.tokenVersao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
  if (error) throw new Error(error.message)
}

export async function marcarLogin(id: string): Promise<void> {
  await supabaseAdmin()
    .from('painel_usuarios')
    .update({ ultimo_login_em: new Date().toISOString() })
    .eq('id', id)
}
```

- [ ] **Step 2: Contexto de sessão nas rotas**

`21go-website/src/lib/painel/contexto.ts`:

```ts
import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { PAINEL_POR_HOST } from '../consultores-painel'
import { painelDoHost } from './rotas'
import { lerSessao, type Sessao, type Papel } from './sessao'
import { buscarPorId } from './usuarios'

export const COOKIE_SESSAO = 'painel_sess'

/**
 * O segredo que assina a sessao.
 *
 * Com `PAINEL_SESSAO_SEGREDO` no ambiente, usa ele. Sem, deriva da service role
 * key: e o unico jeito de o painel funcionar mesmo que alguem suba o container
 * sem lembrar da variavel nova — e o efeito de a chave girar um dia e so todo
 * mundo precisar entrar de novo, nao o painel quebrar.
 */
export function segredoSessao(): string {
  const explicito = process.env.PAINEL_SESSAO_SEGREDO
  if (explicito) return explicito
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('sem segredo pra assinar sessao do painel')
  return createHash('sha256').update(`painel:${base}`).digest('hex')
}

/** O consultor dono do host da requisicao. */
export function consultorDoHost(req: NextRequest): string | null {
  return painelDoHost(req.headers.get('host') ?? '', PAINEL_POR_HOST)
}

/**
 * Sessao valida OU null. Confere quatro coisas: assinatura, validade, se o slug
 * bate com o host (sessao de um parceiro nao vale no subdominio de outro) e se
 * o `token_versao` ainda e o mesmo — e o que faz excluir usuario derrubar a
 * sessao dele no request seguinte.
 */
export async function sessaoDaRequisicao(req: NextRequest): Promise<Sessao | null> {
  const token = req.cookies.get(COOKIE_SESSAO)?.value
  const slugDoHost = consultorDoHost(req)
  if (!token || !slugDoHost) return null

  const sessao = lerSessao(token, segredoSessao())
  if (!sessao || sessao.slug !== slugDoHost) return null

  const usuario = await buscarPorId(sessao.uid, sessao.slug)
  if (!usuario || !usuario.ativo || usuario.tokenVersao !== sessao.v) return null
  return sessao
}

export class SemPermissao extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'nao_autenticado' : 'sem_permissao')
  }
}

export async function exigirSessao(req: NextRequest, papel?: Papel): Promise<Sessao> {
  const sessao = await sessaoDaRequisicao(req)
  if (!sessao) throw new SemPermissao(401)
  if (papel && sessao.papel !== papel) throw new SemPermissao(403)
  return sessao
}
```

- [ ] **Step 3: Rota de login**

`21go-website/src/app/api/painel/entrar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { conferirSenha } from '@/lib/painel/senha'
import { assinarSessao, DURACAO_SESSAO_MS } from '@/lib/painel/sessao'
import { buscarPorEmail, marcarLogin } from '@/lib/painel/usuarios'
import { COOKIE_SESSAO, consultorDoHost, segredoSessao } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Freio de forca bruta em memoria. Container unico, entao memoria basta — criar
 * tabela pra isso seria carga a mais num banco que ja e compartilhado com o CRM.
 */
const JANELA_MS = 15 * 60 * 1000
const LIMITE = 5
const tentativas = new Map<string, { n: number; ate: number }>()

function bloqueado(chave: string): boolean {
  const t = tentativas.get(chave)
  if (!t || t.ate < Date.now()) {
    tentativas.delete(chave)
    return false
  }
  return t.n >= LIMITE
}

function registrarFalha(chave: string): void {
  const t = tentativas.get(chave)
  if (!t || t.ate < Date.now()) tentativas.set(chave, { n: 1, ate: Date.now() + JANELA_MS })
  else t.n++
}

export async function POST(req: NextRequest) {
  const slug = consultorDoHost(req)
  if (!slug) return NextResponse.json({ erro: 'host_invalido' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { email?: string; senha?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  const senha = body.senha ?? ''
  if (!email || !senha) return NextResponse.json({ erro: 'dados_invalidos' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'sem-ip'
  const chave = `${slug}:${email}:${ip}`
  if (bloqueado(chave)) {
    return NextResponse.json({ erro: 'muitas_tentativas' }, { status: 429 })
  }

  const usuario = await buscarPorEmail(slug, email)
  // Mesma resposta pra e-mail que nao existe e senha errada: dizer qual dos dois
  // entrega a lista de quem tem acesso ao painel.
  if (!usuario || !usuario.ativo || !conferirSenha(senha, usuario.senhaHash)) {
    registrarFalha(chave)
    return NextResponse.json({ erro: 'credenciais_invalidas' }, { status: 401 })
  }

  tentativas.delete(chave)
  await marcarLogin(usuario.id)

  const token = assinarSessao(
    {
      uid: usuario.id,
      slug,
      papel: usuario.papel,
      v: usuario.tokenVersao,
      exp: Date.now() + DURACAO_SESSAO_MS,
    },
    segredoSessao(),
  )

  const res = NextResponse.json({ ok: true, papel: usuario.papel })
  // Sem `domain`: o cookie fica preso a este subdominio, entao sessao de um
  // parceiro nao viaja pro subdominio de outro.
  res.cookies.set(COOKIE_SESSAO, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  return res
}
```

- [ ] **Step 4: Rota de logout**

`21go-website/src/app/api/painel/sair/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { COOKIE_SESSAO } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', httpOnly: true, maxAge: 0 })
  return res
}
```

- [ ] **Step 5: Rota de auto-cadastro**

`21go-website/src/app/api/painel/cadastro/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { normalizarWhatsapp } from '@/lib/painel/formato'
import { assinarSessao, DURACAO_SESSAO_MS } from '@/lib/painel/sessao'
import { criarUsuario } from '@/lib/painel/usuarios'
import { COOKIE_SESSAO, consultorDoHost, segredoSessao } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROS: Record<string, { status: number; msg: string }> = {
  email_em_uso: { status: 409, msg: 'Esse e-mail já tem cadastro. Tente entrar.' },
  nome_invalido: { status: 400, msg: 'Escreva seu nome completo.' },
}

export async function POST(req: NextRequest) {
  const slug = consultorDoHost(req)
  if (!slug) return NextResponse.json({ erro: 'host_invalido' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    nome?: string
    email?: string
    whatsapp?: string
    senha?: string
  }

  const nome = (body.nome ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const senha = body.senha ?? ''
  const whatsapp = normalizarWhatsapp(body.whatsapp ?? '')

  if (nome.length < 3) return NextResponse.json({ erro: 'Escreva seu nome completo.' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 })
  if (!whatsapp)
    return NextResponse.json({ erro: 'WhatsApp inválido — use DDD e número.' }, { status: 400 })
  if (senha.length < 8)
    return NextResponse.json({ erro: 'A senha precisa de 8 caracteres ou mais.' }, { status: 400 })

  let usuario
  try {
    usuario = await criarUsuario({ consultorSlug: slug, nome, email, whatsapp, senha })
  } catch (err) {
    const conhecido = ERROS[(err as Error).message]
    if (conhecido) return NextResponse.json({ erro: conhecido.msg }, { status: conhecido.status })
    console.error('[painel/cadastro]', err)
    return NextResponse.json({ erro: 'Não deu pra concluir agora.' }, { status: 500 })
  }

  // Ja entra logado: a pessoa acabou de digitar a senha, mandar ela pra tela de
  // login de novo so cria chance de errar e desistir.
  const token = assinarSessao(
    {
      uid: usuario.id,
      slug,
      papel: usuario.papel,
      v: usuario.tokenVersao,
      exp: Date.now() + DURACAO_SESSAO_MS,
    },
    segredoSessao(),
  )

  const res = NextResponse.json({
    ok: true,
    nome: usuario.nome,
    link: `https://21go.com.br/${slug}/${usuario.vendedorSlug}`,
  })
  res.cookies.set(COOKIE_SESSAO, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  return res
}
```

- [ ] **Step 6: Build**

```bash
cd "21go-website" && npm run build
```

Esperado: build conclui. (`/painel` ainda não existe como pasta, então o verificador de rotas não reclama nesta task.)

- [ ] **Step 7: Commit**

```bash
git add 21go-website/src/lib/painel/usuarios.ts 21go-website/src/lib/painel/contexto.ts \
        21go-website/src/app/api/painel
git commit -m "feat(painel): usuarios, sessao assinada e as rotas de entrar, sair e cadastrar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Telas de entrada — login e cadastro

**Files:**
- Create: `21go-website/src/app/painel/[slug]/layout.tsx`
- Create: `21go-website/src/app/painel/[slug]/page.tsx`
- Create: `21go-website/src/app/painel/[slug]/cadastro/page.tsx`
- Create: `21go-website/src/components/painel/Marca.tsx`
- Create: `21go-website/src/components/painel/Campo.tsx`
- Create: `21go-website/src/components/painel/FormLogin.tsx`
- Create: `21go-website/src/components/painel/FormCadastro.tsx`
- Modify: `21go-website/src/lib/rotas-reservadas.ts`

**Interfaces:**
- Consumes: `resolverConsultor`, `estaNoAr` (`@/lib/consultor`); `POST /api/painel/entrar`; `POST /api/painel/cadastro`.
- Produces: `<Marca nome={string} />`, `<Campo label rótulo tipo … />`, `<FormLogin />`, `<FormCadastro />`.

- [ ] **Step 1: Reservar a rota (senão o build quebra)**

`21go-website/src/lib/rotas-reservadas.ts` — adicionar na lista, em ordem alfabética:

```ts
  'ouvidoria',
  // Painel do parceiro. Ninguem digita `/painel/<slug>` — o middleware reescreve
  // `parceiroanderson.21go.com.br` pra ca.
  'painel',
  'preview-scroll-3d',
```

- [ ] **Step 2: Componentes de base**

`21go-website/src/components/painel/Marca.tsx`:

```tsx
/** Cabecalho das telas de entrada: o parceiro ve o nome DELE, nao o da 21Go. */
export default function Marca({ nome }: { nome: string }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#293C82] text-white font-bold text-xl mb-4">
        21
      </div>
      <h1 className="text-2xl font-bold text-[#293C82]">{nome || 'Painel do parceiro'}</h1>
      <p className="text-sm text-slate-500 mt-1">Acompanhe seus leads e sua equipe</p>
    </div>
  )
}
```

`21go-website/src/components/painel/Campo.tsx`:

```tsx
interface Props {
  rotulo: string
  tipo?: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  autoComplete?: string
}

export default function Campo({ rotulo, tipo = 'text', valor, aoMudar, dica, autoComplete }: Props) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        autoComplete={autoComplete}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-[#293C82] focus:ring-2 focus:ring-[#293C82]/20"
      />
      {dica && <span className="block text-xs text-slate-500 mt-1">{dica}</span>}
    </label>
  )
}
```

- [ ] **Step 3: Formulário de login**

`21go-website/src/components/painel/FormLogin.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Campo from './Campo'

export default function FormLogin() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch('/api/painel/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(
          d.erro === 'muitas_tentativas'
            ? 'Muitas tentativas. Espere 15 minutos.'
            : 'E-mail ou senha incorretos.',
        )
        return
      }
      window.location.href = '/app'
    } catch {
      setErro('Não deu pra entrar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" />
      <Campo
        rotulo="Senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="current-password"
      />
      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-[#F2911D] py-3 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Formulário de cadastro**

`21go-website/src/components/painel/FormCadastro.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Campo from './Campo'

export default function FormCadastro() {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState<{ nome: string; link: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch('/api/painel/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, whatsapp, email, senha }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(d.erro || 'Não deu pra concluir agora.')
        return
      }
      setPronto({ nome: d.nome, link: d.link })
    } catch {
      setErro('Não deu pra concluir agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  /**
   * A senha nao e reenviada por nada: nosso unico chip de WhatsApp e o da casa e
   * ele nao pode falar por site de consultor (chegaria assinado "consultora
   * Leticya"). Entao o link fica na tela, grande, com botao de copiar.
   */
  if (pronto) {
    return (
      <div className="text-center">
        <p className="text-lg font-semibold text-[#293C82] mb-2">Pronto, {pronto.nome}!</p>
        <p className="text-sm text-slate-600 mb-5">
          Este é o seu link. Todo mundo que fizer cotação por ele conta como seu.
        </p>
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm break-all text-slate-800 mb-3">
          {pronto.link}
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(pronto.link)
            setCopiado(true)
          }}
          className="w-full rounded-xl bg-[#C7D301] py-3 font-semibold text-[#293C82] mb-3"
        >
          {copiado ? 'Copiado!' : 'Copiar meu link'}
        </button>
        <a href="/app" className="block w-full rounded-xl bg-[#293C82] py-3 font-semibold text-white">
          Ver meu painel
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="Nome completo" valor={nome} aoMudar={setNome} autoComplete="name" />
      <Campo
        rotulo="WhatsApp"
        valor={whatsapp}
        aoMudar={setWhatsapp}
        dica="Com DDD. Ex: (21) 99220-8062"
        autoComplete="tel"
      />
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" />
      <Campo
        rotulo="Crie uma senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        dica="Mínimo de 8 caracteres"
        autoComplete="new-password"
      />
      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-[#F2911D] py-3 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? 'Criando…' : 'Criar meu acesso'}
      </button>
    </form>
  )
}
```

Nota: o `<a href="/app">` acima é intencional — ele sai do fluxo de slug de consultor porque o painel tem host próprio. O verificador do `prebuild` proíbe `<a href="/…">` cru, então marque com `data-sai-do-slug`:

```tsx
        <a
          href="/app"
          data-sai-do-slug
          className="block w-full rounded-xl bg-[#293C82] py-3 font-semibold text-white"
        >
```

- [ ] **Step 5: Layout e páginas**

`21go-website/src/app/painel/[slug]/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { resolverConsultor, estaNoAr } from '@/lib/consultor'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Painel do parceiro',
  robots: { index: false, follow: false },
}

/**
 * O painel e SEMPRE dinamico. Ele nao pode ser prerenderizado como o resto do
 * site: cada resposta depende da sessao. Isolar aqui tambem garante que o
 * `force-dynamic` nao vaze pras paginas de marketing, que vivem do prerender.
 */
export default async function LayoutPainel({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)
  if (!consultor || !estaNoAr(consultor)) notFound()

  return <div className="min-h-screen bg-[#F8FAFC] text-slate-900">{children}</div>
}
```

`21go-website/src/app/painel/[slug]/page.tsx`:

```tsx
import Link from '@/components/Link'
import { resolverConsultor } from '@/lib/consultor'
import Marca from '@/components/painel/Marca'
import FormLogin from '@/components/painel/FormLogin'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Marca nome={consultor?.nome ?? ''} />
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <FormLogin />
        </div>
        <p className="mt-5 text-center text-sm text-slate-600">
          Ainda não tem acesso?{' '}
          <Link href="/cadastro" className="font-semibold text-[#293C82] underline">
            Quero divulgar e ganhar
          </Link>
        </p>
      </div>
    </main>
  )
}
```

`21go-website/src/app/painel/[slug]/cadastro/page.tsx`:

```tsx
import Link from '@/components/Link'
import { resolverConsultor } from '@/lib/consultor'
import Marca from '@/components/painel/Marca'
import FormCadastro from '@/components/painel/FormCadastro'

export const dynamic = 'force-dynamic'

export default async function PaginaCadastro({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const consultor = await resolverConsultor(slug)

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Marca nome={consultor?.nome ?? ''} />
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <FormCadastro />
        </div>
        <p className="mt-5 text-center text-sm text-slate-600">
          Já tem acesso?{' '}
          <Link href="/" className="font-semibold text-[#293C82] underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Rodar local e conferir na mão**

```bash
cd "21go-website" && npm run dev
```

Com o servidor de pé, em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: parceiroanderson.21go.com.br" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: parceiroanderson.21go.com.br" http://localhost:3000/cadastro
```

Esperado: `200` nos dois.

- [ ] **Step 7: Build e commit**

```bash
cd "21go-website" && npm run build
```

Esperado: o `prebuild` imprime `✓ sites de consultor: 20 rotas reservadas, nenhum next/link solto`.

```bash
git add 21go-website/src/app/painel 21go-website/src/components/painel 21go-website/src/lib/rotas-reservadas.ts
git commit -m "feat(painel): telas de login e auto-cadastro do divulgador

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Consultas — resumo e lista de leads

**Files:**
- Create: `21go-website/src/lib/painel/consultas.ts`
- Create: `21go-website/src/app/api/painel/resumo/route.ts`
- Create: `21go-website/src/app/api/painel/leads/route.ts`

**Interfaces:**
- Consumes: `exigirSessao`, `SemPermissao` (`@/lib/painel/contexto`); `listarUsuarios` (`@/lib/painel/usuarios`); `mascararTelefone`, `formatarTelefone` (`@/lib/painel/formato`).
- Produces:
  - `interface LeadPainel { id, criadoEm, nome, telefone, veiculo, valorMensal, plano, etapa, vendedorSlug, vendedorNome }`
  - `interface Resumo { total, noMes, hoje, ganhos, perdidos, emNegociacao, porVendedor: { slug, nome, total, noMes, ganhos }[] }`
  - `resumoDoPainel(consultorSlug, vendedorSlug: string | null): Promise<Resumo>`
  - `leadsDoPainel(a: { consultorSlug, vendedorSlug, de, ate, pagina, porPagina, mascarar }): Promise<{ itens: LeadPainel[]; total: number }>`

- [ ] **Step 1: Módulo de consultas**

`21go-website/src/lib/painel/consultas.ts`:

```ts
import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { listarUsuarios } from './usuarios'
import { mascararTelefone, formatarTelefone } from './formato'

/**
 * O que o painel mostra. Tudo sai da tabela `leads`, filtrando por
 * `consultor_slug` — a coluna que a migracao 276 criou justamente pra isto.
 *
 * "Ganho" e "perdido" nao sao chute nosso: e o `status` que o webhook do
 * PowerCRM ja escreve quando a negociacao fecha ou morre la.
 */

export interface LeadPainel {
  id: string
  criadoEm: string
  nome: string
  telefone: string
  veiculo: string
  valorMensal: number | null
  plano: string | null
  etapa: string
  vendedorSlug: string | null
  vendedorNome: string | null
}

export interface Resumo {
  total: number
  noMes: number
  hoje: number
  ganhos: number
  perdidos: number
  emNegociacao: number
  porVendedor: { slug: string; nome: string; total: number; noMes: number; ganhos: number }[]
}

const COLUNAS_LEAD =
  'id, created_at, nome, telefone, marca_interesse, modelo_interesse, ano_interesse, cotacao_valor, cotacao_plano, status, etapa_funil, vendedor_slug'

function inicioDoMes(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

function inicioDoDia(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

function etapaLegivel(status: string | null, etapa: string | null): string {
  if (status === 'convertido') return 'Fechado'
  if (status === 'perdido') return 'Perdido'
  if (etapa && etapa !== 'novo') return 'Em negociação'
  return 'Novo'
}

function veiculoDe(l: Record<string, unknown>): string {
  const partes = [l.marca_interesse, l.modelo_interesse, l.ano_interesse].filter(Boolean)
  return partes.length ? partes.join(' ') : '—'
}

export async function resumoDoPainel(
  consultorSlug: string,
  vendedorSlug: string | null,
): Promise<Resumo> {
  const supa = supabaseAdmin()
  let q = supa
    .from('leads')
    .select('created_at, status, etapa_funil, vendedor_slug')
    .eq('consultor_slug', consultorSlug)
  // Vendedor so ve o que ele mesmo trouxe. O recorte sai da SESSAO, nunca de
  // parametro da URL.
  if (vendedorSlug) q = q.eq('vendedor_slug', vendedorSlug)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const linhas = data ?? []

  const mes = inicioDoMes()
  const dia = inicioDoDia()
  const contar = (f: (l: Record<string, unknown>) => boolean) => linhas.filter(f).length

  const resumo: Resumo = {
    total: linhas.length,
    noMes: contar((l) => (l.created_at as string) >= mes),
    hoje: contar((l) => (l.created_at as string) >= dia),
    ganhos: contar((l) => l.status === 'convertido'),
    perdidos: contar((l) => l.status === 'perdido'),
    emNegociacao: contar(
      (l) => l.status !== 'convertido' && l.status !== 'perdido' && l.etapa_funil !== 'novo',
    ),
    porVendedor: [],
  }

  if (vendedorSlug) return resumo

  const usuarios = await listarUsuarios(consultorSlug)
  const nomePorSlug = new Map(usuarios.map((u) => [u.vendedorSlug, u.nome]))

  const chaves = new Set<string>([
    ...usuarios.filter((u) => u.papel === 'vendedor').map((u) => u.vendedorSlug),
    ...linhas.map((l) => (l.vendedor_slug as string) ?? '').filter(Boolean),
  ])

  resumo.porVendedor = [...chaves]
    .map((slug) => {
      const dele = linhas.filter((l) => l.vendedor_slug === slug)
      return {
        slug,
        nome: nomePorSlug.get(slug) ?? slug,
        total: dele.length,
        noMes: dele.filter((l) => (l.created_at as string) >= mes).length,
        ganhos: dele.filter((l) => l.status === 'convertido').length,
      }
    })
    .sort((a, b) => b.noMes - a.noMes || b.total - a.total)

  // "Direto no meu link" e linha propria: sem ela, o consultor soma os
  // vendedores, nao bate com o total e acha que o painel esta errado.
  const semVendedor = linhas.filter((l) => !l.vendedor_slug)
  if (semVendedor.length) {
    resumo.porVendedor.push({
      slug: '',
      nome: 'Direto no meu link',
      total: semVendedor.length,
      noMes: semVendedor.filter((l) => (l.created_at as string) >= mes).length,
      ganhos: semVendedor.filter((l) => l.status === 'convertido').length,
    })
  }

  return resumo
}

export async function leadsDoPainel(a: {
  consultorSlug: string
  vendedorSlug: string | null
  de?: string | null
  ate?: string | null
  pagina?: number
  porPagina?: number
  mascarar: boolean
}): Promise<{ itens: LeadPainel[]; total: number }> {
  const porPagina = Math.min(a.porPagina ?? 50, 200)
  const pagina = Math.max(a.pagina ?? 1, 1)
  const inicio = (pagina - 1) * porPagina

  let q = supabaseAdmin()
    .from('leads')
    .select(COLUNAS_LEAD, { count: 'exact' })
    .eq('consultor_slug', a.consultorSlug)
    .order('created_at', { ascending: false })
    .range(inicio, inicio + porPagina - 1)

  if (a.vendedorSlug) q = q.eq('vendedor_slug', a.vendedorSlug)
  if (a.de) q = q.gte('created_at', a.de)
  if (a.ate) q = q.lte('created_at', a.ate)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const usuarios = await listarUsuarios(a.consultorSlug)
  const nomePorSlug = new Map(usuarios.map((u) => [u.vendedorSlug, u.nome]))

  const itens = (data ?? []).map((l) => ({
    id: l.id as string,
    criadoEm: l.created_at as string,
    nome: (l.nome as string) ?? '—',
    telefone: a.mascarar
      ? mascararTelefone((l.telefone as string) ?? '')
      : formatarTelefone((l.telefone as string) ?? ''),
    veiculo: veiculoDe(l),
    valorMensal: (l.cotacao_valor as number) ?? null,
    plano: (l.cotacao_plano as string) ?? null,
    etapa: etapaLegivel((l.status as string) ?? null, (l.etapa_funil as string) ?? null),
    vendedorSlug: (l.vendedor_slug as string) ?? null,
    vendedorNome: l.vendedor_slug
      ? (nomePorSlug.get(l.vendedor_slug as string) ?? (l.vendedor_slug as string))
      : null,
  }))

  return { itens, total: count ?? itens.length }
}
```

- [ ] **Step 2: Rota do resumo**

`21go-website/src/app/api/painel/resumo/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { buscarPorId } from '@/lib/painel/usuarios'
import { resumoDoPainel } from '@/lib/painel/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req)
    const usuario = await buscarPorId(sessao.uid, sessao.slug)
    if (!usuario) throw new SemPermissao(401)

    const recorte = sessao.papel === 'admin' ? null : usuario.vendedorSlug
    const resumo = await resumoDoPainel(sessao.slug, recorte)

    return NextResponse.json({
      papel: sessao.papel,
      nome: usuario.nome,
      link: `https://21go.com.br/${sessao.slug}/${usuario.vendedorSlug}`,
      resumo,
    })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/resumo]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Rota da lista**

`21go-website/src/app/api/painel/leads/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { buscarPorId } from '@/lib/painel/usuarios'
import { leadsDoPainel } from '@/lib/painel/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req)
    const usuario = await buscarPorId(sessao.uid, sessao.slug)
    if (!usuario) throw new SemPermissao(401)

    const p = req.nextUrl.searchParams
    /**
     * O recorte do vendedor vem da SESSAO. O `?vendedor=` da URL so e obedecido
     * pra admin — senao qualquer divulgador leria a carteira dos outros
     * trocando um parametro.
     */
    const recorte =
      sessao.papel === 'admin' ? (p.get('vendedor') || null) : usuario.vendedorSlug

    const { itens, total } = await leadsDoPainel({
      consultorSlug: sessao.slug,
      vendedorSlug: recorte,
      de: p.get('de'),
      ate: p.get('ate'),
      pagina: Number(p.get('pagina') || 1),
      mascarar: sessao.papel !== 'admin',
    })

    return NextResponse.json({ itens, total, papel: sessao.papel })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/leads]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Build e commit**

```bash
cd "21go-website" && npm run build
```

```bash
git add 21go-website/src/lib/painel/consultas.ts 21go-website/src/app/api/painel/resumo 21go-website/src/app/api/painel/leads
git commit -m "feat(painel): consultas de resumo e lista de leads, com recorte por papel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Dashboards e lista de leads na tela

**Files:**
- Create: `21go-website/src/app/painel/[slug]/app/layout.tsx`
- Create: `21go-website/src/app/painel/[slug]/app/page.tsx`
- Create: `21go-website/src/app/painel/[slug]/app/leads/page.tsx`
- Create: `21go-website/src/components/painel/Cartao.tsx`
- Create: `21go-website/src/components/painel/LinkDivulgacao.tsx`
- Create: `21go-website/src/components/painel/PainelResumo.tsx`
- Create: `21go-website/src/components/painel/TabelaLeads.tsx`

**Interfaces:**
- Consumes: `GET /api/painel/resumo`, `GET /api/painel/leads`, `POST /api/painel/sair`.
- Produces: `<Cartao rotulo valor destaque? />`, `<LinkDivulgacao link />`, `<PainelResumo />`, `<TabelaLeads />`.

- [ ] **Step 1: Peças de UI**

`21go-website/src/components/painel/Cartao.tsx`:

```tsx
export default function Cartao({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number | string
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destaque ? 'border-[#C7D301] bg-[#C7D301]/10' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#293C82]">{valor}</p>
    </div>
  )
}
```

`21go-website/src/components/painel/LinkDivulgacao.tsx`:

```tsx
'use client'
import { useState } from 'react'

/** O link e a razao de o divulgador abrir o painel. Fica grande e no topo. */
export default function LinkDivulgacao({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Meu link</p>
      <p className="mt-1 break-all text-sm text-slate-800">{link}</p>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(link)
          setCopiado(true)
        }}
        className="mt-3 rounded-xl bg-[#F2911D] px-4 py-2 text-sm font-semibold text-white"
      >
        {copiado ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Resumo (a tela que muda por papel)**

`21go-website/src/components/painel/PainelResumo.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Cartao from './Cartao'
import LinkDivulgacao from './LinkDivulgacao'

interface Dados {
  papel: 'admin' | 'vendedor'
  nome: string
  link: string
  resumo: {
    total: number
    noMes: number
    hoje: number
    ganhos: number
    perdidos: number
    emNegociacao: number
    porVendedor: { slug: string; nome: string; total: number; noMes: number; ganhos: number }[]
  }
}

export default function PainelResumo() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch('/api/painel/resumo')
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/'
          return
        }
        if (!r.ok) throw new Error('falhou')
        setDados(await r.json())
      })
      .catch(() => setErro('Não deu pra carregar agora.'))
  }, [])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!dados) return <p className="text-sm text-slate-500">Carregando…</p>

  const r = dados.resumo
  const ehAdmin = dados.papel === 'admin'

  return (
    <div className="space-y-6">
      {!ehAdmin && <LinkDivulgacao link={dados.link} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao rotulo="Leads no mês" valor={r.noMes} destaque />
        <Cartao rotulo="Hoje" valor={r.hoje} />
        <Cartao rotulo="Em negociação" valor={r.emNegociacao} />
        <Cartao rotulo="Fechados" valor={r.ganhos} />
      </div>

      {ehAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-[#293C82]">Quem está trazendo</h2>
          {r.porVendedor.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ninguém cadastrado ainda. Mande o link de cadastro pra sua equipe.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 font-medium">Pessoa</th>
                    <th className="pb-2 font-medium">No mês</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Fechados</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porVendedor.map((v) => (
                    <tr key={v.slug || 'direto'} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-800">{v.nome}</td>
                      <td className="py-2">{v.noMes}</td>
                      <td className="py-2">{v.total}</td>
                      <td className="py-2">{v.ganhos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Tabela de leads**

`21go-website/src/components/painel/TabelaLeads.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

interface Lead {
  id: string
  criadoEm: string
  nome: string
  telefone: string
  veiculo: string
  valorMensal: number | null
  plano: string | null
  etapa: string
  vendedorNome: string | null
}

const COR_ETAPA: Record<string, string> = {
  Fechado: 'bg-[#C7D301]/25 text-[#3f4a00]',
  Perdido: 'bg-slate-200 text-slate-600',
  'Em negociação': 'bg-[#F2911D]/20 text-[#8a4d00]',
  Novo: 'bg-[#293C82]/10 text-[#293C82]',
}

export default function TabelaLeads() {
  const [itens, setItens] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    setCarregando(true)
    fetch(`/api/painel/leads?pagina=${pagina}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/'
          return
        }
        const d = await r.json()
        setItens(d.itens ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setCarregando(false))
  }, [pagina])

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>
  if (!itens.length)
    return (
      <p className="text-sm text-slate-500">
        Nenhum lead ainda. Assim que alguém simular pelo link, aparece aqui.
      </p>
    )

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3 font-medium">Data</th>
              <th className="p-3 font-medium">Nome</th>
              <th className="p-3 font-medium">WhatsApp</th>
              <th className="p-3 font-medium">Veículo</th>
              <th className="p-3 font-medium">Mensal</th>
              <th className="p-3 font-medium">Situação</th>
              <th className="p-3 font-medium">Trazido por</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="p-3 whitespace-nowrap">
                  {new Date(l.criadoEm).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-3 font-medium text-slate-800">{l.nome}</td>
                <td className="p-3 whitespace-nowrap">{l.telefone}</td>
                <td className="p-3">{l.veiculo}</td>
                <td className="p-3 whitespace-nowrap">
                  {l.valorMensal ? `R$ ${l.valorMensal.toFixed(2).replace('.', ',')}` : '—'}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      COR_ETAPA[l.etapa] ?? COR_ETAPA.Novo
                    }`}
                  >
                    {l.etapa}
                  </span>
                </td>
                <td className="p-3">{l.vendedorNome ?? 'Direto'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} lead(s)</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina === 1}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => setPagina((p) => p + 1)}
            disabled={pagina * 50 >= total}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Layout logado e páginas**

`21go-website/src/app/painel/[slug]/app/layout.tsx`:

```tsx
import Link from '@/components/Link'

export const dynamic = 'force-dynamic'

export default function LayoutLogado({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/app" className="text-[#293C82]">
            Início
          </Link>
          <Link href="/app/leads" className="text-[#293C82]">
            Leads
          </Link>
          <Link href="/app/usuarios" className="text-[#293C82]">
            Equipe
          </Link>
        </nav>
        <form action="/api/painel/sair" method="post">
          <button className="text-sm text-slate-500 underline">Sair</button>
        </form>
      </header>
      {children}
    </div>
  )
}
```

> A aba "Equipe" aparece pra todo mundo, mas a página se resolve sozinha: quem não é admin leva 403 da API e vê o aviso. Esconder o link exigiria buscar o papel no servidor a cada navegação; o custo não paga o ganho.

`21go-website/src/app/painel/[slug]/app/page.tsx`:

```tsx
import PainelResumo from '@/components/painel/PainelResumo'

export const dynamic = 'force-dynamic'

export default function PaginaInicio() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Meu painel</h1>
      <PainelResumo />
    </main>
  )
}
```

`21go-website/src/app/painel/[slug]/app/leads/page.tsx`:

```tsx
import TabelaLeads from '@/components/painel/TabelaLeads'

export const dynamic = 'force-dynamic'

export default function PaginaLeads() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Leads</h1>
      <TabelaLeads />
    </main>
  )
}
```

- [ ] **Step 5: Build e commit**

```bash
cd "21go-website" && npm run build
```

```bash
git add 21go-website/src/app/painel 21go-website/src/components/painel
git commit -m "feat(painel): dashboard do admin e do divulgador, com lista de leads

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Gestão de usuários pelo admin

**Files:**
- Create: `21go-website/src/app/api/painel/usuarios/route.ts`
- Create: `21go-website/src/app/api/painel/usuarios/[id]/route.ts`
- Create: `21go-website/src/app/painel/[slug]/app/usuarios/page.tsx`
- Create: `21go-website/src/components/painel/GestaoUsuarios.tsx`

**Interfaces:**
- Consumes: `exigirSessao`, `SemPermissao`; `listarUsuarios`, `criarUsuario`, `atualizarUsuario`, `redefinirSenha`, `desativarUsuario`; `gerarSenha`; `normalizarWhatsapp`.
- Produces: `GET/POST /api/painel/usuarios`, `PATCH/DELETE /api/painel/usuarios/[id]`, `<GestaoUsuarios />`.

- [ ] **Step 1: Rota de coleção**

`21go-website/src/app/api/painel/usuarios/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { listarUsuarios, criarUsuario } from '@/lib/painel/usuarios'
import { gerarSenha } from '@/lib/painel/senha'
import { normalizarWhatsapp } from '@/lib/painel/formato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const usuarios = await listarUsuarios(sessao.slug)
    return NextResponse.json({
      itens: usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        papel: u.papel,
        ativo: u.ativo,
        link: `https://21go.com.br/${sessao.slug}/${u.vendedorSlug}`,
        vendedorSlug: u.vendedorSlug,
        criadoEm: u.criadoEm,
        ultimoLoginEm: u.ultimoLoginEm,
      })),
    })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error('[painel/usuarios GET]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const b = (await req.json().catch(() => ({}))) as {
      nome?: string
      email?: string
      whatsapp?: string
      senha?: string
    }

    const nome = (b.nome ?? '').trim()
    const email = (b.email ?? '').trim().toLowerCase()
    if (nome.length < 3) return NextResponse.json({ erro: 'Escreva o nome completo.' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 })

    // Senha gerada quando o admin nao digita uma: ela aparece na tela dele, que
    // repassa como quiser. Nada sai pelo nosso WhatsApp (REGRA 0.1).
    const senha = b.senha && b.senha.length >= 8 ? b.senha : gerarSenha()

    const usuario = await criarUsuario({
      consultorSlug: sessao.slug,
      nome,
      email,
      whatsapp: normalizarWhatsapp(b.whatsapp ?? ''),
      senha,
    })

    return NextResponse.json({
      ok: true,
      senha,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        link: `https://21go.com.br/${sessao.slug}/${usuario.vendedorSlug}`,
      },
    })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'email_em_uso') return NextResponse.json({ erro: 'Esse e-mail já está cadastrado.' }, { status: 409 })
    if (m === 'nome_invalido') return NextResponse.json({ erro: 'Nome curto demais.' }, { status: 400 })
    console.error('[painel/usuarios POST]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Rota de item**

`21go-website/src/app/api/painel/usuarios/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { exigirSessao, SemPermissao } from '@/lib/painel/contexto'
import { atualizarUsuario, redefinirSenha, desativarUsuario } from '@/lib/painel/usuarios'
import { normalizarWhatsapp } from '@/lib/painel/formato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    const b = (await req.json().catch(() => ({}))) as {
      acao?: 'editar' | 'senha' | 'ativar' | 'desativar'
      nome?: string
      email?: string
      whatsapp?: string
      senha?: string
    }

    if (b.acao === 'senha') {
      const nova = await redefinirSenha(id, sessao.slug, b.senha)
      return NextResponse.json({ ok: true, senha: nova })
    }
    if (b.acao === 'ativar' || b.acao === 'desativar') {
      // O admin nao pode se desativar: o painel ficaria sem dono e so um UPDATE
      // no banco resolveria.
      if (id === sessao.uid && b.acao === 'desativar')
        return NextResponse.json({ erro: 'Você não pode desativar seu próprio acesso.' }, { status: 400 })
      await desativarUsuario(id, sessao.slug, b.acao === 'ativar')
      return NextResponse.json({ ok: true })
    }

    const usuario = await atualizarUsuario(id, sessao.slug, {
      nome: b.nome,
      email: b.email,
      whatsapp: b.whatsapp === undefined ? undefined : normalizarWhatsapp(b.whatsapp),
    })
    return NextResponse.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome } })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'email_em_uso') return NextResponse.json({ erro: 'Esse e-mail já está cadastrado.' }, { status: 409 })
    if (m === 'admin_nao_desativa')
      return NextResponse.json({ erro: 'Não dá pra desativar o dono do painel.' }, { status: 400 })
    if (m === 'nao_encontrado') return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })
    console.error('[painel/usuarios PATCH]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirSessao(req, 'admin')
    const { id } = await ctx.params
    if (id === sessao.uid)
      return NextResponse.json({ erro: 'Você não pode excluir seu próprio acesso.' }, { status: 400 })

    /**
     * Exclusao e SOFT. Apagar a linha soltaria o slug pra outra pessoa e
     * reescreveria o historico de quem trouxe cada lead — o painel passaria a
     * mostrar comissao de gente errada.
     */
    await desativarUsuario(id, sessao.slug, false)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SemPermissao) return NextResponse.json({ erro: err.message }, { status: err.status })
    const m = (err as Error).message
    if (m === 'admin_nao_desativa')
      return NextResponse.json({ erro: 'Não dá pra excluir o dono do painel.' }, { status: 400 })
    if (m === 'nao_encontrado') return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404 })
    console.error('[painel/usuarios DELETE]', err)
    return NextResponse.json({ erro: 'falhou' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Tela de equipe**

`21go-website/src/components/painel/GestaoUsuarios.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Campo from './Campo'

interface Usuario {
  id: string
  nome: string
  email: string
  papel: 'admin' | 'vendedor'
  ativo: boolean
  link: string
  ultimoLoginEm: string | null
}

export default function GestaoUsuarios() {
  const [itens, setItens] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [semPermissao, setSemPermissao] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [novoAcesso, setNovoAcesso] = useState<{ nome: string; senha: string; link: string } | null>(
    null,
  )

  async function carregar() {
    const r = await fetch('/api/painel/usuarios')
    if (r.status === 401) {
      window.location.href = '/'
      return
    }
    if (r.status === 403) {
      setSemPermissao(true)
      return
    }
    const d = await r.json()
    setItens(d.itens ?? [])
  }

  useEffect(() => {
    void carregar()
  }, [])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const r = await fetch('/api/painel/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, whatsapp }),
    })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra criar.')
      return
    }
    setNovoAcesso({ nome: d.usuario.nome, senha: d.senha, link: d.usuario.link })
    setNome('')
    setEmail('')
    setWhatsapp('')
    void carregar()
  }

  async function acao(id: string, corpo: Record<string, unknown>) {
    const r = await fetch(`/api/painel/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.erro || 'Não deu pra concluir.')
      return
    }
    if (d.senha) setNovoAcesso({ nome: 'Senha nova', senha: d.senha, link: '' })
    void carregar()
  }

  async function excluir(id: string, nomeDele: string) {
    if (!confirm(`Excluir o acesso de ${nomeDele}? Os leads que ele trouxe continuam no histórico.`))
      return
    const r = await fetch(`/api/painel/usuarios/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      setErro(d.erro || 'Não deu pra excluir.')
      return
    }
    void carregar()
  }

  if (semPermissao)
    return <p className="text-sm text-slate-600">Só o dono do painel vê esta página.</p>

  return (
    <div className="space-y-6">
      {novoAcesso && (
        <div className="rounded-2xl border border-[#C7D301] bg-[#C7D301]/10 p-4">
          <p className="font-semibold text-[#293C82]">{novoAcesso.nome}</p>
          <p className="mt-1 text-sm text-slate-700">
            Senha: <span className="font-mono font-bold">{novoAcesso.senha}</span>
          </p>
          {novoAcesso.link && (
            <p className="mt-1 break-all text-sm text-slate-700">Link: {novoAcesso.link}</p>
          )}
          <p className="mt-2 text-xs text-slate-600">
            Anote agora — esta senha não aparece de novo.
          </p>
          <button onClick={() => setNovoAcesso(null)} className="mt-2 text-sm underline">
            Ok, anotei
          </button>
        </div>
      )}

      <form onSubmit={criar} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-[#293C82]">Dar acesso a alguém</h2>
        <Campo rotulo="Nome completo" valor={nome} aoMudar={setNome} />
        <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
        <Campo rotulo="WhatsApp" valor={whatsapp} aoMudar={setWhatsapp} dica="Com DDD" />
        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
        <button className="rounded-xl bg-[#F2911D] px-4 py-2.5 font-semibold text-white">
          Criar acesso
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3 font-medium">Pessoa</th>
              <th className="p-3 font-medium">Link</th>
              <th className="p-3 font-medium">Situação</th>
              <th className="p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-3">
                  <span className="font-medium text-slate-800">{u.nome}</span>
                  <br />
                  <span className="text-xs text-slate-500">{u.email}</span>
                </td>
                <td className="p-3 break-all text-xs text-slate-600">{u.link}</td>
                <td className="p-3">
                  {u.papel === 'admin' ? 'Dono' : u.ativo ? 'Ativo' : 'Desativado'}
                </td>
                <td className="p-3">
                  {u.papel !== 'admin' && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => void acao(u.id, { acao: 'senha' })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        Nova senha
                      </button>
                      <button
                        onClick={() =>
                          void acao(u.id, { acao: u.ativo ? 'desativar' : 'ativar' })
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        onClick={() => void excluir(u.id, u.nome)}
                        className="rounded-lg border border-red-300 px-2 py-1 text-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

`21go-website/src/app/painel/[slug]/app/usuarios/page.tsx`:

```tsx
import GestaoUsuarios from '@/components/painel/GestaoUsuarios'

export const dynamic = 'force-dynamic'

export default function PaginaUsuarios() {
  return (
    <main>
      <h1 className="mb-5 text-xl font-bold text-[#293C82]">Equipe</h1>
      <GestaoUsuarios />
    </main>
  )
}
```

- [ ] **Step 4: Build e commit**

```bash
cd "21go-website" && npm run test:painel && npm run build
```

```bash
git add 21go-website/src/app/api/painel/usuarios 21go-website/src/app/painel 21go-website/src/components/painel
git commit -m "feat(painel): admin cria, edita, redefine senha e exclui acesso da equipe

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Infra, deploy e verificação em produção

Nada aqui é opcional. É onde a REGRA 0 é cumprida.

**Files:**
- Modify (servidor): `/etc/caddy/Caddyfile`
- Modify (servidor): `/opt/site21go/.env-site`
- Create (Cloudflare): registro A `parceiroanderson.21go.com.br`

- [ ] **Step 1: Baseline — nada pode estar caído antes de começar**

```bash
curl -s -o /dev/null -w "site=%{http_code}\n" https://21go.com.br
curl -s -o /dev/null -w "anderson=%{http_code}\n" https://21go.com.br/andersonagripino
curl -s -o /dev/null -w "recepcao=%{http_code}\n" https://painel.21go.com.br/login
```

Esperado: `200` nos três. Qualquer coisa diferente disso: **parar e investigar antes de tocar em qualquer coisa.**

- [ ] **Step 2: DNS no Cloudflare — DNS-only, não proxied**

```bash
TOKEN=$(grep -m1 "^CLOUDFLARE_API_TOKEN" .env | cut -d= -f2- | tr -d '"' | tr -d "\r")
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/a8384df42135f06364a339dddf34dfc4/dns_records" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"A","name":"parceiroanderson","content":"56.126.48.234","ttl":60,"proxied":false}'
```

Esperado: `"success":true`. **`proxied` tem que ser `false`** — com a nuvem laranja o Caddy não consegue emitir o certificado Let's Encrypt e o painel abre com erro de certificado.

- [ ] **Step 3: Bloco novo no Caddy (aditivo, sem tocar no que existe)**

```bash
SSH="ssh -i C:/Users/damas/.ssh/claude_21go ubuntu@56.126.48.234"
$SSH "sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-parceiroanderson && sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'FIM'

# ── Painel do parceiro (18/08/2026) ──
# MESMO container do site (127.0.0.1:3100): o middleware do Next reconhece o
# host em PAINEL_POR_HOST e reescreve pra /painel/<slug>.
#
# SEM tls internal: DNS-only no Cloudflare, entao o navegador fala direto com
# este servidor e o Caddy emite Let's Encrypt sozinho.
#
# painel.21go.com.br NAO foi tocado — e o controle de acesso da recepcao.
parceiroanderson.21go.com.br {
	reverse_proxy 127.0.0.1:3100 {
		header_up X-Forwarded-Proto https
	}
}
FIM
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy && echo RELOAD-OK"
```

Esperado: `Valid configuration` e `RELOAD-OK`. Se o `validate` falhar, o `reload` não roda — restaure com `sudo cp /etc/caddy/Caddyfile.antes-parceiroanderson /etc/caddy/Caddyfile`.

- [ ] **Step 4: A recepção continua de pé?**

```bash
curl -s -o /dev/null -w "recepcao=%{http_code}\n" https://painel.21go.com.br/login
```

Esperado: `200`. Se não, restaurar o Caddyfile do backup e recarregar — **antes** de qualquer outra coisa.

- [ ] **Step 5: Segredo da sessão no env canônico**

```bash
SEGREDO=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
$SSH "grep -q '^PAINEL_SESSAO_SEGREDO=' /opt/site21go/.env-site || echo 'PAINEL_SESSAO_SEGREDO=$SEGREDO' | sudo tee -a /opt/site21go/.env-site >/dev/null; sudo grep -c '^PAINEL_SESSAO_SEGREDO=' /opt/site21go/.env-site"
```

Esperado: `1`. (Se esquecer este passo o painel ainda funciona — o segredo é derivado da service role key —, mas explícito é melhor.)

- [ ] **Step 6: Push e deploy**

```bash
git push site master
$SSH "sudo /opt/blog-autodeploy.sh"
```

O build no VPS é lento. Lentidão não é falha — não redisparar.

- [ ] **Step 7: O site vendido continua igual (REGRA 0)**

```bash
curl -s -o /dev/null -w "site=%{http_code}\n" https://21go.com.br
curl -s -o /dev/null -w "anderson=%{http_code}\n" https://21go.com.br/andersonagripino
curl -s -o /dev/null -w "manghi=%{http_code}\n" https://21go.com.br/manghi
curl -s -o /dev/null -w "erro-noutro-site=%{http_code}\n" https://21go.com.br/manghi/qualquercoisa
```

Esperado: `200`, `200`, `200` e **`404`**. O 404 é a prova de que a regra do sub-slug ficou presa a quem está no mapa.

- [ ] **Step 8: O link do vendedor carimba e não rouba o contato**

```bash
curl -s -c /tmp/ck -o /dev/null -w "link-vendedor=%{http_code}\n" https://21go.com.br/andersonagripino/juliano
grep c21go_vend /tmp/ck
curl -s -b /tmp/ck "https://21go.com.br/api/wa?text=teste" -o /dev/null -w "%{redirect_url}\n"
```

Esperado: `200`; o cookie `c21go_vend` com valor `juliano` no jar; e a URL de redirecionamento com o **WhatsApp do Anderson** — nem o da casa (`5521980214882`), nem outro. Confirme o número dele com:

```bash
curl -s https://21go.com.br/api/consultor/andersonagripino
```

- [ ] **Step 9: Criar o acesso do Anderson (o único usuário criado na mão)**

O papel `admin` não nasce por auto-cadastro — quem se cadastra vira `vendedor`. Rode dentro do container:

```bash
$SSH "docker exec site21go node -e \"
const pg=require('pg'),c=require('crypto');
const sal=c.randomBytes(16),senha=process.env.SENHA_ADMIN;
const hash='scrypt\\\$'+sal.toString('hex')+'\\\$'+c.scryptSync(senha,sal,64).toString('hex');
const cli=new pg.Client({connectionString:process.env.SUPABASE_DB_URL});
cli.connect().then(async()=>{
  await cli.query(\\\"insert into painel_usuarios (id,consultor_slug,papel,nome,email,senha_hash,vendedor_slug) values (\\\$1,'andersonagripino','admin',\\\$2,\\\$3,\\\$4,'anderson') on conflict do nothing\\\",
    ['pu_'+c.randomBytes(9).toString('hex'),'Anderson Agripino','anderson@21go.com.br',hash]);
  console.log('admin criado');
  await cli.end();
});\"" 
```

Antes de rodar, defina `SENHA_ADMIN` no comando (`docker exec -e SENHA_ADMIN='...'`). **Entregue a senha ao dono por fora e peça troca no primeiro acesso** — nada sai pelo nosso WhatsApp (REGRA 0.1).

- [ ] **Step 10: O painel responde e separa os papéis**

```bash
curl -s -o /dev/null -w "painel=%{http_code}\n" https://parceiroanderson.21go.com.br/
curl -s -o /dev/null -w "cadastro=%{http_code}\n" https://parceiroanderson.21go.com.br/cadastro
curl -s -o /dev/null -w "sem-sessao=%{http_code}\n" https://parceiroanderson.21go.com.br/api/painel/resumo
```

Esperado: `200`, `200` e **`401`**.

Depois, no navegador: entrar como Anderson, cadastrar um divulgador de teste em `/cadastro`, fazer uma simulação completa em `21go.com.br/andersonagripino/<slug-de-teste>` e conferir que:

1. O lead aparece no painel do Anderson **atribuído ao divulgador**.
2. O divulgador vê **só** esse lead, com o telefone mascarado.
3. `/app/usuarios` na conta do divulgador mostra "Só o dono do painel vê esta página".
4. Excluir o divulgador derruba a sessão dele na próxima navegação e o lead continua no histórico com o nome dele.

- [ ] **Step 11: Registrar a sessão no vault (REGRA 3)**

Criar `<vault>/ClaudeCode/SessionLogs/2026-08-18-21Go-Site-painel-parceiro.md` com contexto, o que foi feito, arquivos alterados, decisões (subdomínio por parceiro em vez de `painel.21go.com.br`, que já é a recepção), pendências e próximos passos. Atualizar `Memoria/MEMORIA-21Go.md` e `Index.md`.

---

## Autorreview do plano

**Cobertura do spec:** login/RBAC (Tasks 4, 5, 8) · painel admin (Tasks 6, 7, 8) · painel do vendedor (Tasks 6, 7) · auto-cadastro com senha na tela (Tasks 4, 5) · link `/consultor/vendedor` e atribuição (Task 3) · slug com 4 dígitos no desempate (Task 1) · telefone mascarado (Tasks 1, 6) · soft delete (Tasks 4, 8) · migração aditiva e backfill (Task 2) · roteamento por host (Tasks 3, 5) · verificação em produção, item a item (Task 9).

**Fora do plano, de propósito:** venda/cobrança do painel, notificação de lead novo, multinível e cálculo de comissão — todos listados como YAGNI no spec.

**Consistência de tipos:** `Papel` é declarado em `sessao.ts` e importado por `usuarios.ts` e `contexto.ts`. `slugDeVendedor` recebe `{ nome, whatsapp, existentes, reservadas }` e devolve `string | null` nas duas chamadas (Task 1 define, Task 4 usa). `vendedorDoCaminho` devolve `{ vendedor, resto }` em Task 3 e é consumido com esses nomes no middleware. `mascararTelefone`/`formatarTelefone` recebem E.164 e devolvem `string`, usados só em `consultas.ts`.
