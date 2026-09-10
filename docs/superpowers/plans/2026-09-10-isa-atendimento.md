# PLANO — Isa, robô de atendimento da 21Go (WhatsApp Cloud API)

> Escrito em 10/09/2026 a partir de tudo que foi decidido com o dono nesta data.
> **Cada tarefa termina com o site no ar.** Nada aqui derruba o 21go.site.
> Modelo de execução: uma tarefa por vez, teste antes do código, verificação de produção depois do deploy.

---

## 0. O que já está pronto (não refazer)

| Peça | Estado | Referência |
|---|---|---|
| WABA de vendas `932143313296745` · número `+55 21 98004-0964` · phone id `1457563414097446` | ativo, nome "21 Go - Vendas" em análise | app "21 GO" `960249879883255` |
| Token (system user, não expira) | em `21go-website/.env.local` (`WA_TOKEN`) e em `/opt/site21go/.env-site` | copiado do `.env` do CRM |
| Templates UTILITY `alerta_atendimento_isa` (`1127194003212390`) e `alerta_desconto_isa` (`1607814574334248`, botões *Autorizar desconto* / *Recusar*) | **PENDING** na Meta | destino: 21 96577-4240 |
| Webhook `https://21go.site/api/webhooks/whatsapp-bot` | no ar, commit `79c04e1`; grava em `conversations`/`messages` com `evolution_instance='cloud_isa'`; **não responde** | `src/app/api/webhooks/whatsapp-bot/route.ts`, `src/lib/whatsapp-cloud.ts`, `testes/whatsapp-cloud.test.ts` (19 casos) |
| `override_callback_uri` da WABA de vendas → o webhook acima | feito, `{"success":true}`; WABA do CRM intocada | — |
| Trava de teste | `ISA_MODO_TESTE=true`, `ISA_ALLOWLIST=5521992208062` em produção | só sai com `"false"` explícito |
| Robô antigo de recuperação | **apagado** (commit `fce37e5`, cron e script removidos) | não citar mais |
| OpenRouter | `OPENROUTER_API_KEY` já em produção; 46 modelos aceitam áudio | transcrição `google/gemini-2.5-flash-lite`, cérebro `google/gemini-2.5-flash` |

**Mecânica de deploy (não presumir):** `git push site master` → cron `/opt/blog-autodeploy.sh` (10 em 10 min, ou `sudo nohup bash /opt/blog-autodeploy.sh &` pra adiantar) → build → troca blue/green 3100/3101 sem queda. **Env nova entra em `/opt/site21go/.env-site` ANTES do push** (com backup `.env-site.bak-<data>`). Scripts em `/opt` que falam com a app descobrem a porta com `docker port site21go 3000`.

**Testes:** `node testes/<arquivo>.test.ts` (Node 24 roda TS direto; o projeto não tem framework). `npx tsc --noEmit` tem 2 erros pré-existentes (`vehicle/lead/route.ts`, `ScrollCinema.tsx`) — ignorar, `ignoreBuildErrors: true`.

---

## 1. Regras absolutas (valem em toda tarefa)

1. **Escopo: só `21go.site` e `21goconsultoraleticya.site`** (mesmo container, mesmo código). Nunca `.com.br`. **Nunca em página `/slug` de consultor** — Regra 0.1: lead do consultor é do consultor. Tudo da Isa checa `hostname` + ausência de consultor.
2. **Site em produção.** Toda tarefa: baseline (200 em `/`, `/cotacao`, `/manghi` nos dois domínios) → mudança → deploy → mesma checagem → e o webhook da Isa segue 403 no GET sem handshake.
3. **Trava de teste até o dono soltar.** Nenhum cliente recebe mensagem antes da Fase 7. Teste é sempre com o 21 99220-8062.
4. **NUNCA inventar valor.** Preço, FIPE, ativação, % só de consulta (Power / API Brasil pra FIPE / tabela local no Power mudo, marcada) ou do gabarito. Validador de números antes de qualquer envio. Exemplo em doc/commit com número fictício só com "(ilustrativo)" ao lado.
5. **Banco compartilhado com o CRM:** só `CREATE TABLE IF NOT EXISTS` / índice novo, SQL à mão via `DIRECT_URL`/`DATABASE_URL` do container `crm`. Nunca `drizzle-kit push`, nunca alterar coluna existente, nunca gravar mídia no banco.
6. **Nunca chamar `/api/vehicle/lead`** de dentro da Isa: ele dispara BYD pelo 4824. Reusar as libs por dentro.
7. **Regra 8 (código mínimo, cirúrgico):** não refatorar vizinho, não adicionar opção que ninguém pediu. Código morto encontrado: mencionar, não apagar.
8. **Commits em português** `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Push direto no master (convenção do projeto: "sempre publicar em produção"); a segurança é a trava, não branch.
9. **Hora:** `date` puro (máquina já em UTC−3). Banco grava UTC: ler com `created_at - interval '3 hours'`. Cumprimento da Isa calculado com `Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'})`, nunca pelo relógio do container nem pela IA.
10. **Memória/vault:** ao fim de cada fase, atualizar `MEMORIA-*`/SessionLog no vault (Regra 3) e as memórias do Claude (`project_isa_*`).

