---
data: 2026-08-18
projeto: 21Go Site
tags: [painel, consultor, andersonagripino, multi-tenant, auth, indicacao]
tipo: decisão
---

# Painel do consultor — `parceiroanderson.21go.com.br`

## Contexto

Anderson Agripino (`21go.com.br/andersonagripino`, site de consultor já vendido e no ar)
comprou um sistema próprio: um painel onde ele acompanha os leads do site dele, cadastra
divulgadores, dá login a eles e vê quantos leads cada um trouxe — pra pagar comissão por
fora.

O divulgador ganha um link do tipo `21go.com.br/andersonagripino/juliano`. Todo lead que
entrar por esse link fica carimbado como "trazido pelo Juliano", mas continua nascendo no
PowerLink do Anderson e o WhatsApp continua caindo no número do Anderson.

### O que já existe (e vale reusar)

- `21go.com.br/<slug>` é servido pelo app `21go-website/` (Lightsail, container `site21go`,
  deploy por `sudo /opt/blog-autodeploy.sh`). O middleware reescreve `/<slug>/x` → `/x` e
  carimba o cookie `c21go_dono`.
- `sites_consultor` (slug, nome, whatsapp, powerlink_id, status) + `resolverConsultor()`
  com cache de 5 min e espelho em `consultores-fallback.ts`.
- `indicadores` (código curto `?ind=`) e `leads.indicado_por` — **outro** mecanismo, de
  Member Get Member do cliente final. Não se confunde com o vendedor deste painel.
- O host `meusite.` já é tratado no middleware: o padrão de subdomínio existe e funciona.
- Mapas por consultor no código (`PIXEL_POR_CONSULTOR`, `VIDEO_POR_CONSULTOR`,
  `INSTAGRAM_POR_CONSULTOR`): o jeito consagrado do repo de ligar coisa pra um consultor só
  sem coluna nova no banco compartilhado com o CRM.

### O buraco que obriga migração

A tabela `leads` **não guarda de quem é o lead**. A posse hoje só existe no `slsmnNwId`
enviado ao PowerCRM (`powerlinkDoLead()` em `api/vehicle/lead/route.ts`). Sem coluna no
lead, não há como montar nenhuma tela do painel. É a única mudança de schema inevitável.

---

## Decisões

| # | Decisão | Por quê |
|---|---------|---------|
| 1 | O painel mostra **leads**, não vendas do Hinova | É o único dado que o site tem de verdade e é 100% automático. A etapa (`novo`/`ganho`/`perdido`) vem do webhook do PowerCRM que já existe. |
| 2 | O WhatsApp do sub-link cai **sempre no Anderson** | O divulgador espalha link e ganha comissão; quem atende e fecha é o consultor. Ele não precisa saber cotar. |
| 3 | Senha aparece **na tela**, na hora do cadastro | Nosso único chip Evolution é o da casa e a REGRA 0.1 proíbe site de consultor disparar por ele (chegaria assinado "consultora Leticya"). E-mail por Gmail comum cai em spam. |
| 4 | O painel **conta**, não calcula dinheiro | Quanto vale cada indicação é combinação do Anderson por fora. Inventar regra de comissão que não conhecemos gera número que não bate com o que ele paga. |
| 5 | Mora **dentro do `21go-website`** | O risco real (mexer em middleware e `ConsultorProvider`, que servem os 18 sites vendidos) existe em qualquer opção; esta é a única que não cria infra nova pra carregar. |
| 6 | Vendedor vê o telefone **mascarado** | Ele trouxe o lead, mas quem atende é o Anderson. Telefone cheio na mão do divulgador é o caminho pra ele fechar por fora. Admin vê tudo. |
| 7 | Senha com `crypto.scrypt`, sessão com HMAC próprio | Zero dependência nova. Build no VPS leva 20min–1h e lib nativa (bcrypt) é justamente o tipo de coisa que estoura. |
| 8 | O cadastro público mora **no painel**, não no site | `parceiroanderson.21go.com.br/cadastro`. Uma página no site principal viraria rota reservada nova, mexendo nos 18 sites por um recurso de um só. |

### Não faz parte deste escopo (YAGNI)

- Fluxo de **venda** do painel (checkout Asaas, cobrança recorrente). O Anderson já pagou
  por fora; quando houver um segundo comprador, isso vira spec próprio.
- Notificação (WhatsApp/e-mail) de lead novo pro vendedor.
- Rede multinível / níveis de indicação. É um nível só: consultor → vendedor.
- Cálculo, histórico ou baixa de pagamento de comissão.

---

## Arquitetura

### Roteamento

