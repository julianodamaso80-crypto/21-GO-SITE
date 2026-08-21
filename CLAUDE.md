# MASTER PLAN — 21Go CRM: Plataforma de Proteção Veicular

Este documento é a BÍBLIA do projeto. Leia INTEIRO antes de tocar em qualquer código.
Toda decisão de código, design, UX e arquitetura deve ser guiada por este documento.

---

## 🚨 REGRA 0 — SITE DE CONSULTOR SÓ VAI AO AR COM PAGAMENTO CONFIRMADO

> Primeiro confere o pagamento no Asaas. **Só depois** cria/ativa o site. Sem exceção.

Quem ativa um site de consultor é o **webhook do Asaas**, nunca uma pessoa e nunca o agente.

**Proibido, sempre:**
- `update sites_consultor set status='ativo' where status='pendente'` — ou qualquer ativação em massa.
- Ativar um slug na mão porque "está fora do ar".
- Promover status ao sincronizar o espelho `src/lib/consultores-fallback.ts`.

**`pendente` NÃO é "fora do ar" — é "não pagou".** O site serve, mas `estaNoAr()` dá `false` e o botão de WhatsApp cai no número da casa. **Isso é o comportamento correto, não é bug.** Não "consertar".

- `estaNoAr()` = `ativo` **ou** `inadimplente` (inadimplente segue no ar, o corte é no 5º dia).
- Ao investigar "site fora do ar", separar sempre **indisponibilidade técnica** (container, DNS, build, imagem) de **estado de cobrança** (`pendente`, `cancelado`). Só a primeira é para consertar.
- Se um pedido implicar ativar alguém sem pagamento, **parar e falar** — mesmo sob "não me faça perguntas".

> Origem: em 14/08/2026 o agente rodou o UPDATE acima e liberou 4 sites de gente que clicou pra comprar e não pagou, ao ler "todos têm que estar ativos no ar" como ordem de mudar status. Estado de cobrança foi confundido com disponibilidade.

### REGRA 0.1 — Tudo de `/fulano` é do fulano

Num site vendido, **todo** contato vai pro número do consultor **e todo lead nasce no Power dele, pelo powerlink dele**. Regra absoluta.

**⚠️ A armadilha: a corrida de hidratação.** O HTML é prerenderizado e compartilhado — o mesmo arquivo serve `/`, `/manghi` e `/regionalsp`. A home de qualquer consultor sai com **22 links `href="/cotacao"` sem slug**; ele só entra depois que a página hidrata (`ConsultorProvider` lê `window.location.pathname`). **Quem clica antes disso cai na cotação da CASA** — lead vai pro PowerLink da 21Go e o botão de WhatsApp pro número da casa. É intermitente e silencioso.

- O servidor sempre sabe de quem é a visita: o middleware carimba o cookie **`c21go_dono`**, e `/api/wa` e `/api/vehicle/lead` leem esse cookie quando o slug não veio pela URL.
- **Nunca confie só no slug da URL/corpo em código novo** — sempre com o cookie como rede.
- Antes de culpar o powerlink, cheque o slug: os 11 sites já estavam com `teste_ok: true`.
- Teste que reproduz: `curl -c ck -o /dev/null .../manghi` e depois `curl -b ck -i ".../api/wa?text=t"` (sem `?c=`) tem que dar o número do Manghi.

**Consequência: site de consultor NÃO dispara nada pelo nosso chip.** O único número conectado na Evolution é o da casa (`site4824`) — qualquer envio automático chega ao cliente assinado *"consultora leticya"*, e o lead que o consultor pagou pra ter é abordado por outra pessoa. No site dele o contato acontece pelo **botão** (`/api/wa?c=<slug>` → `wa.me` dele), que não usa Evolution.

- Guarda em `vehicle/lead/route.ts`: `const siteDeConsultor = Boolean(body.consultorSlug)` corta BYD e `WHATSAPP_AUTO_DISPATCH`.
- **A simulacao termina na TELA DE PLANOS, nunca no WhatsApp** (20/08/2026): site vendido mostra o resultado igual ao `.site` — os planos, os detalhes, os CTAs. Quem abre a conversa e o cliente, clicando em "Quero contratar" (`contratarHref` → `wa.me` do consultor, com a mensagem montada + o LINK do PDF `/api/pdfs/<leadId>`; `wa.me` nao anexa arquivo nem envia sozinho).
  > Em 19/08/2026 foi ligado um redirect automatico (`autoWa`) que pulava a tela de planos e caia direto no `api.whatsapp.com`. O dono viu e mandou tirar em 20/08: **o cliente tem que ver os planos**. Nao reintroduzir sob "abre sozinho pra nao perder o lead" — pular a tela de planos e perder a venda, nao ganhar.
