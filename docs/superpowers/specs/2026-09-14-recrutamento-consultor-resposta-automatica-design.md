---
data: 2026-09-14
projeto: 21Go
tags: [21go, whatsapp, consultor, recrutamento, evolution]
tipo: decisão
---

# Resposta automática ao lead do "Quero Ser Consultor" (sites .site)

## Contexto

Em `21go.site/seja-consultor` o lead preenche nome, e-mail, WhatsApp, cidade/UF e
experiência. O site abre o WhatsApp **da casa** (`/api/wa` → alvo único `5521969454824`,
instância Evolution `site4824`) com o texto já montado:

> Olá! Acabei de me cadastrar como consultor 21Go. / Nome: … / E-mail: … / WhatsApp: … / Local: …

Hoje ninguém responde automaticamente: a mensagem só é gravada em `conversations` +
`messages` pelo webhook `POST /api/webhooks/evolution`.

O dono (14/09/2026) pediu: quem chega por esse botão recebe **uma resposta pronta** com
saudação pela hora do Rio, o horário do treinamento e o link do grupo. E se a pessoa
responder qualquer coisa, ouve **uma vez** que o atendimento é virtual e que tudo é
passado no grupo.

## Decisões (respondidas pelo dono)

| Decisão | Escolha |
|---|---|
| Canal | **4824**, onde o lead já cai. Resposta pela Evolution, mesma instância que recebeu. |
| Ativação | Nasce **desligada**, respondendo só a allowlist de teste (8062 / 4240). |
| Reincidência | Responde a pergunta do lead **1x** e depois silencia aquele contato. |
| Indicação | A mensagem **pede ao lead** que informe no grupo a indicação da consultora Leticya Thayene. |

## Como funciona

1. Lead envia o texto do formulário → webhook da Evolution grava (fluxo atual, intocado).
2. Sendo `inbound` com texto, o webhook chama `atenderRecrutamento`.
3. O texto casa com a assinatura do formulário → responde as **boas-vindas**, grava
   `boas_vindas_em`.
4. Qualquer mensagem seguinte do mesmo número → responde **uma vez** a frase de
   atendimento virtual, grava `aviso_virtual_em`, e daí em diante fica mudo.
5. Se o mesmo número mandar o formulário de novo depois de 24h, recomeça o ciclo
   (cadastro novo, saudação nova).

**Nada é ativo.** Só responde quem escreveu — anti-ban preservado (REGRA 0.1: nenhum
disparo sem clique). Vale só para o 4824: site de consultor manda o contato para o
WhatsApp dele e nem passa por aqui.

Funciona 24h. A saudação sai pela hora do Rio, via `cumprimento()` de
`src/lib/isa/hora.regras.ts` — a mesma função da Isa, para não existir duas verdades
sobre "que horas são no Rio".

## Textos (aprovados pelo dono em 14/09/2026)

**Boas-vindas** (a saudação troca conforme a hora):

```
Bom dia! 👋

Que bom que você quer ser consultor 21Go!

Nosso treinamento é online, todas as terças e quartas às 20h.

Já te passo o link do nosso grupo — é por lá que a gente avisa tudo, e no dia do treinamento eu mando o link da sala:
https://chat.whatsapp.com/JibpbvUskJ74KtZ6zSHMEq?s=cl&p=i&mlu=0&amv=2

Ao entrar, informe que sua indicação é da consultora Leticya Thayene.
```

**Se o lead responder ou perguntar algo:**

```
Sou o atendimento virtual da 21Go 🤖

Todas as informações sobre comissão, produto e como começar são passadas dentro do grupo e no treinamento das terças e quartas às 20h.

Entra no grupo que lá você tira todas as suas dúvidas 👇
https://chat.whatsapp.com/JibpbvUskJ74KtZ6zSHMEq?s=cl&p=i&mlu=0&amv=2
```

Não existe template de utilidade aqui: template é recurso da API oficial da Meta, e o
4824 é chip Evolution. Não faz falta — a pessoa escreve primeiro, a janela está aberta
e a resposta sai como texto comum.

## Arquivos

- `supabase/migrations/297_consultor_recrutamento.sql` — tabela nova, aditiva.
- `src/lib/consultor-recrutamento.regras.ts` — lógica pura: reconhecer o texto do
  formulário, montar os dois textos, decidir se responde (trava de teste + 24h).
- `src/lib/consultor-recrutamento.ts` — estado no Postgres + envio pelo `sendText`.
- `src/app/api/webhooks/evolution/route.ts` — uma chamada no `handleMessageUpsert`.
- `testes/consultor/recrutamento.test.ts` — testes das regras puras.

## Trava de ativação

- `CONSULTOR_BOT_ATIVO=on` libera para todo mundo.
- `CONSULTOR_BOT_ALLOWLIST=5521992208062,5521965774240` responde só esses, mesmo desligado.
- Sem nenhuma das duas: não responde ninguém (estado em que nasce).

## Riscos assumidos

- A resposta sai do **celular da Leticya** (o 4824 é o chip dela). Ela verá essas
  conversas. Trocar de chip exige conectar número novo na Evolution.
- O reconhecimento é pelo texto do formulário. Se a copy do `seja-consultor/page.tsx`
  mudar, o gatilho deixa de casar — a regex e o texto do site precisam andar juntos.

## Links relacionados

- [[MEMORIA-21Go]]
- CLAUDE.md do projeto — REGRA 0.1 (nada dispara pelo nosso chip sem clique)