---

## 2. Gabarito que a Isa carrega (fonte: dono, 10/09/2026)

**Identidade.** Isa, "do time da Leticya" (só se perguntarem). Super educada. Cumprimento pela hora do Rio: bom dia 05:00–11:59 · boa tarde 12:00–17:59 · boa noite 18:00–04:59. Senhor/senhora **só quando o gênero aparecer na conversa** ("obrigada", "sou a dona"); até lá, pelo nome, frase sem gênero. Nunca ironia, nunca pressão, nunca "kkkk" com cliente travado, nunca caixa alta.

**Forma (do corpus da Leticya).** Minúsculas, sem ponto final, mensagens curtas em rajada (quebra em `\n\n`), uma pergunta por vez, emojis fixos (😃 cumprimento · 🙏🏼 agradecer · 👍 confirmar · 🥳 fechou). "vamos resolver", "pode deixar", "salva meu contato".

**Horário.** 8h–22h. Fora: silencia; às 8h responde a fila com "bom dia".

**Respostas prontas (literal, a IA não reescreve).**
- SUSEP: *sim, somos cadastrados na SUSEP.* Número: *"é cadastrada, mas eu não tenho acesso ao número, infelizmente".* Nunca inventar número.
- Cooperativa: *não somos cooperativa, somos proteção patrimonial veicular. A diferença: cooperativa antigamente não tinha direitos a cumprir nem órgão fiscalizador; a proteção é cadastrada na SUSEP, para a sua segurança, e tem regulamento a cumprir.*
- CNH vencida: *não tem problema, faz a proteção normalmente.*
- Desconto na mensalidade: *infelizmente não consigo, é tabelado 🙏🏼 o desconto que dá é o do adesivo e pagando 5 dias antes do vencimento* + os valores calculados do plano dele.
- VIP × Do Seu Jeito: texto do dono (ver `project_gabarito_produto_21go`).
- Prazos: cumpridos à risca — pode informar (roubo/furto na hora; reboque e assistência em 72h).
- Fora do Rio: atende, suporte pelo 0800, reboque terceirizado mais próximo, oficina de confiança com CNPJ mediante cota.

**Fatos calculados do veículo (nunca perguntar ao cliente).**
- Cota: carro 6% · elétrico/híbrido (BYD inclusive) 10% · moto 15%. Só reparo. Roubo/furto/PT sem cota.
- Indenização: 100% FIPE; leilão/táxi/ex-táxi/remarcado 80%.
- Rastreador obrigatório (RJ): carro > 50 mil · aplicativo > 35 mil · moto > 15 mil — **já embutido no plano, não comentar**. Fora disso opcional: R$ 100 instalação + R$ 19,90/mês.
- Adesivo: VIP ≤30k 10% / >30k 15% · Do Seu Jeito e Básico ≤60k 10% / >60k 15% · Premium ≤30k 10% / >60k 15% / **30–60k → 10%** (decisão de implementação, o menor).
- 5% pagando 5 dias antes.
- Reboque: 1 colisão + 1 pane + 3 SOS (raio 20 km) · carro amigo 25 km · região isolada: hospeda e pede no dia seguinte.
- Adicionais **só se o cliente pedir**: vidros R$ 29,90 · terceiros moto 10 mil R$ 22,90.
- Ativação: regra `max(plano, VIP) + 50`, piso 249, BYD 1.550 (`src/data/pricing.ts`, `pdf-quote.ts`). Vem na conversa/PDF; a Isa não recalcula.