- O disparo por chip (`sendConsultorQuoteWithPdf`) existe mas esta **DESLIGADO** (`CONSULTOR_AUTO_DISPATCH=false`): a instancia de avisos e o celular do proprio dono, e ele mandou parar. So ha 2 numeros conectados — o dele e o `site4824` da casa. Religar exige chip novo.
- Ao criar qualquer envio novo, pergunte antes: *"isso pode sair num site de consultor?"* — e
  **de qual número isso sai, e ele autorizou?**

> **O número do remetente não é escolha sua.** Venda de site (entrega do link, cobrança, qualquer
> conversa com o consultor) sai **só do 5521992208062**. Chip dele desconectado = **não envia por
> ninguém e avisa ele** — nunca "melhor mandar de outro número do que não mandar". Em 21/08/2026 o
> agente criou um canal reserva por conta própria e dois consultores receberam o site de um número
> assinado *"consultora leticya 21go"*. A única mensagem que pode sair por outro número é o alerta
> **para o dono**, porque é justamente o chip dele que está fora quando ele precisa saber.

> Origem: em 17/08/2026 um BYD simulado em `/andersonagripino` recebeu texto + PDF do 4824.

### REGRA 0.2 — Cobrança é de 30 em 30 dias, 1x por mês

Depois de pago, a próxima cobrança é em **30 dias**. Ninguém é cobrado, avisado ou cortado num período menor.

**A pergunta certa é "quando pagou pela última vez", nunca "tem parcela aberta"** — as duas divergem, porque o Asaas cria a parcela do mês seguinte junto e o dinheiro pode cair na errada.

- Use `situacaoDeCobranca()` (`lib/asaas.ts`), que devolve a parcela aberta **e** `ultimoPagamentoEm`. `DIAS_DO_CICLO = 30` no cron.
- A data é a do **pagamento**, não a do vencimento.
- A API do Asaas devolve as cobranças **da mais nova pra mais antiga**: sempre ordenar por `dueDate` antes de escolher, senão o checkout mostra o Pix do mês seguinte.
- Cobrar e cortar não se desfazem. Asaas fora do ar = pula, nunca age às cegas.

> Origem: em 15/08/2026 o cron cobrou 4 consultores em dia, e em 17/08 cobrou o `hugoaguiar`, que havia pagado — o dinheiro dele caiu na parcela de setembro.

---

## 1. O QUE É A 21Go

A 21Go é uma associação de proteção veicular no Rio de Janeiro com 20+ anos de mercado. NÃO é seguradora — funciona por mutualismo: todos os associados contribuem mensalmente para um fundo comum, e quando alguém sofre um sinistro (roubo, colisão, incêndio), o fundo cobre. Quanto mais associados, menor o rateio mensal para cada um.

### Planos
- **Básico**: Roubo/furto + Assistência 24h (guincho 200km)
- **Completo**: + Colisão + Incêndio + Carro reserva 7 dias
- **Premium**: + Terceiros R$100K + Vidros + Carro reserva 15 dias + Rastreamento

### Cálculo da mensalidade
`valor_mensal = valor_fipe × taxa_plano + R$35 (taxa admin)`
Taxas: Básico 1.8%, Completo 2.8%, Premium 3.8%

### Sistemas que a 21Go já usa
- **Hinova SGA**: gestão de associados e veículos
- **Hinova SGC**: boletos, cobranças, inadimplência
- **Hinova PowerCRM**: cotações e leads (básico)
- **WhatsApp**: atendimento manual (sem API ainda)
- **Instagram**: captação orgânica
- **Reclame Aqui**: nota 5.1 (precisa subir para 7.5+)

---

## 2. O QUE ESTAMOS CONSTRUINDO

Uma plataforma completa que substitui e integra tudo: CRM + IA + Operação + Growth. NÃO é apenas um CRM — é o sistema nervoso central da 21Go.

### 4 Pilares da transformação

**Pilar 1 — Retenção**: NPS automatizado, gestão Reclame Aqui, detecção de churn, onboarding 30 dias. Parar a sangria de clientes.

