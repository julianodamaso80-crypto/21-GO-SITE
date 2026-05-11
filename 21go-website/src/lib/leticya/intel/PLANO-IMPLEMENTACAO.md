---
data: 2026-05-11
projeto: 21Go
tags: [21go, leticya, agente-ia, plano, implementacao]
tipo: aprendizado
status: aguardando_aprovacao_do_dono
---

# Plano de Implementação — Agente Leticya humanizado em produção

> Estado atual: persona v2 no banco, 16 tools, infra A/B, embeddings prontos, shadow mode rodando (responde JSON, não envia WhatsApp).
> Meta: agente respondendo cliente real no WhatsApp da 21Go, comportamento humano, sem fazer merda.
>
> **Princípio de ouro**: nenhuma fase libera sozinha — cada uma tem "critério de saída" que precisa ser cumprido antes de avançar.

---

## VISÃO GERAL — 8 FASES

```
┌──────────────────────────────────────────────────────────────┐
│ FASE 0  → Aprovação do prompt v3 + 2 dados faltantes    [1d] │
│ FASE 1  → Tool notifyHumanToTakeOver + sistema takeover [1d] │
│ FASE 2  → Sanitizações de segurança                     [1d] │
│ FASE 3  → Integração Evolution API + Worker de envio    [3d] │
│ FASE 4  → Modo "draft only" (você aprova antes enviar)  [1d] │
│ FASE 5  → Soft launch interno (você testa como cliente) [3d] │
│ FASE 6  → Piloto 10% de leads novos                     [7d] │
│ FASE 7  → Expansão gradual (25/50/80/100%)              [5d] │
│ FASE 8  → Otimização contínua (não tem fim)             [∞]  │
└──────────────────────────────────────────────────────────────┘

ETA total até produção 100%: ~22 dias úteis (~1 mês)
```

---

## FASE 0 — APROVAÇÃO E DADOS FALTANTES

**Objetivo:** destravar o que precisa de input humano antes de qualquer código.

**Quem faz:** você (Juliano).

**Tarefas:**

1. **Aprovar prompt v3** (já criado em [PERSONA-PROMPT-V3.md](21go-website/src/lib/leticya/intel/PERSONA-PROMPT-V3.md))
   - Lê os 4 exemplos (A/B/G/F)
   - Confirma comportamento

2. **Me passar 2 dados:**
   - **Número WhatsApp pra escalation interno** (pra onde a IA grita "cliente quer fechar" / "cliente recusou mínimo")
   - **0800 correto da assistência** (você falou `0800 235-555`, no histórico tem `0800 234-5555` e `0800 941-8589`)

3. **Decidir flag de ambiente**
   - Conta WhatsApp Business: produção ou número de teste?
   - Evolution API instance: qual usar? (no schema do banco aparece `evolution_instance`)

**Critério de saída:**
- ✅ Prompt v3 aprovado por escrito ("pode aplicar")
- ✅ Número interno e 0800 documentados
- ✅ Decisão de qual instância Evolution usar

**Bloqueia avanço pra Fase 1:** sim. Sem isso a tool de takeover não tem destino.

---

## FASE 1 — TOOL `notifyHumanToTakeOver` + SISTEMA DE TAKEOVER

**Objetivo:** quando IA precisa passar o cliente pro humano, ela manda WhatsApp pro número interno e **trava** aquela conversa pra não responder mais.

**Quem faz:** eu (Claude). Você só revisa.

**Tarefas:**

1. **Criar migration `230_takeovers_table.sql`** com tabela:
   ```sql
   ai.takeovers (
     contact_id, conversation_id, reason, triggered_at,
     resolved_at, resolved_by_id, ai_can_resume_at
   )
   ```
   - Quando insere: IA fica trancada pra esse contato
   - Quando resolve: IA pode voltar a responder (cliente que voltou depois)

2. **Implementar tool `notifyHumanToTakeOver`** em `tools-v2.ts`:
   - Input: `contact_id`, `reason`, `summary` (resumo da conversa)
   - Insere em `ai.takeovers`
   - Envia mensagem via Evolution pro número interno **com resumo formatado**:
     ```
     🚨 LEAD QUER FECHAR — IA passou
     Nome: Cicero Virginio
     Veículo: HONDA CG 160 FAN — placa RKO7E86
     FIPE: R$ 17.500 (PDF do site)
     Plano: VIP Moto 400
     Mensalidade: R$ 186,84 (PDF)
     Ativação ofertada: R$ 236
     Conversa: [link pro CRM]
     ```

