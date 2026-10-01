---
data: 2026-10-01
projeto: 21go
tags: [isa, mariana, gabriel-juliano, whatsapp, crm, cloud-api]
tipo: decisão
---

# Mariana — a Isa do Gabriel Juliano (ciclo 2)

## Contexto

Dono, 01/10/2026: o número **21 96653-0011** vira a **Mariana**, robô de atendimento do consultor
Gabriel Juliano. *"vc vai seguir exatamente a inteligencia que a isa ta hj, do msm jeito, nao
esqueça nada"*; *"ela vai responder como a isa, mais ela vai ser mariana, banco diferente pra nao
embolar, tudo da mariana vai cair no power do gabriel e vai cair no crm do gabriel"*; *"os gastos
que tiver do meta vai pra aba gasto dele"*. A Mariana também procura quem cotou no site do Gabriel
(21go.app), igual a Isa faz com os .site da casa, com o resultado e o PDF.

**Regra-mãe:** tudo que a Isa faz, a Mariana faz igual. Só muda o que é do Gabriel.

Inventário completo dos pontos amarrados à casa: `21go-website/.superpowers-mariana-inventario.md`
(seções A–H, com arquivo:linha). Este documento decide; o inventário localiza.

## Números e contas

| | Isa (hoje) | Mariana |
|---|---|---|
| Número | 21 98004-0964 | 21 96653-0011 |
| WABA | `932143313296745` | `1387797460178079` |
| Phone id | `1457563414097446` | `1308557115675774` (registrado na Cloud API em 01/10) |
| Token | `WA_TOKEN` | o mesmo `WA_TOKEN` |
| Humano dono da conversa | Leticya, 4824 (21 96945-4824) | Gabriel Juliano, 21 99095-4964 |
| Power | `WDVMKnkq` | `XDmAbx6D` |
| Alertas e relatório | dono/Leticya (como hoje) | Gabriel (`5521990954964`) |
| Leads abordados | .site da casa | 21go.app |
| CRM | aba WhatsApp da Leticya | aba WhatsApp do Gabriel (atendente Mariana) |

Modelos de mensagem: os 5 da Isa (`resultado_simulacao_isa`, `duvida_valores_isa`,
`alerta_atendimento_isa`, `alerta_desconto_isa`, `ativacao_atualizada_v18`) foram criados na WABA
da Mariana em 01/10 com o mesmo nome e o mesmo texto, e aguardam aprovação da Meta. Enquanto não
aprovam, as travas que já existem seguram o 5 min e a retomada (`template_nao_liberado`).

## Arquitetura: a mesma Isa, outra configuração

**Um código, dois containers.** A Mariana roda a MESMA imagem do site (`site21go`), num segundo
container `mariana21go`, com o próprio env. Toda melhoria da Isa chega à Mariana no mesmo deploy.

### 1. Identidade configurável (padrão = Isa, byte a byte)

Um módulo de configuração do bot (`src/lib/isa/identidade.ts`) junta tudo que hoje está fixo:
nome do bot, nome/telefone/rótulo do humano, número de transferência e de BYD, PowerLink,
número de alerta, host do painel, origem e prefixo dos leads da IA, fonte de leads do 5 min,
etiqueta da transferência, indicação do "Quero ser consultor", instância (`evolution_instance`)
e schema do banco. **Cada valor tem como padrão o valor de hoje da Isa**; só o env do container
da Mariana troca. Funções `.regras.ts` recebem a identidade por parâmetro (o painel no navegador
também as usa e não lê env); o servidor a monta a partir do env.

Critério de aceite: com o env da Isa, nenhum texto, consulta ou comportamento da Isa muda — todos
os testes atuais passam sem alteração e o eval de 45 perguntas dá o mesmo placar.

### 2. Banco separado

- Schema `mariana` com cópia das tabelas por-bot (`isa_contatos`, `isa_eventos`, `isa_config`,
  `isa_promocoes`, `consultor_recrutamento`), criada por `LIKE public.<t> INCLUDING ALL` (pega as
  4 colunas que existem só em produção), com sequência própria para `isa_eventos.id`, RLS ligado e
  REVOKE de anon/authenticated. DDL aditiva, `IF NOT EXISTS`, aplicada à mão. Nunca reset/push.
- Todo SQL das tabelas por-bot passa a usar o schema da identidade (padrão `public`).
- `conversations`/`messages` continuam compartilhadas, separadas por `evolution_instance`
  (`cloud_mariana`). As consultas da Isa já filtram `cloud_isa`.
- `leads` continua compartilhada. Lead da Mariana tem marca própria: origem `mariana_whatsapp`
  (o que a IA cria), prefixo de `trk` próprio, e `dominio = '21go.app'` (o que vem do site dele).
  `leadDoCliente` passa a olhar só os leads da fonte do bot (a Isa continua sem os do 21go.app).

### 3. O que muda de comportamento (só na Mariana, pela configuração)

