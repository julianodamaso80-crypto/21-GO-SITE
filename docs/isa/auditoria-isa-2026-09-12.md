# Auditoria da Isa — 12/09/2026

**O que foi lido, integralmente, antes de avaliar:** as 71 respostas do dono (`docs/isa/`), as 5 pendências respondidas hoje, as 14 memórias do projeto (regras ditadas em 10, 11 e 12/09), os 4 SessionLogs da Isa, o plano de 7 fases, os 29 arquivos de `src/lib/isa/` (4.372 linhas), o webhook, o cron, as rotas do painel, `PLAN_INFO` e a `COVERAGE_TABLE` do PDF, o env e o cron de produção no Lightsail, **as 236 mensagens reais dos testes de 11 e 12/09** (banco `messages`, `cloud_isa`) e os 92 eventos de `isa_eventos`. Onde afirmo que algo falha, há um horário de conversa ou um teste rodado que prova.

**Estado de produção neste momento:** `ISA_MODO_TESTE=true`, allowlist só o 8062, alertas no 4240, `ISA_5MIN=on` (travado pela allowlist — só o dono receberia), cron de 1 em 1 min, 199 testes passando, commit `67869f4` no ar.

---

## 1. Nota por etapa

| # | Etapa | Nota | Por quê |
|---|---|---|---|
| 1 | Entrada (webhook, assinatura, dedup, fila no banco, 10 s de silêncio, lock, cron de rede) | **9,0** | Sólido. Estado no banco, dois workers nunca respondem juntos, deploy no meio não perde mensagem. O bug de µs × ms foi achado e fechado. |
| 2 | Áudio e leitura de foto/PDF | **8,0** | Gemini 3.1 Pro transcreveu o áudio de hoje perfeitamente, com as hesitações. `[INAUDIVEL]` em vez de chute. Leitura de print achou a placa do Ka e cotou sozinha. Falta: áudio maior que 25 s cai pro Flash, que já inventou palavra antes. |
| 3 | Cérebro (prompt, persona, saída em JSON, reescritas) | **6,5** | Regras boas, mas ela ainda resume onde não pode (item 2.4), enche de "entendi"/"que legal", e as travas dependem de reescrita por IA. Nenhum teste automatizado passa pelo modelo de verdade. |
| 4 | Gabarito (domínio do produto) | **7,5** | Depois de hoje está muito mais completo. Mas tem 3 incoerências entre gabarito, `PLAN_INFO` e o PDF (item 2.6), e ~12 perguntas frequentes sem resposta (item 3.4). |
| 5 | Validador de números | **6,0** | A ideia é excelente e já salvou o 0800 inventado. Mas **hoje ele barra três coisas que estão no gabarito** (item 2.1) — a Isa "sabe" e não consegue dizer. |
| 6 | Cotação (placa, sem placa, versões, leilão/app) | **8,5** | Placa é do código, nunca da IA; leilão e app perguntados antes do valor; versões filtradas pelo que o cliente disse. Preço sempre do Power. Faltou só: recotar por leilão sem explicar que a indenização cai pra 80%. |
| 7 | Entrega da simulação | **8,0** | Formato do dono, PDF certo, ativação certa (277,41 = VIP 227,41 + 50 ✓; Premium 342,53 ✓). |
| 8 | **Fluxo de venda** (qualificar, contornar objeção, fechar) | **5,0** | Aqui está o maior gap pra "fazer vendas". O prompt sabe pedir documento quando ele escolhe; não sabe **vender** entre a simulação e a escolha (item 2.5). |
| 9 | Gatilhos e alertas | **6,0** | Desconto tem ida e volta e funciona. **"Vou confirmar e já te retorno" não tem volta** (item 2.2): o cliente fica esperando alguém que não existe. |
| 10 | Retomada (cliente sumiu) | **6,0** | Manda, mas manda igual pra todo mundo, repete a pergunta pra quem já respondeu e sai com o nome duas vezes (item 2.3). |
| 11 | Tom humano ("sem parecer IA") | **7,0** | Minúsculas, rajada curta, cita a pergunta certa quando são várias, cumprimento pela hora do Rio — bom. Derruba: fillers de bot, "posso te ajudar com mais alguma dúvida?", "hoje você possui" (Leticya diria "tem"). |
| 12 | Painel / CRM / funil / etiquetas | **8,0** | Funciona e a Leticya já usa (eventos de etapa e nota em 12/09). Não auditei a fundo o `PainelIsa.tsx` (1.005 linhas) — nota é do que vi funcionando, não de revisão de código. |
| 13 | Testes e observabilidade | **7,5** | 199 testes de lógica pura, `isa_eventos` conta tudo. Falta o que importa mais: um teste que passe pelo modelo com as perguntas reais e diga a nota (item 3.1). |
| 14 | Segurança e travas | **9,0** | HMAC, modo teste que emudece em vez de soltar, nunca chama `/api/vehicle/lead`, nunca em site de consultor, mídia validada, prompt injection tratada, nenhuma coluna vinda de fora no SQL. |