**Preço.** Sempre o do plano que o cliente já tem (lead do site) ou o do Power na consulta. Power mudo → tabela local (`PRICING_TABLES`, `findPrice`) **só na Isa**, conversa marcada `preco_da_tabela`. Power negou → não fazemos. Barram antes de tudo: ano < 2006, Meriva, BYD de leilão (`elegibilidade.regras.ts`).

**Desconto de R$ 50 na ativação.** Autorização direta **só** em duas entradas: popup de saída e mensagem dos 5 min. Uma vez por telefone. Frase: *"você acaba de ganhar um desconto na sua ativação 🎉 em vez de pagar R$ X, você vai pagar R$ Y"*. Piso 249→199 e BYD 1.550→1.500 permitidos.

**Gatilhos de parada (Isa silencia sem avisar o cliente, alerta o dono no 21 96577-4240 por template UTILITY):**
1. Pedido de desconto no meio da conversa ou desconto a mais → `alerta_desconto_isa` (botões). Cliente ouve *"vou confirmar com meu supervisor e te retorno"*. Dono clica → janela 24h abre → Isa pergunta o valor → dono responde → Isa volta: *"consegui um desconto bem legal pra gente fechar hoje: de X por Y"*.
2. Cliente enviou documento → **transfere pro 4824 e pausa na hora**.
3. Alguém percebeu que é robô → pausa + `alerta_atendimento_isa`.
4. Xingamento/ameaça → pausa + `alerta_atendimento_isa`.
- Associado (boleto, sinistro, reboque, cancelamento) → transfere pro 4824 e pausa.
- Power sem preço e tabela também sem → transfere pro 4824.

**Transferência pro 4824.** *"vou te passar pra Leticya, que cuida disso pra você 🙏🏼"* + link `wa.me/5521969454824?text=<resumo>`. Quem escreve é o cliente (o 4824 nunca inicia). Contato marcado `transferido`, Isa OFF.

**Orçamento.** Placa é primordial: *"me manda a placa do veículo que eu consulto pra você"*. Zero km/sem placa → modelo, ano, nome; listar as versões do Power, nunca chutar versão. Cascata: Power `/plates/` → API Brasil (R$ 0,03, reserva) → preço do Power. **Toda placa sobe lead no Power da Leticya** (mesma função do site). Entrega em **2 mensagens**: (1) organizada com emoji, nome, veículo, ano, FIPE, ativação, "temos esses planos" com mensalidade de cada um que o Power devolveu; (2) *"aqui tá o PDF com todos os benefícios 👇"* + `https://21go.site/api/pdfs/<leadId>`.

---

## 3. Arquitetura (aprovada nos blocos 1 e 2)

```
Meta → POST /api/webhooks/whatsapp-bot (grava, 200 imediato)
        └─ agenda processamento (setImmediate) + fila no banco
Worker isa (a cada 60 s via /api/cron/isa, também disparado pelo webhook):
  ① dedup: só mensagem inserida pela 1ª vez (upsert devolve created)
  ② debounce 10 s: só processa se for a última inbound da conversa (timestamps no banco)
  ③ pode responder? trava/allowlist · 8h–22h (fila) · isa_contatos.ligada
  ④ áudio → download 2 passos Graph (validar media_id ^[A-Za-z0-9._-]+$) → flash-lite → texto
  ⑤ gatilhos (regex + classificação leve) ANTES da IA
  ⑥ fatos: cumprimento, lead/simulação, cota/rastreador/adesivo calculados, desconto já dado
  ⑦ consulta (placa → Power → API Brasil → preço) quando precisar; sobe lead no Power
  ⑧ IA (gemini-2.5-flash) com persona + gabarito + respostas prontas + fatos
  ⑨ validador: todo R$ e % da resposta ∈ fatos; falhou → reescreve 1x → falhou → não envia, pausa, alerta
  ⑩ envio humano: read+typing (renovar a cada 20 s) → preâmbulo se 2 primeiras respostas ou 2 últimas esperas > 5 s → partes por \n\n com pausa 50 wpm → antes de cada parte, checa inbound nova (aborta e refaz)
```