3. **Guard no route** (`/api/agent/leticya`):
   - **Antes** de cada chamada do LLM, verifica `ai.takeovers` por `contact_id`
   - Se ativo → retorna `{ silenced: true, reason: 'humano_assumiu' }` e NÃO responde

4. **Endpoint pra liberar a IA de volta:**
   - `POST /api/leticya/release-takeover` — humano marca conversa como "pode voltar a IA"
   - Útil pra cliente que sumiu por 7 dias e quer reativar

**Critério de saída:**
- ✅ Tool testada (smoke test SQL)
- ✅ IA não responde quando takeover ativo (teste unitário)
- ✅ Mensagem chega no número interno (teste com Evolution sandbox)
- ✅ Humano consegue "liberar" um contato pra IA voltar

**Riscos:**
- Race condition: IA pode mandar bolha 1 e takeover entrar antes da bolha 2 → solução: worker verifica takeover antes de **cada** bolha (Fase 3)
- Número interno errado → mensagens críticas perdidas → solução: logar tudo + alerta se Evolution responder erro

---

## FASE 2 — SANITIZAÇÕES DE SEGURANÇA

**Objetivo:** bloquear erros bobos que detonam confiança (template com nome "VALIDACAO", dispara madrugada).

**Quem faz:** eu (Claude).

**Tarefas:**

1. **`sanitizeContactName(name)`** em `src/lib/leticya/sanitize.ts`:
   - Filtra emails (`@`) → retorna `null` (vira "Olá, tudo bem?")
   - Filtra só números → null
   - Bloqueia "VALIDACAO", "TESTE", "DIAGNOSTICO" → null + log
   - Converte "JOAO" → "João" (Title Case)
   - Pega só primeiro nome se múltiplas palavras
   - Retorna string pronta pra usar no template

2. **`isWithinSendWindow(now)`** — janela 8h-22h:
   - Retorna bool considerando timezone Brasília (America/Sao_Paulo)
   - Se `false` em horário de disparo template → pula envio e agenda pra 8h do próximo dia

3. **`hasPdfQuote(messageBody)`** — detecta se mensagem vem com cotação do site:
   - Procura padrão `FIPE: R$` + `Mensalidade: R$`
   - Se sim: marca lead como "Cenário 1" (com PDF)
   - Se não: marca como "Cenário 3" (frio, sem PDF) → IA escala sem cotar

4. **Guard no route**: se IA tentar usar `lookupFipe` ou `getPlanPrice`:
   - Loga aviso ("Regra Sagrada Nº 4 violada")
   - Bloqueia execução da tool
   - Força chamada de `notifyHumanToTakeOver(reason="cotacao_sem_pdf")`

5. **Validador de output da IA antes do envio:**
   - Roda regex no draft procurando: `R$ \d+` que NÃO veio do PDF/fórmula
   - Se achar valor "inventado" → bloqueia envio, manda pro suporte

**Critério de saída:**
- ✅ 10 nomes de teste sanitizados corretamente (incluindo "VALIDACAO CHROMIUM" → bloqueia)
- ✅ Disparo 23h45 é agendado pra 8h
- ✅ Mensagem com PDF vs sem PDF detectadas corretamente
- ✅ IA tentando cotar sem PDF é forçada a escalar

---

## FASE 3 — INTEGRAÇÃO EVOLUTION API + WORKER DE ENVIO

**Objetivo:** a IA REALMENTE conversar pelo WhatsApp. É a fase mais complexa.

**Quem faz:** eu (Claude) — você só me passa as credenciais Evolution e decide qual instância usar.

**Arquitetura:**

```
[Cliente WhatsApp]
       ↓
[Evolution Webhook] → POST /api/whatsapp/inbound
       ↓
[Persistir em chat.messages (direction=INBOUND)]
       ↓
[Verificar takeover ativo? → se sim, ignora]
       ↓
[Enfileirar job "process_message" em pg-boss]
       ↓
[Worker pega job → chama /api/agent/leticya internamente]
       ↓
[Recebe { bubbles, initial_delay_ms, takeover_triggered }]
       ↓
[Enfileirar N jobs "send_bubble" agendados]
       ↓
[Cada job send_bubble:
   1. Verifica takeover novamente
   2. Marca "Letycia está digitando..." via Evolution
   3. Aguarda typing_delay_ms
   4. Envia bolha via Evolution
   5. Aguarda gap_after_ms antes do próximo
]
```