**Média ponderada honesta: 7,2.** A infraestrutura é de 9; o que fala com o cliente é de 6,5. É o inverso do que o cliente vê.

---

## 2. As falhas, uma a uma (com prova)

### 2.1 O validador barra o que está no gabarito — 3 casos provados hoje

Rodei `validarNumeros` com as listas de permitidos de produção (sem placa e com a moto CG dos testes):

| Frase que o gabarito manda ela dizer | Resultado |
|---|---|
| "o plano cobre **70%** do para-brisa" | ❌ `70%` reprovado (sem placa E com placa) |
| "danos a terceiros pra moto, **R$ 10 mil**, R$ 22,90/mês" | ❌ `R$ 10.000,00` reprovado (sem placa E com placa) |
| "mais R$ 50 mil de terceiros por **R$ 49,90**/mês" | ❌ reprovado sem placa (com placa passa — eu liberei só em `ADICIONAIS` hoje) |

O que acontece: a resposta inteira é engolida, a IA reescreve uma vez e, na segunda, a Isa **pausa e chama o dono**. Ou seja: cliente pergunta "cobre para-brisa?" → silêncio + alerta. **Culpa minha no 49,90; os outros dois estavam desde o gabarito de ontem.** Correção: 3 números em 2 listas (`PERMITIDOS_SEM_FATOS` no `cerebro.ts` e o set `pct`/`dinheiro` em `fatos.regras.ts`) + um teste que passe **cada linha do gabarito** pelo validador. Esse teste é o que impede a próxima.

### 2.2 "Essa eu vou confirmar e já te retorno" — ninguém retorna

Código: `worker.ts:428` só manda o alerta. A Isa **não pausa**, o contato **não entra na aba "Precisa de você"** (o filtro é "pausada pela Isa OU aguardando desconto" — `painel-dados.ts`), e não existe caminho pro dono responder e a Isa levar ao cliente, como existe no desconto.

Prova: em 11/09 saíram **9** "vou confirmar" (18:37, 19:14 ×3, 19:33, 19:40, 19:44, 19:53, 19:54) e **nenhum** foi respondido ao cliente por ninguém. Hoje, 15:52, mais um. Com cliente de verdade é lead perdido com promessa quebrada — pior que dizer "não sei".

Correção: o mesmo protocolo do desconto — alerta com a pergunta, o dono responde em texto, a Isa entrega ao cliente ("consegui a resposta: ...") **e a resposta vira candidata a entrar no gabarito**. Enquanto não houver resposta, o contato aparece em "Precisa de você".

### 2.3 Retomada: repete a pergunta, dobra o nome, ignora o contexto

- **12/09 13:43** pro 4240: `boa tarde, Leticya 😃` + `Leticya, hoje você possui alguma proteção pro seu veículo?` — nome duas vezes. Causa: `retomarSumidos` monta `${abertura-com-nome}\n\n${nome}, hoje...`.
- A mesma pessoa tinha respondido **"não"** a essa pergunta em 11/09 13:45. No dia seguinte a Isa perguntou de novo, igual. Isso é o que faz parecer robô.
- **11/09 20:28** pro 8062: o cliente tinha encerrado com "ok obrigado" às 19:27 e recebeu "hoje você possui alguma proteção?" uma hora depois — depois de já ter dito às 21:13 que sim.