**Pilar 2 — Inteligência**: 11 agentes de IA especializados no coração da operação. Pré-venda 24/7, pós-venda proativo, briefing para gestores, gestão de sinistros inteligente, SEO data-driven.

**Pilar 3 — Crescimento**: Tráfego pago (Google Ads + Meta Ads), SEO, landing pages com cotação automática. Sair da invisibilidade online.

**Pilar 4 — Indicação**: Programa Member Get Member. 10% de desconto por indicação que fecha, acumulativo. 10 indicações = proteção gratuita.

---

## 3. QUEM USA O SISTEMA (1 app, 4 roles)

É UM sistema só. Mesmo login, mesma URL. O que muda é o menu lateral baseado na role do usuário.

### VENDEDOR (ex: Rodrigo, Carla, Thiago)
**Rotina**: Recebe leads qualificados pelo agente IA → liga/WhatsApp → move no funil → fecha adesão
**Vê**: Meus Leads, Funil/Kanban, Chat/WhatsApp, Cotação FIPE, Meu Desempenho
**NÃO vê**: Dashboard geral, Analytics, NPS, Financeiro, Sinistros, Config

### OPERAÇÃO (ex: Carlos mecânico, Pedro pintor, Ana vistoriadora)
**Rotina**: Abre app no celular → vê agenda do dia → atualiza status dos serviços → tira fotos
**Vê**: Minha Agenda, Sinistros atribuídos, Vistorias, Upload de fotos, Status de veículos
**NÃO vê**: Leads, Cotação, Dashboard, Financeiro, Analytics, MGM
**Importante**: Interface MOBILE-FIRST. Botões grandes, upload fácil, status com 1 toque.

### GESTOR (ex: Diretor comercial, gerente operacional)
**Rotina**: Briefing da manhã → Dashboard → age nos alertas → analisa campanhas → relatório do dia
**Vê**: Dashboard, Analytics, NPS, Ranking vendedores, Financeiro, MGM, Todos os leads, Automações, Projetos, Agentes IA, Sinistros (todos)
**Tela especial**: Aba Projetos (Kanban) para acompanhar evolução dos projetos com a FlowAI

### ADMIN
**Vê**: Tudo + Configurações do sistema, gestão de usuários, roles

### Regra de dados
- Vendedor só vê SEUS leads (filtrar por vendedor_id)
- Operação só vê SEUS sinistros/vistorias atribuídos
- Gestor e Admin veem tudo

---

## 4. OS 11 AGENTES DE IA

Cada agente tem um system prompt completo em `21go-squad/agents/`. Todos os 11 agentes estão instalados no módulo de IA do CRM.

| # | Agente | Icon | Função | Acesso | Framework base |
|---|--------|------|--------|--------|----------------|
| 1 | 21Go Chief | shield | Orquestrador — roteia para o agente certo | Todos | Routing por domínio |
| 2 | Pré-Venda | robot | Qualifica leads, cotação FIPE, atende 24/7 | vendedor, gestor | Hormozi CLOSER |
| 3 | Pós-Venda | handshake | Onboarding 30 dias, atendimento associados | vendedor, gestor | Hormozi Retention |
| 4 | Gestores | brain | Briefing manhã, relatório dia, consultas | gestor, admin | Data Chief + COO |
| 5 | Retenção | shield | Anti-churn, LTGP, segmentação por valor | gestor, admin | Hormozi + Peter Fader |
| 6 | Crescimento | rocket | MGM, viral loops, gamificação | gestor, admin | Sean Ellis (Dropbox) |
| 7 | Tráfego | target | Google Ads, Meta Ads, tráfego pago | gestor, admin | Pedro Sobral + Kasim |
| 8 | Operação | wrench | Agenda oficina, status serviço, vistorias | operação, gestor | Mobile-first |
| 9 | Financeiro | money | Boletos, inadimplência, MRR, projeções | gestor, admin | Integração Hinova SGC |
| 10 | Sinistros | alert | Abertura ao encerramento, oficinas, prazos | operação, gestor | Fluxo de 5 etapas |
| 11 | Danih (SEO) | search | SEO, keywords, blog, E-E-A-T, GEO, schema | gestor, admin | 7 mestres SEO integrados |

---

## 5. ESTADO ATUAL DO PROJETO