**Tarefas:**

1. **Migration `240_message_queue.sql`**:
   - `ai.send_queue` (job_id, contact_id, bubble_text, scheduled_for, status)
   - `ai.inbound_log` (raw payload pra debug)

2. **Webhook `/api/whatsapp/inbound`**:
   - Recebe payload Evolution
   - Identifica/cria contato
   - Salva mensagem em `chat.messages`
   - Verifica takeover → se ativo, só persiste e silencia
   - Senão: enfileira `process_message`

3. **Worker `process-message-worker.ts`** (pg-boss):
   - Chama route interno do agente
   - Recebe bolhas planejadas
   - Enfileira jobs `send_bubble` com `scheduled_for`

4. **Worker `send-bubble-worker.ts`**:
   - Antes de enviar: re-checa takeover (pode ter ativado nesse meio tempo)
   - Marca presence "digitando" via Evolution
   - Aguarda
   - Envia mensagem
   - Salva em `chat.messages` (direction=OUTBOUND, sender_type=AGENT_IA)

5. **Endpoint de takeover manual:**
   - Humano dentro do CRM clica "assumir conversa" → cria takeover → cancela todos os jobs pendentes em `ai.send_queue` daquele contato

**Critério de saída:**
- ✅ Webhook recebe mensagem real do WhatsApp e persiste
- ✅ IA responde com bolhas humanizadas (delay 30-90s + 2-5 bolhas)
- ✅ Humano consegue interromper a IA no meio da sequência
- ✅ Mensagem fora de horário fica em fila pra 8h
- ✅ Sem race condition: 100 mensagens simultâneas processam ok

**Riscos altos:**
- Evolution API instável → fila com retry exponencial
- IA responde em loop → guarda contra "agente respondendo a si mesmo"
- Conta WhatsApp banida → sempre testar em número de teste primeiro

---

## FASE 4 — MODO "DRAFT ONLY" (HUMAN-IN-THE-LOOP)

**Objetivo:** antes de ir ao vivo, IA gera resposta mas **HUMANO APROVA** cada uma antes de enviar. Permite afinar o tom sem risco de falar besteira pro cliente.

**Quem faz:** eu (Claude) implementa, você opera.

**Tarefas:**

1. **Flag `agent_mode` em `ai.agents`**:
   - `shadow` (atual — não envia)
   - `draft` (gera, humano aprova)
   - `live` (envia direto)

2. **Worker em modo draft:**
   - Recebe mensagem inbound
   - Gera resposta normal
   - **Não envia** — registra em `ai.pending_approvals`
   - Notifica seu WhatsApp interno: "📝 Nova resposta da Leticya pra aprovar [link]"

3. **UI mínima de aprovação:**
   - Lista pendentes
   - Mostra: input do cliente → bolhas planejadas
   - Botões: ✅ Aprovar e Enviar / ✏️ Editar e Enviar / ❌ Descartar e Assumir manual
   - Se aprovado: envia via Evolution
   - Se editado: salva a edição como fact ("a IA preferiria X mas humano preferiu Y") — vira training data

4. **Métricas que você vê:**
   - % aprovadas sem edição
   - % aprovadas com edição
   - % descartadas
   - Tempo médio de aprovação

**Critério de saída pra Fase 5:**
- ✅ ≥ 80% das respostas aprovadas sem edição em 50 conversas reais
- ✅ Zero descarte por motivo "absurdo" (alucinação, valor inventado, frase de bot)
- ✅ Você se sente confortável em deixar a IA enviar sozinha

**Duração estimada:** 2-3 dias de operação supervisionada.

---

## FASE 5 — SOFT LAUNCH INTERNO

**Objetivo:** você + equipe usa um número de teste como se fosse cliente. Stress test em ambiente controlado.

**Quem faz:** você e equipe (Letycia humana, vendedores).

**Tarefas:**

1. **Criar número de teste no Evolution** (instância separada da produção)