**Dados.** Reaproveita `conversations` + `messages` (`evolution_instance='cloud_isa'`, `sender` = `cliente|isa|juliano|leticya`) e `leads` (`origem='isa_whatsapp'`). Novas: `isa_contatos` (1 por telefone: `ligada`, `pausa_motivo`, `pausa_por`, `desconto50_em`, `desconto50_de`, `desconto50_para`, `transferido_em`, `entrada` popup|5min|direto, `genero`, `preco_da_tabela`, `janela_ate`, `ultimo_inbound_em`, `pendente_desde`) e `isa_eventos` (log: gatilho, alerta, desconto, transferência, validador reprovou, envio falhou). Áudio: só transcrição. Documentos: só link da Meta.

**Painel.** `21go.site/painel` = uma página `src/app/painel/page.tsx` (sem sub-rotas: `/painel/<x>` é do parceiro), APIs em `/api/atendimento/*`, cookie `isa_sessao`, usuários em env (`PAINEL_ISA_USUARIOS` = `juliano:<bcrypt>,leticya:<bcrypt>`).

**Referências dos repositórios (aplicar, não instalar):** Parlant → respostas prontas presas a dado, modo manual, preâmbulo, fórmula de digitação (50 wpm; ≤10 palavras +0,5 s senão palavras/50×2; +1 s ou +2 s pela próxima), split por `\n\n`. Hermes → `{"status":"read","message_id":wamid,"typing_indicator":{"type":"text"}}` (some em 25 s; erro 131009 = wamid > 30 dias), download de mídia em 2 passos com token nos dois GETs, dedup de wamid. devmoreir4/n8n → agrupar por timestamp no banco, nunca timer em memória.

---

## 4. Fases e tarefas

Cada tarefa: **Objetivo · Arquivos · Passos · Teste · Verificação em produção · Rollback.**
Protocolo fixo de deploy (chamado "PD" abaixo): baseline curl (5 URLs) → env no `.env-site` se houver → commit → push → deploy → curl 5 URLs + webhook 403 + `docker logs --tail 30 site21go` sem erro novo.

### FASE 0 — Pré-requisitos (nada de código)

**0.1 Templates aprovados.** Checar `GET /{waba}/message_templates`. Se `REJECTED`, ler `rejected_reason`, ajustar texto (nunca palavra de oferta) e reenviar. Bloqueia a Fase 4.
**0.2 API Brasil R$ 0,03.** Achar o endpoint exato (doc Postman "Placa FIPE - 92% Nacional" / painel Preços do dono). Testar 3–4 placas reais com `APIBRASIL_TOKEN`: tempo de resposta (assíncrono?), FIPE bate com o Power? Registrar. Se assíncrono > 10 s, fica só como reserva silenciosa.
**0.3 Consentimento no formulário.** Linha abaixo de "Ver Simulação": *"Você recebe o resultado da simulação no seu WhatsApp."* — muda `src/app/cotacao/page.tsx` (texto, sem lógica). PD.
**0.4 Ativação na conversa.** Confirmar com o dono que o disparo do site passa a incluir a ativação na mensagem inicial (ele assumiu). Se não, a Isa lê de `cotacao_planos`/`pdf`.
**0.5 Vault.** SessionLog do dia + `MEMORIA-21go-site.md` com o estado.

### FASE 1 — Fundação (a Isa ainda não fala)