O endereço originalmente pensado, `painel.21go.com.br`, **já está ocupado**: aponta pro
container `painel21go` (imagem `controle-acesso-21go`), o sistema de recepção/lavagem da
21Go, com acesso registrado no mesmo dia desta decisão. Decisão do dono (18/08/2026): cada
parceiro ganha **subdomínio próprio**, e o `painel.21go.com.br` não é tocado.

```
parceiroanderson.21go.com.br              → login
parceiroanderson.21go.com.br/cadastro     → auto-cadastro do vendedor
parceiroanderson.21go.com.br/app          → dashboard (admin ou vendedor)
parceiroanderson.21go.com.br/app/leads    → lista de leads
parceiroanderson.21go.com.br/app/usuarios → só admin
```

O middleware trata o host **antes** da lógica de slug, igual ao `meusite.` já é tratado:

```
host em PAINEL_POR_HOST  →  rewrite pra /painel/<consultorSlug><pathname>
```

Fisicamente: `src/app/painel/[slug]/…`. `'painel'` entra em `ROTAS_RESERVADAS` (o
`scripts/verificar-consultor.mjs` roda no `prebuild` e quebra o build se esquecer). Header
`X-Robots-Tag: noindex, nofollow` em tudo que é painel.

**O mapa host → consultor vive no código**, único lugar que decide quem tem painel:

```ts
// src/lib/consultores-painel.ts
export const PAINEL_POR_HOST: Record<string, string> = {
  'parceiroanderson.21go.com.br': 'andersonagripino',
}
```

Sem isso, o middleware precisaria consultar o banco a cada request — exatamente a carga que
a documentação do próprio middleware proíbe. `PAINEL_POR_CONSULTOR` é derivado dos valores
deste mapa e é o que libera o sub-slug do vendedor no site.