2. **Roteiro de 50 conversas-tipo** (eu monto baseado nas 263 conversas reais):
   - 20 leads do site com cotação
   - 10 leads frios sem PDF
   - 5 cliente com objeção de preço
   - 5 veículo rejeitado
   - 3 sinistro/emergência
   - 3 funil APN
   - 2 já é associado
   - 2 conversas erráticas/confusas

3. **Equipe testa**, cada um faz 10 conversas

4. **Daily de feedback** — você + eu revisamos:
   - O que a IA acertou
   - O que a IA falou estranho
   - Ajusta prompt → re-aplica → continua

5. **Documenta cada bug** em `BUGS-SOFT-LAUNCH.md` com:
   - Input do cliente
   - Output da IA
   - Como deveria ser
   - Decisão (fix prompt / fix tool / aceitar)

**Critério de saída pra Fase 6:**
- ✅ Bug rate < 5% (1 em 20 conversas tem problema sério)
- ✅ Letycia humana avalia: "essa IA me substituiria em 70%+ dos casos"
- ✅ Você se sente confortável em soltar pra 10% de leads reais

---

## FASE 6 — PILOTO COM 10% DE LEADS REAIS

**Objetivo:** validar comportamento com pessoas de verdade, em escala pequena, monitorando tudo.

**Quem faz:** automação (eu configuro o roteador) + você monitora.

**Tarefas:**

1. **Roteador no webhook inbound:**
   - Lead novo entra → sorteio random
   - 10% → IA (modo `live`)
   - 90% → Letycia humana (modo manual)
   - Marca `routing_path` em `core.leads` pra comparar

2. **Dashboard de métricas em tempo real:**
   - Taxa de resposta < 60s (IA deve ser sempre)
   - Taxa de conversão (lead → quer fechar)
   - Taxa de escalation (cliente passou pra humano)
   - Taxa de NPS/satisfação (se cliente pediu pra falar com humano direto = ruim)
   - Tempo médio de takeover
   - Métricas comparativas: IA 10% vs Humano 90%

3. **Alerta de problemas:**
   - Toda escalation `urgency=CRITICAL` chega no seu WhatsApp
   - Cliente reclamou: alerta imediato
   - IA falou "seguro" (passou pelo supervisor): alerta + auditoria

4. **Reunião semanal** — review:
   - Taxa de conversão IA vs Humano
   - Onde a IA brilhou
   - Onde a IA falhou
   - Decisão: subir % ou ficar

**Critério de saída pra Fase 7:**
- ✅ Taxa de conversão IA ≥ 80% da taxa do humano
- ✅ Zero reclamação grave (Reclame Aqui, denúncia formal)
- ✅ NPS de leads atendidos pela IA ≥ 4.5/5
- ✅ Você aprova subir o split

**Duração esperada:** 1 semana de piloto.

---

## FASE 7 — EXPANSÃO GRADUAL

**Objetivo:** subir IA pra mais leads, sempre com monitoramento.

**Tarefas:**

1. **Sobe gradual**, cada degrau espera 24-48h:
   - 10% → 25%
   - 25% → 50%
   - 50% → 80%
   - 80% → 100%

2. **Em cada degrau:**
   - Revisa métricas das últimas 24h
   - Se taxa de conversão caiu > 10%: pausa e investiga
   - Se zero problema grave: sobe próximo

3. **Letycia humana** vira **gerente da IA**:
   - Foco dela: takeovers + casos especiais + supervisão
   - Lead novo simples vai direto pra IA
   - Lead complexo escalado pra ela

**Critério de saída:**
- ✅ IA tratando 100% do funil de entrada
- ✅ Letycia humana com ≤ 30% do volume original (só takeovers)
- ✅ Métricas estáveis há 7 dias

**Duração:** 5-7 dias.

---

## FASE 8 — OTIMIZAÇÃO CONTÍNUA

**Objetivo:** IA melhora sozinha (com sua aprovação).

**Loop infinito:**

1. **Toda semana:**
   - Re-roda script de análise de conversas (que destilei pra criar v3)
   - Identifica novos padrões: objeções novas, gírias de clientes, expressões regionais
   - Sugere ajustes na persona
   - Você aprova ou não → re-aplica

2. **Toda quinzena:**
   - Compara IA atual com snapshot de 15 dias atrás
   - Métricas que devem evoluir:
     - Taxa de conversão
     - Tempo médio de resposta
     - Taxa de "soa como humano" (NPS específico)