- **Transferência, "posso te ligar?", BYD, supervisor:** Gabriel e o número dele.
- **Etiquetas/funil:** a lista da Isa com `leticya` → `gabriel` ("Falando com Gabriel") e sem
  `guilherme`. "Escolheu plano" vai para `gabriel`, como na Isa vai para `leticya`.
- **Alertas e relatório diário:** para o Gabriel, saindo pelo número da Mariana (igual a Isa sai
  pelo número dela). Link do painel = host da Mariana.
- **PDF:** lead da Mariana sai com o rodapé e o botão de WhatsApp do Gabriel, nunca o da casa, e
  sem a promoção 40% da casa.
- **"Quero ser consultor":** igual, com a indicação do Gabriel.
- **Fila de pendentes do Power (cron da casa):** lead `mariana_whatsapp` que falhou é recadastrado
  no Power do Gabriel (`XDmAbx6D`), nunca no da Leticya.
- **Rótulo do dono nos eventos** (`por: 'juliano'`): o rótulo do humano da identidade.

### 4. O que é só da casa e fica fora da Mariana

Promoção 40% (`isa_promocoes`/`promo40` vazias no schema dela), vigia-BYD do 4824, popup de
saída e `/api/wa` dos .site. Não são agendados nem chamados no container dela.

### 5. Leads do 21go.app (o 5 min da Mariana)

A rota `/api/parceiro/lead` passa a, além de criar a cotação no Power do Gabriel (como hoje),
gravar o lead completo no nosso banco como o site da casa grava: consulta da placa, planos e
preços **do Power**, modelo, com `dominio = '21go.app'`. A abordagem dos 5 min e a retomada da
Mariana usam essa fonte; a da Isa continua só com os .site da casa (o 21go.app já fica de fora).
A checagem "não falar por cima de conversa de outro chip nas últimas 24 h" continua valendo para
os dois (é a regra da Isa).

### 6. Infraestrutura

- Container `mariana21go`, mesma imagem, env `/opt/site21go/.env-mariana`, blue/green nas portas
  3110/3111 atrás do Caddy, host `mariana.21go.site` (Cloudflare, proxy laranja, `tls internal`
  como o 21go.site).
- O `blog-autodeploy.sh` passa a trocar também o `mariana21go` depois do `site21go`, com a mesma
  espera de saúde.
- Cron próprio `/opt/mariana-cron.sh` a cada minuto, descobrindo a porta (blue/green).
- Webhook: `subscribed_apps` na WABA da Mariana com `override_callback_uri` para
  `https://mariana.21go.site/api/webhooks/whatsapp-bot`. A Isa não muda.
- Começa em **modo teste** (`ISA_MODO_TESTE` ligado), allowlist = dono (5521992208062) e Gabriel.
  Produção só quando o dono mandar.

### 7. CRM do Gabriel

- `ATENDIMENTO_MARIANA_URL` no CRM; as rotas do atendente Mariana repassam para o container dela
  com a mesma chave, só para quem está em `ATENDIMENTO_MARIANA_USUARIOS`. As rotas da Isa não mudam.
- **WhatsApp:** a mesa completa da Isa (lista, conversa, responder, áudio, arquivo, reabrir,
  etiquetas, funil, liga/desliga, nota, resolvido) ligada à Mariana; nome e etiquetas vêm do
  container dela.
- **Gastos:** custo do WhatsApp da WABA da Mariana (`pricing_analytics`, moeda da conta). Meta Ads
  dele segue em branco até ter a conta de anúncio.
- **Lucro:** "Quem fechou" Mariana × Gabriel pela regra da Leticya — quem o cliente respondeu
  primeiro, ligado pelo telefone (`cloud_mariana`).
- O aviso de mensagem nova (`avisarCrm`) vale para a instância da identidade.

## Entrega em fases (cada uma no ar e conferida antes da seguinte)

- **Fase 1 — identidade e schema no código.** Sem efeito na Isa: deploy da casa com testes e eval
  iguais.
- **Fase 2 — Mariana no ar em modo teste.** Schema `mariana`, container, host, cron, webhook.
  Conversa real de teste do dono com o 96653-0011.
- **Fase 3 — CRM do Gabriel.** Mesa, Gastos e Lucro ligados à Mariana.
- **Fase 4 — leads do 21go.app.** Gravação do lead, 5 min e retomada (depende dos modelos aprovados).

## Testes

- Todos os testes atuais passam sem mudança (prova de que a Isa ficou igual).
- Variantes Mariana dos testes com identidade fixa (dono, etiquetas, funil, prompt, venda,
  entrega, recrutamento, abordagem), conferindo Gabriel/Mariana e a ausência de Leticya/4824.
- Eval de 45 perguntas: mesmo placar com a identidade da Isa; rodado também com a da Mariana,
  mais um caso "posso te ligar?" com o número do Gabriel.
- Produção: CRM e site 200 antes e depois de cada deploy; a Isa respondendo normalmente.

## Links relacionados

- [[2026-10-01-gabriel-mariana-botoes-design]]
- [[project_gabriel_mariana_crm]]