Correção: retomada escolhida pelo estado: escolheu plano → "conseguiu separar os documentos?"; só simulou → a pergunta atual; já respondeu se tem proteção → não perguntar de novo; última mensagem dele foi despedida → não retomar em 1 h, só no dia seguinte. E "tem" no lugar de "possui".

### 2.4 Resumiu benefícios onde não podia

**11/09 18:08** — "quais benefícios dele?" (Veículos Especiais): ela listou **5 de 17** ("roubo e furto, incêndio, fenômenos, colisão, terceiros 50 mil") e parou. Às 12:16, pro VIP, tinha listado tudo. O prompt já diz "liste TODOS"; a IA obedece às vezes. Um cliente que ouve "5 coisas" acha o plano magro.

Correção: quando a pergunta é "benefícios/o que cobre", **a lista sai pelo código** (como já sai a simulação e a `mensagemCobertura` do botão dos 5 min), não pela IA. A IA só escreve a frase de abertura.

### 2.5 Ela não vende — responde

Prova mais clara, **11/09 21:13**: "tem proteção?" → "Sim" → "quanto paga?" → **"650"** → "entendi / dos planos que te mandei, qual gostou mais?". O plano dela era R$ 606,75. Uma vendedora diria: "então você já paga R$ 43 a menos por mês e ainda ganha reboque de 1.000 km e carro reserva — quer que eu siga com a sua ativação?". O número do cliente foi coletado e jogado fora.

Outras marcas de "responde, não vende" nos testes:
- termina resposta sem próximo passo ("posso te ajudar com mais alguma dúvida?" às 12:39);
- nunca pergunta o que mais importa pra ele (roubo? batida? terceiros?) pra recomendar UM plano em vez de "qual gostou mais";
- não tem objeção mapeada: "tá caro", "vou pensar", "seguro é melhor", "vou ver com minha esposa", "por que não é seguradora" — nenhuma tem tratamento;
- não fecha depois de tirar a dúvida: cliente que perguntou 4 coisas e ficou satisfeito não ouve "posso seguir com a sua ativação?".

Correção: um bloco "como vender" no prompt, com **fatos do gabarito como argumento** (nunca desconto, nunca pressão — regras do dono), 5 objeções com resposta modelo aprovadas por você, e a regra "toda resposta termina com um próximo passo".

### 2.6 Três incoerências entre o que a Isa fala e o que o site/PDF mostram

1. **Auxílio funeral**: está na resposta pronta VIP × Do Seu Jeito ("e ainda tem um auxílio funeral") e **em nenhum outro lugar** — nem `PLAN_INFO`, nem PDF, nem gabarito. Se o cliente perguntar "quanto é o auxílio funeral?", ela não sabe. Pergunta pra você: existe? De quanto? Em quais planos?
2. **Premium: reboque 1.200 km ou 1.400?** Você disse 1.400 (700 + 700). `PLAN_INFO` diz "Reboque 1.200km" + "Reboque Adicional 200km"; o PDF, "1.200 km (totais)". A Isa lê os dois textos e pode dizer 1.200 numa hora e 1.400 na outra.
3. **Monitoramento 24h no Básico** aparece como incluído sem condição em `PLAN_INFO`; a regra é "obrigatório só acima de R$ 50 mil, senão opcional R$ 100 + R$ 19,90". Cliente de Básico com carro de 30 mil ouve "cobre monitoramento 24h" e entende rastreador de graça.

Nenhuma dessas a Isa resolve sozinha — são decisões suas sobre o site/PDF.

### 2.7 Coisas menores que ainda soam robô

- Fillers: "entendi", "entendi, Leticya", "que legal", "ótima escolha", "claro", "posso te ajudar com mais alguma dúvida?", "super prático 👍".
- "hoje você **possui** alguma proteção" — a Leticya escreve "tem".
- Comemora duas vezes quando escolhe plano (a IA comemora, e o código manda "que ótimo! 🥳" em seguida).
- Fora do horário (22h–8h) o cliente escreve e recebe **nada** até as 8h. É decisão sua, mas 9 h de silêncio sem "te respondo às 8h" faz muita gente ir no concorrente. Uma mensagem automática por noite, só uma, resolve.