3. **Eventos especiais:**
   - Mudou preço de plano → eu atualizo persona em 1 turno
   - Mudou regra de cobertura → idem
   - Novo concorrente apareceu → adiciona no catálogo
   - Veículo novo na lista de bloqueio → adiciona em `ai.rejected_vehicles`

---

## O QUE FALTA — RESUMO EXECUTIVO

### Bloqueadores diretos (sem isso não tem como começar)
- [ ] **Você aprovar prompt v3**
- [ ] **Número WhatsApp pra escalation interno**
- [ ] **0800 correto da assistência**
- [ ] **Credenciais Evolution API + instância escolhida**

### Tarefas técnicas (eu faço quando os bloqueadores acima estiverem ok)
- [ ] Aplicar persona v3 no banco (substitui v2)
- [ ] Criar tool `notifyHumanToTakeOver`
- [ ] Migration `230_takeovers_table.sql`
- [ ] Sanitização de nome / janela de horário / detecção PDF
- [ ] Webhook `/api/whatsapp/inbound`
- [ ] 2 workers (process_message + send_bubble)
- [ ] Migration `240_message_queue.sql`
- [ ] Modo `draft` no route (human-in-the-loop)
- [ ] UI de aprovação (pode ser endpoint + Postman, depois UI bonita)
- [ ] Roteador 10/90 → 100/0 gradual
- [ ] Dashboard de métricas

### Decisões que você precisa tomar
- [ ] Roda em produção desde o início ou em número de teste primeiro? (recomendo teste)
- [ ] Modo `draft` (aprovação humana) por quanto tempo? (recomendo 3-7 dias antes de live)
- [ ] Quem mais avalia a IA além de você? (Letycia humana? mais alguém?)
- [ ] Aceita IA respondendo fim de semana SEM você poder revisar? (alto risco se ela errar — recomendo deixar em draft sábado/domingo no início)

---

## RISCOS QUE EU VEJO E COMO MITIGAR

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| IA inventa valor de mensalidade | Baixa (Regra Nº 4 + validador) | Alto (perde confiança) | Bloqueador no validador antes do envio |
| IA dispara madrugada | Baixa (sanitização) | Médio (cliente irritado) | Janela 8h-22h hardcoded |
| Cliente irritado vai pro Reclame Aqui | Média | Alto | Escalation imediata + alerta no seu WhatsApp |
| IA não silencia quando humano assume | Baixa (takeover) | Alto (duas vozes) | Re-check em cada bolha |
| Evolution API cai | Média | Alto (fila trava) | Retry + alerta + fallback manual |
| WhatsApp bana conta | Baixa (delays humanos) | Crítico | Sempre número de teste primeiro, monitorar rate |
| IA fala "seguro" passa pelo supervisor | Muito baixa | Alto (SUSEP) | 2 camadas: regex + LLM-judge (já existe) |
| Lead percebe que é robô | Média | Médio | Humanizer + delay 30-90s + erros leves |

---

## ETA REALISTA

```
Hoje                       — você aprova prompt v3 + passa 2 dados
Dia +1 a +2                — Fase 1: takeover system
Dia +2 a +3                — Fase 2: sanitizações
Dia +3 a +6                — Fase 3: Evolution + workers
Dia +6 a +7                — Fase 4: modo draft, você opera
Dia +7 a +10               — Fase 5: soft launch interno
Dia +10 a +17              — Fase 6: piloto 10%
Dia +17 a +22              — Fase 7: expansão gradual 100%
Dia +22 em diante          — Fase 8: otimização contínua

Total até produção 100%: ~22 dias úteis (1 mês corrido).
Total até IA atendendo cliente real (modo draft): ~7 dias.
Total até IA enviando sozinha em 10% dos leads: ~10 dias.
```

---

## PRÓXIMA AÇÃO IMEDIATA (HOJE)

1. **Você decide:** prompt v3 tá aprovado? Se sim, me diz "pode aplicar"
2. **Você me passa:** número WhatsApp interno + 0800 correto
3. **Você decide:** vai usar número de teste ou produção pra começar?
4. **Você decide:** começa em modo `draft` (você aprova cada resposta) ou pula direto pra `live` no soft launch?

Quando você responder esses 4 pontos, eu inicio a Fase 1 (sem disparar nada pra cliente — só código + smoke tests).