**1.1 Migração `285_isa.sql`.** `CREATE TABLE IF NOT EXISTS isa_contatos (...)`, `isa_eventos (...)`, índices em `telefone`, `pendente_desde`. Rodar via psql no Lightsail com a URL do container `crm` (sem `?pgbouncer`). Teste: `\d isa_contatos` + `SELECT 1`. Rollback: `DROP TABLE` das duas (nada mais foi tocado).
**1.2 `src/lib/isa/store.ts`.** `contato(telefone)`, `ligar/desligar(telefone, motivo, por)`, `registrarEvento`, `marcarDesconto50`, `ultimaInbound(conversationId)`, `pendentes()`. Teste unitário com mock de supabase.
**1.3 `src/lib/isa/envio.ts` (Cloud API).** `marcarLidaEDigitando(wamid)`, `enviarTexto(to, texto)`, `enviarTemplate(to, nome, variaveis, botoes?)`, `baixarMidia(mediaId)` (regex + 2 GETs), `dividirEmPartes(texto)` e `pausaEntre(parteEnviada, proxima)` (fórmula Parlant). **Tudo passa por `podeResponder()` — sem exceção.** Teste: fórmula de pausa, divisão, regex de media_id, allowlist bloqueando.
**1.4 `src/lib/isa/hora.ts`.** `cumprimento(agora)`, `dentroDoHorario(agora)`, `proximaAbertura(agora)` com `timeZone:'America/Sao_Paulo'`. Teste com datas fixas em UTC cobrindo as 3 faixas e a virada 22h/8h.
**1.5 Worker + fila.** `src/lib/isa/worker.ts` (`processarPendentes()`), `src/app/api/cron/isa/route.ts` (header `x-cron-secret`), webhook passa a chamar o worker por `setImmediate` só quando `upsertMessage` devolver `created`. Script `/opt/isa-cron.sh` (porta dinâmica) + crontab `* * * * *`. Nesta fase o worker só **ecoa** pro allowlist: *"recebi: <texto>"* — prova debounce, dedup, horário, digitando e partes. Teste com o dono mandando 3 mensagens seguidas: 1 resposta só. PD.
**1.6 Transcrição.** `src/lib/isa/transcrever.ts` via OpenRouter `google/gemini-2.5-flash-lite` (áudio base64, prompt "transcreva em pt-BR, só o texto"). Grava `content` = transcrição, `message_type='audio'`. Teste: dono manda áudio → eco da transcrição. PD.

### FASE 2 — Cérebro

**2.1 `src/lib/isa/fatos.ts`.** A partir do lead/veículo: tipo (carro/moto/elétrico-híbrido por marca+modelo, lista de marcas elétricas + regex `EV|ELÉTRICO|E-TECH|HÍBRIDO|HYBRID|PHEV`), cota, indenização (80% se leilão/táxi/remarcado), rastreador embutido?, adesivo por plano×FIPE, 5 dias, mensalidade e ativação de `cotacao_planos`, valores com adesivo/5 dias calculados. Saída: objeto + **lista de números permitidos** (R$ e %). Teste: moto→15, BYD King→10, Compass→6; Premium 45k→10%; ativação BYD.
**2.2 `src/lib/isa/respostas-prontas.ts`.** As literais do gabarito, com campos `{{...}}` só de fatos (estilo Parlant: resposta com campo ausente nunca é escolhida). Teste: renderização e recusa sem campo.
**2.3 `src/lib/isa/persona.md`** + `src/lib/isa/prompt.ts`. Persona (forma da Leticya sem os 8 erros), gabarito, regras de gênero, "não ofereça adicional", "uma pergunta por vez", "responda em partes curtas separadas por linha em branco", "não invente números: use só a lista". Contexto = últimas 30 mensagens + fatos + estado do contato.
**2.4 `src/lib/isa/validador.ts`.** Extrai `R\$\s?[\d.]+,\d{2}|\d+(,\d+)?\s?%` e compara com permitidos; devolve `ok|reprovado(numeros)`. Teste: número estranho reprova; permitido passa; "15%" do adesivo e "5%" passam.
**2.5 `src/lib/isa/cerebro.ts`.** Monta prompt → OpenRouter `google/gemini-2.5-flash` → validador → 1 reescrita com a lista de reprovados → falhou: evento `validador_reprovou`, pausa, `alerta_atendimento_isa`. Retorna partes. Worker troca o eco por isto. Teste: prompt fixo com mock de IA. PD. **Teste com o dono:** dúvidas de cota, SUSEP, cooperativa, CNH, mensalidade, VIP×DSJ, adicionais só se pedir.

### FASE 3 — Orçamento pela placa

**3.1 Extrair `createLeadPowerCRM` de `vehicle/lead/route.ts` para `src/lib/power-lead.ts`** sem mudar comportamento do site (o route.ts passa a importar). Teste: `tsc` + PD + cotação no site continua subindo lead no Power (conferir 1 lead no Power).
**3.2 `src/lib/isa/orcamento.ts`.** Detecta placa (regex Mercosul/antiga) → `plate-lookup` (Power) → sem veículo: API Brasil (0.2) → elegibilidade (`decidirElegibilidade`) → planos/preço `planosDoPowerAoVivo` → Power mudo: `findPrice`/`PRICING_TABLES` + marca `preco_da_tabela` → `upsertLead` (origem `isa_whatsapp`, sem disparo) → `createLeadPowerCRM` → link `/api/pdfs/<leadId>`. Sem placa: pede modelo/ano/nome → `powercrm-lookup` lista versões → cliente escolhe (número). Teste unitário com mocks; teste real com a placa do dono.
**3.3 Entrega em 2 mensagens** (formato do §2). Teste com o dono. PD.