**Infra por parceiro novo** (3 passos, todos aditivos): registro A no Cloudflare apontando
pra `56.126.48.234` **DNS-only** (nuvem cinza — os domínios `21go.com.br` já são assim, e o
Caddy emite Let's Encrypt sozinho; proxied quebraria a emissão), bloco novo no
`/etc/caddy/Caddyfile` com `reverse_proxy 127.0.0.1:3100`, e uma linha no `PAINEL_POR_HOST`.

### Link do vendedor

`21go.com.br/andersonagripino/juliano` (e `/andersonagripino/juliano/cotacao`).

Regra no middleware, aplicada **só se o 1º segmento estiver em `PAINEL_POR_CONSULTOR`**:

- 2º segmento não é rota reservada e casa `/^[a-z0-9]{3,40}$/` → é vendedor.
- Reescreve pro resto do caminho (`/` quando só há 2 segmentos).
- Carimba `c21go_vend=<slug do vendedor>`, `path=/`, `sameSite=lax`, **30 dias**.

O cookie dura mais que o `c21go_dono` (que é de sessão) de propósito: o `c21go_dono` existe
pra sobreviver a um clique perdido dentro da mesma visita; este define quem recebe comissão,
e o visitante costuma voltar depois pra fechar.

**O slug do vendedor não precisa sobreviver na URL.** O `ConsultorProvider` continua lendo só
o 1º segmento (`slugDoPathname`) — nenhuma mudança lá. A atribuição viaja no cookie, a mesma
rede que já resolve a corrida de hidratação da REGRA 0.1.

Efeito colateral aceito: em `/andersonagripino/qualquercoisaerrada`, o visitante passa a ver
a home do Anderson em vez de 404. Vale só pra quem está no mapa e é comportamento benigno.

### Atribuição no lead

`/api/vehicle/lead` (e `/api/leads/from-website`) passam a resolver:

```
vendedorSlug = body.vendedorSlug ?? cookie c21go_vend
```

Antes de gravar, confere que existe um `painel_usuarios` **ativo** com aquele
`(consultor_slug, vendedor_slug)`. Slug inválido é descartado em silêncio — carimbo errado
vale menos que carimbo nenhum, porque vira comissão paga pra quem não trouxe.

`upsertLead()` grava `consultor_slug` e `vendedor_slug`. Nada mais muda no fluxo: o
PowerLink continua sendo o do consultor, o WhatsApp continua sendo o do consultor, o corte
de disparo automático (`siteDeConsultor`) continua valendo.

---

## Dados (migração `276_painel_consultor.sql`, aditiva)

```sql
CREATE TABLE IF NOT EXISTS public.painel_usuarios (
  id             text PRIMARY KEY,
  company_id     text NOT NULL DEFAULT 'company-21go',
  consultor_slug text NOT NULL,                      -- dono do painel
  papel          text NOT NULL,                      -- 'admin' | 'vendedor'
  nome           text NOT NULL,
  email          text NOT NULL,
  senha_hash     text NOT NULL,
  whatsapp       text,                               -- E.164 sem '+'
  vendedor_slug  text NOT NULL,                      -- o /andersonagripino/<este>
  token_versao   integer NOT NULL DEFAULT 1,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_login_em timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_email
  ON public.painel_usuarios(consultor_slug, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_painel_usuarios_vendedor
  ON public.painel_usuarios(consultor_slug, vendedor_slug);
CREATE INDEX IF NOT EXISTS ix_painel_usuarios_consultor
  ON public.painel_usuarios(consultor_slug) WHERE ativo;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consultor_slug text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vendedor_slug  text;

CREATE INDEX IF NOT EXISTS ix_leads_consultor_slug
  ON public.leads(consultor_slug, created_at DESC) WHERE consultor_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_leads_vendedor_slug
  ON public.leads(vendedor_slug, created_at DESC) WHERE vendedor_slug IS NOT NULL;
```

**Backfill best-effort** (roda uma vez, à mão): o histórico não tem carimbo, mas
`leads.landing_page` guarda a URL de entrada.

```sql
UPDATE public.leads SET consultor_slug = 'andersonagripino'
WHERE consultor_slug IS NULL AND landing_page ILIKE '%/andersonagripino%';
```

Vendedor histórico não existe — o link nunca foi emitido. O painel do vendedor começa zerado
e isso é correto.

> ⚠️ Banco compartilhado com o CRM. Migração é aditiva, com `IF NOT EXISTS`, aplicada por DDL
> explícita. Nada de `drizzle-kit push`, nada de seed.

### Geração do `vendedor_slug`

`slugDoNome(nome)` (mesma função do slug de consultor: minúsculas, sem acento, só `[a-z0-9]`,
3–40). Se já existir naquele consultor, concatena os **4 últimos dígitos do WhatsApp**
(`juliano` → `juliano8062`). Se ainda colidir, sufixo numérico incremental (`juliano80622`).

Slugs recusados: qualquer valor em `ROTAS_RESERVADAS` (senão `/andersonagripino/cotacao`
viraria vendedor e derrubaria a cotação do site dele) e qualquer coisa que não case o formato.

---

## Autenticação

- **Senha:** `crypto.scryptSync(senha, salt, 64)`, salt de 16 bytes, guardada como
  `scrypt$<salt-hex>$<hash-hex>`. Comparação com `timingSafeEqual`.
- **Sessão:** cookie httpOnly `painel_sess`, valor `base64url(payload).base64url(hmacSHA256)`
  com `{ uid, slug, papel, v, exp }`, 7 dias, assinado com `PAINEL_SESSAO_SEGREDO` (env novo).
- **Revogação:** `v` é o `token_versao` do usuário. Excluir usuário, desativar ou redefinir
  senha incrementa a coluna — toda sessão viva morre no request seguinte. Sem tabela de
  sessão, sem consulta extra por request além do próprio carregamento da página.
- **Rate limit no login:** 5 tentativas por (e-mail + IP) a cada 15 min, em memória. Container
  único, então memória basta; não vale criar tabela por isso.
- No auto-cadastro a pessoa **escolhe** a própria senha (mínimo 8 caracteres) — ela está na
  tela, é o momento natural de definir. Senha gerada só existe quando o **admin** cria ou
  redefine a senha de alguém: 8 caracteres do alfabeto sem ambiguidade
  (`23456789abcdefghjkmnpqrstuvwxyz`, o mesmo do `indicacao.ts` — vai ser lido em print de
  celular).

`slugDoNome()` já existe em `consultor.ts`, mas só normaliza: o painel precisa também cortar
em 40 e recusar resultado com menos de 3 caracteres (nome "Jô" viraria slug inválido).

### Isolamento entre consultores

Toda query do painel filtra por `consultor_slug` tirado **da sessão**, nunca do host nem da
URL. O cookie de sessão é gravado sem `domain`, então fica preso ao subdomínio que o emitiu:
sessão de `parceiroanderson` não viaja pro subdomínio de outro parceiro. A sessão também
carrega o slug, e toda rota confere se ele bate com o do host — divergência é 401.

---

## Telas

### Login (`/`)
E-mail + senha, nome e logo do consultor no topo (vem de `resolverConsultor`), link
"Quero divulgar e ganhar" → `/cadastro`. Consultor fora do ar (`estaNoAr() === false`) → a
mesma página "não está disponível" do site.

### Cadastro (`/cadastro`)
Nome, WhatsApp, e-mail, senha escolhida pela pessoa (com opção de gerar). Ao concluir, a tela
mostra: link de divulgação com botão copiar, e-mail e senha. Já entra logado.

### Dashboard admin (`/app`)
- Cards: leads no mês, leads hoje, em negociação, ganhos, perdidos.
- Ranking de vendedores: nome, link, leads no mês, ganhos, total histórico.
- "Direto no meu link" como linha própria (leads sem `vendedor_slug`).
- Últimos 10 leads.

### Dashboard vendedor (`/app`)
- Meu link, grande, com botão copiar.
- Cards: leads totais, no mês, ganhos.
- Meus últimos leads.

### Leads (`/app/leads`)
Tabela: data, nome, telefone (mascarado pro vendedor), veículo, valor cotado, etapa, vendedor
(só admin). Filtros: período e vendedor (só admin). Paginação de 50.

### Usuários (`/app/usuarios`, só admin)
Tabela com nome, e-mail, link, leads, status. Ações: criar (define senha na hora), editar
(nome, e-mail, WhatsApp), redefinir senha (mostra a nova na tela), ativar/desativar, excluir.

**Excluir é soft delete**: `ativo = false` + `token_versao + 1`. Apagar a linha soltaria o
`vendedor_slug` pra outra pessoa e reescreveria o histórico de quem trouxe cada lead.

Visual: mesma paleta obrigatória da marca — azul `#293C82`, laranja `#F2911D`, verde
`#C7D301` — e Tailwind, como o resto do site.

---

## APIs

```
POST /api/painel/entrar        { email, senha }               → cookie de sessão
POST /api/painel/sair
POST /api/painel/cadastro      { nome, whatsapp, email, senha }
GET  /api/painel/resumo        → cards + ranking (papel decide o recorte)
GET  /api/painel/leads         ?de&ate&vendedor&pagina
GET  /api/painel/usuarios      (admin)
POST /api/painel/usuarios      (admin)  criar
PATCH/DELETE /api/painel/usuarios/[id] (admin)  editar / redefinir senha / excluir
```

Todas resolvem a sessão pelo cookie e derivam `consultor_slug` e `papel` dela. Vendedor que
chamar rota de admin leva 403.

---

## Como se verifica que terminou

Em produção, depois do deploy:

1. `curl -s -o /dev/null -w "%{http_code}" https://21go.com.br/andersonagripino` → **200**
   (o site vendido continua de pé).
2. `curl -i https://21go.com.br/manghi/qualquercoisa` → **404** (os outros 17 sites não
   mudaram de comportamento).
3. `curl -c ck -o /dev/null "https://21go.com.br/andersonagripino/juliano"` → serve a home do
   Anderson e o cookie `c21go_vend=juliano` está no jar.
4. `curl -b ck -i "https://21go.com.br/api/wa?text=t"` → número do **Anderson**
   (5521…), não o da casa e não o do Juliano.
5. Simulação completa entrando por `/andersonagripino/juliano`: a linha em `leads` sai com
   `consultor_slug='andersonagripino'` e `vendedor_slug='juliano'`, e o `slsmnNwId` enviado
   ao Power é o do Anderson.
6. `curl -s -o /dev/null -w "%{http_code}" https://painel.21go.com.br/login` → **200**
   (o controle de acesso da recepção continua de pé — este host não foi tocado).
7. `https://parceiroanderson.21go.com.br` responde **200** e o login do Anderson entra no
   dashboard de admin com o lead do passo 5 visível, atribuído ao Juliano.
8. Login do Juliano vê **só** o lead dele, com telefone mascarado, e não abre
   `/app/usuarios` (403).
9. Excluir o Juliano no painel: a sessão dele morre no request seguinte e o histórico do lead
   continua apontando pra ele.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Mexer no middleware quebra os 18 sites vendidos | A regra do sub-slug só roda pra quem está em `PAINEL_POR_CONSULTOR`. Verificação 2 acima é justamente o site de outro consultor. |
| Migração no banco compartilhado com o CRM | Só `ADD COLUMN IF NOT EXISTS` e `CREATE TABLE IF NOT EXISTS`. Nenhuma coluna existente é tocada. |
| Painel no mesmo build derruba o site | Rotas do painel isoladas em `src/app/painel/`, todas `force-dynamic`. Build local antes de qualquer deploy; baseline de 200 no site antes e depois (REGRA 0). |
| Vendedor pular o consultor e vender por fora | Telefone mascarado e WhatsApp sempre no consultor. |
| Subdomínio novo sem certificado | Registro Cloudflare **DNS-only**. Proxied impede o Caddy de emitir Let's Encrypt e o painel abre com erro de certificado. |
| Auto-cadastro aberto virar entulho | Soft delete + desativar no painel do admin. Se virar problema de verdade, aí sim entra aprovação. |

## Links relacionados

- [[MEMORIA-21Go]]
- [[project_sites_massa_consultores]]
- [[feedback_site_vendido_contato_e_ciclo]]
- CLAUDE.md do projeto — REGRA 0, 0.1 e 0.2