### O que JÁ foi feito:
- [x] Squad 21Go criada com 11 agentes (.md com system prompts)
- [x] Fase 1: 11 agentes instalados no módulo de IA do CRM (10 originais + Danih SEO)
- [x] Fase 2: Módulos de saúde removidos (Doctors, Appointments, Prontuário, Convênios)
- [x] Design system sofisticado aplicado (tema dark + dourado #C9A84C)
- [x] Módulo de Projetos (Kanban) criado
- [x] Dashboard adaptado para proteção veicular
- [x] NPS adaptado (removido referências a médicos)
- [x] 7 commits no GitHub, deploy configurado no Railway

### O que FALTA fazer (em ordem de prioridade):

**Arquitetura de Dominios:**
- **21go.site** → Site publico (Next.js, 21go-website/) — deploy Vercel
- **app.21go.site** → CRM interno (React+Fastify) — deploy Railway
- Cloudflare gerencia DNS de ambos

**URGENTE — Deploy:**
- [x] CRM rodando em app.21go.site (Railway)
- [ ] Site publico rodando em 21go.site (Vercel)
- [ ] Configurar DNS no Cloudflare (app.21go.site -> Railway, 21go.site -> Vercel)

**Fase 3 — Contacts -> Associados:**
- [ ] Adaptar modelo Contact com campos veiculares (CPF, status, hinova_id, origem, UTM)
- [ ] Remover campos médicos
- [ ] Frontend: renomear tudo, tabela, formulário, drawer com tabs

**Fase 4 — Módulo Veículos:**
- [ ] Backend CRUD completo (placa, FIPE, plano, vistoria)
- [ ] Endpoint: GET /api/contacts/:id/vehicles
- [ ] Frontend: página + aba no drawer do associado

**Fase 5 — Leads + Sidebar por role:**
- [ ] Campos veiculares nos leads (placa, FIPE, cotação, etapa funil)
- [ ] Sidebar filtra menu por role do usuário logado
- [ ] RBAC middleware no backend

**Fase 6 — Módulos novos:**
- [ ] Sinistros (abertura, oficinas, status, fotos, timeline)
- [ ] Cotação FIPE (motor de cálculo automático)
- [ ] Member Get Member (link rastreável, desconto acumulativo)

**Fase 7 — Integrações:**
- [ ] WhatsApp Business API
- [ ] Hinova SGA/SGC/PowerCRM (API REST)
- [ ] Tabela FIPE (API externa)
- [ ] Google Ads + Meta Ads (pixel + conversões)

**Fase 8 — Agentes novos:**
- [ ] Instalar Agente Financeiro (money) no módulo de IA
- [ ] Instalar Agente Sinistros (alert) no módulo de IA

---

## 6. STACK TÉCNICA

- **Backend**: TypeScript, Fastify 4.26, Prisma 5.9.1, PostgreSQL
- **Frontend**: React 18, Vite, TanStack Query, Zustand, Tailwind CSS
- **Types**: Centralizados em shared/types/index.ts
- **Validação**: Zod (backend), React Hook Form (frontend)
- **IA**: Módulo em backend/src/modules/ai/ com CRUD de agentes
- **Padrão de módulos**: service -> controller -> routes (backend)
- **Site Publico**: Next.js 16, Tailwind CSS 4, MDX (pasta 21go-website/) — deploy Vercel em 21go.site
- **CRM Deploy**: Railway (Postgres + Redis + App) em app.21go.site — Cloudflare DNS

---

## 7. DESIGN SYSTEM

> **Referencia completa**: ver `brand-guide.md` na raiz do projeto.
> Toda decisao visual deve seguir o brand guide. Abaixo um resumo executivo.

Consultar **`brand-guide.md`** na raiz do projeto para a identidade visual completa.

Resumo rapido:
- **Tema**: Dark luxuoso (referencias: Linear App, Raycast, Vercel, Stripe)
- **Cor primaria**: Azul royal `#1B4DA1` (blue-500) -- identidade principal, sidebar, headers
- **Cor secundaria**: Laranja `#E07620` (orange-500) -- CTAs, logo, botoes de acao
- **Fundos**: `#060A14` (dark-950) -> `#0B1120` (dark-900) -> `#111827` (dark-800) -> `#1A1F35` (dark-700, cards)
- **Tipografia**: Outfit (display) + DM Sans (body) + JetBrains Mono (codigo/placas)
- **Tokens Tailwind**: `frontend/tailwind.config.js` (cores, sombras, animacoes, gradientes)
- **Componentes, tom de voz, icones, espacamento**: ver brand-guide.md

---

## 8. REGRAS DE OURO

1. **1 sistema, 4 roles** — sidebar muda por role, dados filtram por permissão
2. **Mobile-first para operação** — mecânico usa celular com mão suja
3. **Dados cruzam, telas não** — vendedor fecha -> vistoria aparece pra operação automaticamente
4. **Cada agente IA fala com um mundo** — pré-venda com vendedor, operação com mecânico, gestores com diretoria
5. **Receita primeiro** — sempre priorizar o que gera ou protege receita
6. **Mantenha o padrão** — mesmo estilo de código, mesma estrutura de módulos
7. **Commits frequentes** — mensagens descritivas em português
8. **Não atropele** — cada fase depende da anterior estar estável

---

## 9. STANDARDS DE CÓDIGO

### TypeScript
- **Type hints obrigatórios** em todas as funções públicas
- Usar types do `shared/types/index.ts` (nunca duplicar)
- `strict: true` no tsconfig

### React/Frontend
- **Componentes funcionais** apenas (sem classes)
- **Hooks customizados** para lógica de negócio (ex: `useContacts`)
- **Services** para chamadas API (ex: `contacts.service.ts`)
- **TanStack Query** para cache/estado servidor
- **Zustand** apenas para estado global (auth)
- **Tailwind CSS** para estilos (sem CSS modules)
- **Lucide React** para ícones
- **Sonner** para toasts

### Backend/Fastify
- **Estrutura modular:** module/service + controller + routes
- **Validação:** Zod schemas
- **Erros:** usar `AppError` para erros de negócio
- **Multi-tenant:** SEMPRE filtrar por `companyId`
- **RBAC:** verificar permissões antes de ações sensíveis

### Padrão de CRUD (usar Contacts como referência)
```
Backend:
  modules/{resource}/
    ├── {resource}.service.ts    # Lógica de negócio
    ├── {resource}.controller.ts # HTTP handlers
    └── {resource}.routes.ts     # Definição de rotas

Frontend:
  services/{resource}.service.ts  # Chamadas API
  hooks/use{Resource}.ts          # React Query hooks
  pages/{resource}/
    ├── {Resource}Page.tsx        # Página principal
    ├── {Resource}Table.tsx       # Tabela/lista
    ├── {Resource}Form.tsx        # Formulário
    └── {Resource}Drawer.tsx      # Modal lateral
```

### Bibliotecas Já Instaladas (usar!)
- **React DnD** - drag & drop (para Kanban)
- **Recharts** - gráficos (para Dashboard)
- **React Hook Form + Zod** - formulários com validação
- **date-fns** - manipulação de datas
- **Socket.io** - real-time (para chat/inbox)

---

## 10. COMMON COMMANDS

### Desenvolvimento
```bash
# Frontend (porta 5173)
cd frontend && npm run dev

# Backend MOCK (porta 3333) - SEM banco de dados
cd backend && npm run dev:mock

# Backend REAL (precisa PostgreSQL rodando)
cd backend && npm run dev
```

### Database (Prisma)
```bash
cd backend
npx prisma generate
npx prisma migrate dev --name nome_da_migration
npx prisma studio
npm run prisma:seed
```

### Build
```bash
cd frontend && npm run build
cd frontend && npm run type-check
cd backend && npm run build
cd backend && npm run test
```

---

## 11. API ENDPOINTS

### Implementados
```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
GET    /api/auth/me

GET    /api/contacts          # Paginação + busca
GET    /api/contacts/:id      # Com relacionamentos
POST   /api/contacts
PUT    /api/contacts/:id
DELETE /api/contacts/:id
GET    /api/contacts/tags
GET    /api/contacts/stats
```

### A implementar (mesmo padrão)
```
/api/leads
/api/vehicles
/api/sinistros
/api/pipes
/api/phases
/api/cards
/api/conversations
/api/webhooks
/api/automations
```

---

## 12. MULTI-TENANCY & RBAC

### Multi-tenancy
Todos os models têm `companyId`. NUNCA esquecer de filtrar por empresa:
```typescript
// CORRETO
const contacts = await prisma.contact.findMany({
  where: { companyId: user.companyId }
})

// ERRADO (vaza dados de outras empresas!)
const contacts = await prisma.contact.findMany()
```

### RBAC
Sistema de permissões: `resource:action:scope`
```
deals:read:own    -> só seus deals
deals:read:all    -> todos da empresa
deals:delete      -> pode deletar
settings:billing  -> acesso a faturamento
```