### FASE 4 — Gatilhos, desconto, transferência, alertas

**4.1 `src/lib/isa/gatilhos.ts`.** Regras: documento (`message_type in document,image` com CNH/CRLV/comprovante no nome ou legenda, ou imagem após pedido de docs) · associado (boleto, sinistro, reboque, cancelar, app, rastreador instalado) · "é robô/bot/IA?" · xingamento (lista + classificação da IA como reserva) · pedido de desconto (regex + IA) distinguindo entrada popup/5min (R$ 50 automático se ainda não deu) de "mais desconto"/"desconto no meio". Teste: cada frase do corpus.
**4.2 Alertas.** `alerta_atendimento_isa` (motivo, nome, telefone, detalhe) e `alerta_desconto_isa` (nome, telefone, veículo, plano+ativação). Estado `aguardando_dono` no contato; a resposta do dono no 4240 (botão ou texto) é uma inbound com `from=5521965774240` → worker roteia pro protocolo: *Autorizar* → Isa pergunta valor → dono manda número → Isa valida contra ativação atual (≤ atual, ≥ 0) → volta ao cliente com a moldura. *Recusar* → Isa ao cliente: *"conversei com meu supervisor e infelizmente não consegui um desconto a mais, mas a ativação continua R$ X 🙏🏼"* (texto a aprovar pelo dono). Teste com o dono nos dois botões.
**4.3 Transferência.** `transferir(telefone, motivo)`: mensagem + `wa.me/5521969454824?text=` com resumo (nome, veículo, plano, ativação, motivo), `transferido_em`, Isa OFF, evento. Teste com o dono.
**4.4 R$ 50.** `aplicarDesconto50(contato, ativacao)`: uma vez por telefone; frase antes/depois; grava de/para. Teste: 2ª vez não dá.
**4.5 Fila das 8h e "cliente sumiu".** 8h: worker responde pendentes com cumprimento. Sumiu < 24 h: retomada única após ≥ 3 h (*"oi, {nome}! conseguiu ver a simulação? 🙏🏼"*), nunca mais que 1 por dia. > 24 h: **exige template** — criar `retomada_simulacao_isa` (UTILITY, sem oferta) só depois de o dono aprovar o texto. PD.

### FASE 5 — Painel `21go.site/painel`

**5.1 Login.** `POST /api/atendimento/entrar` (usuário+senha vs `PAINEL_ISA_USUARIOS` bcrypt) → cookie `isa_sessao` httpOnly, 12 h; `sair`; middleware das APIs `/api/atendimento/*` exige cookie. Rate limit 5 tentativas/15 min por IP. Teste: senha errada 401, certa 200. `/painel` sem cookie mostra só o login.
**5.2 Página.** `src/app/painel/page.tsx` (client, sem sub-rotas). Layout: sidebar (busca; abas Todos · Precisa de você · Isa · Off · Transferidos; lista com nome, prévia, hora, ícone de estado), conversa (balões com autor `cliente/Isa/Juliano/Leticya`, áudio com transcrição, documento com link, eventos da Isa em cinza), cabeçalho (nome, telefone, veículo, plano, ativação e desconto dado, link PDF, **chave Isa ON/OFF**, botão Transferir pro 4824, contador da janela de 24 h), caixa de resposta. Paleta da marca (`#293C82`, `#F2911D`, `#C7D301`). Mobile OK (a Leticya usa celular).
**5.3 APIs.** `GET /api/atendimento/contatos?aba=`, `GET /api/atendimento/conversa/:telefone` (mensagens + eventos + contato), `POST /api/atendimento/responder` (grava `sender=<usuario>`, envia pela Cloud API **respeitando janela**: fora da janela devolve erro claro "janela fechada, use template"), `POST /api/atendimento/isa` (`ligada` true/false + motivo; ao religar, evento e a Isa lê tudo), `POST /api/atendimento/transferir`. Atualização por polling 5 s.
**5.4 Alerta com link.** Os templates passam a incluir no "Detalhe"/rodapé `21go.site/painel?c=<telefone>`. Teste: clicar abre a conversa certa.
**5.5** PD + teste do dono e da Leticya no celular. Verificar que `/painel/<slug>` do parceiro continua funcionando (`parceiroanderson.21go.com.br` → 200).