### 2.8 O que já quebrou nos testes e JÁ FOI CONSERTADO (pra você saber o que não precisa testar de novo)

Placa inventada (HB20), "Onix/Kwid" no áudio, 0800 inventado, "documento não pode estar atrasado", "1.000 km não é ida e volta", "carro remarcado não aceitamos", "não tem carência" sem falar das 72 h, `fora_do_assunto`/`pronta` vazando como texto, "Juliano" em toda frase, resposta repetida 3× sobre cota, "oie" virando "vou confirmar", "Compass + VIP = ótima escolha", "pontos de instalação" do rastreador inventados, lavagem/pastor recusado como fora do assunto, oficina própria e lavagem "vou confirmar", carro amigo descrito como retorno a domicílio.

---

## 3. O que eu faria pra terminar 10/10 — em ordem

### P0 — hoje, antes de qualquer teste seu (1 a 2 h)

1. **Validador**: liberar 70 %, R$ 10 mil e R$ 49,90 nas duas listas + **teste que passa toda linha do `GABARITO_21GO` pelo validador** (qualquer número novo no gabarito quebra o teste até ser liberado). Item 2.1.
2. **Retomada**: tirar o nome dobrado; não repetir pergunta já respondida; texto com "tem". Item 2.3.
3. **Benefícios pelo código**: pergunta de cobertura → lista completa montada pelo código. Item 2.4.

### P1 — antes de `ISA_MODO_TESTE=false` (1 dia)

4. **Volta do "vou confirmar"**: protocolo igual ao do desconto (alerta → você responde → a Isa entrega) + contato na aba "Precisa de você" enquanto isso. Item 2.2.
5. **Bloco de venda no prompt**: usar o "quanto paga hoje", recomendar um plano pela dor dele, 5 objeções aprovadas por você, próximo passo em toda resposta. Item 2.5. **Preciso de você:** as 5 respostas de objeção no seu tom (eu escrevo o rascunho, você corrige, como fez com as 71).
6. **Lista de frases proibidas** no prompt + trava no código pra "posso te ajudar com mais alguma dúvida?" e afins. Item 2.7.
7. **As 3 incoerências** do item 2.6 decididas por você (funeral, 1.400 km, monitoramento no Básico) e aplicadas no site, no PDF e no gabarito de uma vez.
8. **Segunda rodada de perguntas** (mesmo método das 71, mesmo formato Word): o que não está no gabarito e o cliente pergunta — diferença entre seguro e proteção; indenização é a FIPE do dia do sinistro ou da contratação; cobre roubo de peças/som/estepe; cobre passageiros (APP); carro roubado e recuperado com dano; viagem pro Mercosul; prazo de aprovação da vistoria; reajuste anual; cobre pedra no vidro; como aciona o reboque na prática (0800 → o que dizer); o que é o carro amigo; quanto é o auxílio funeral.
9. **Eval automático**: 40 perguntas reais (das 2.012 conversas) com a resposta esperada; um script roda as 40 pelo modelo e dá nota. Roda antes de cada liberação. É isso que transforma "acho que está bom" em "está 38/40".

### P2 — primeira semana em produção

10. **Modelo do cérebro**: testar o Gemini 3.1 Pro (raciocínio baixo, o mesmo do áudio) no eval do item 9 contra o 2.5 Flash. Se subir a nota e custar centavos por conversa, troca. Você já mandou "use uma llm melhor" pro áudio; a conversa é onde erro custa mais.
11. **Relatório diário no seu WhatsApp**: quantas conversas, quantas simulações, quantos escolheram plano, quantos mandaram documento, e **a lista do que ela não soube responder** — o gabarito cresce do dado real, toda semana.
12. **Mensagem de fora do horário** (uma por noite), se você aprovar o texto.
13. **Recotação por leilão** avisando a depreciação: quando o cliente diz "é de leilão", a nova simulação diz "por ser de leilão a indenização é 80% da FIPE".
14. Áudio longo (> 25 s): dar mais tempo ao Pro antes de cair pro Flash.

---

## 4. O que NÃO mudei nesta auditoria

Nada de código. Só leitura, consultas ao banco e um teste no scratchpad pra provar o item 2.1. Os itens P0 são pequenos e eu faço hoje com o seu "vai".