### FASE 6 — Entradas de cliente (ainda atrás da trava)

**6.1 Mensagem pronta pro popup.** `src/lib/isa/mensagem-popup.ts`: `Quero meu desconto! 🙂` + nome, veículo, FIPE, plano, ativação, link PDF → `wa.me/5521980040964?text=`. Teste unitário (encoding).
**6.2 Popup em `cotacao/page.tsx`.** Só na tela de planos, só se `!consultorSlug && hostname ∈ {21go.site, 21goconsultoraleticya.site}` (lido em efeito, nunca `usePathname`), só se não clicou "Quero contratar" (o mesmo sinal do `sendBeacon`), uma vez por lead (localStorage + flag no lead). Desktop: `mouseleave` pelo topo. Mobile: 45 s parado (sem scroll/toque). Texto sem valor: *"Espera, {nome}! 👋 Fale com um dos nossos consultores e ganhe um desconto na sua ativação."* Botão → wa.me da Isa; grava `entrada='popup'` via beacon. Atrás de `NEXT_PUBLIC_ISA_POPUP=on` (default off). PD com flag off; teste com puppeteer (`testes/`) simulando as duas condições; ligar flag só na Fase 7.
**6.3 Mensagem dos 5 min.** Worker: leads dos .site (origem site, `consultor_slug` nulo, `whatsapp_clicado=false`, `entrada` nula, criado há ≥ 5 min, ≤ 24 h, telefone válido, sem desconto e sem mensagem prévia), 8h–22h, uma por lead. Template novo `simulacao_pronta_isa` (UTILITY, botões *Ver o que meu plano cobre* / *Tenho uma dúvida*, **sem palavra de oferta**, com link do PDF) — criar e esperar aprovação. Ao toque: Isa responde coberturas do plano + R$ 50 (frase antes/depois). Grava `entrada='5min'`. Atrás de `ISA_5MIN=on` (default off). Teste: lead do dono. PD.
**6.4 Qualidade do número.** No cron diário: `GET /{phone}?fields=quality_rating,messaging_limit_tier`; `YELLOW`/`RED` → desliga `ISA_5MIN` (flag no banco) e `alerta_atendimento_isa` pro dono. Evento.

### FASE 7 — Liberação (só com OK explícito do dono, em etapas)

**7.1** Dono valida no painel e no WhatsApp: 10 conversas simuladas cobrindo cotação por placa, sem placa, cota, desconto (popup/5min/meio), documento, associado, robô, xingamento, áudio, fora do horário.
**7.2** `ISA_MODO_TESTE=false` no `.env-site` → redeploy → primeiro dia com o dono acompanhando o painel. Popup e 5 min **ainda off**.
**7.3** `NEXT_PUBLIC_ISA_POPUP=on` → 2 dias de observação (bloqueios, qualidade).
**7.4** `ISA_5MIN=on` → observação diária da qualidade por 1 semana.
**7.5** Rollback de qualquer etapa = voltar a flag + redeploy (≤ 10 min, sem queda).

---

## 5. Pendências que dependem do dono (não travam a Fase 1)

- Aprovação dos templates (Meta).
- Endpoint/tempo da API Brasil R$ 0,03 (0.2).
- Texto da mensagem quando o dono **recusa** desconto (4.2) e da retomada > 24 h (4.5).
- Senha inicial dele e da Leticya pro painel (5.1) — geradas e entregues só no WhatsApp do dono.
- Confirmação de que a ativação passa a vir na mensagem inicial do site (0.4).

## 6. O que a Isa NUNCA faz (checklist de revisão de cada tarefa)

- falar número que não está na lista de fatos · oferecer adicional sem pedido · perguntar tipo de veículo/cota · dar desconto na mensalidade · dar R$ 50 fora das 2 entradas ou 2ª vez · responder fora da allowlist em modo teste · responder 22h–8h · falar com lead de consultor · aparecer no `.com.br` · mandar mensagem pelo 4824 · chamar `/api/vehicle/lead` · ironizar/pressionar · inventar número de SUSEP · reescrever resposta pronta · gravar áudio/mídia no banco · derrubar o site.
