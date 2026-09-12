# As 5 que ficaram em branco no doc — respondidas pelo dono em 12/09/2026

Complemento de `71-perguntas-respondidas-pelo-dono.docx`. Respondido por ele no WhatsApp,
já portado pro `GABARITO_21GO` (`21go-website/src/lib/isa/prompt.regras.ts`) e travado em
`testes/isa/prompt.test.ts`.

| # do doc | Pergunta | Resposta do dono |
|---|---|---|
| 16 | Motorhome: aceita? | **Não.** |
| 30 | Quando libera o acesso ao aplicativo? | **72 horas úteis** (o pós-venda libera). |
| 17 | Zero km: dá pra ativar no mesmo dia da retirada, até 18h? | Dá pra ativar no mesmo dia. **Não falar em horário limite.** |
| 55 | Danos a terceiros acima de R$ 100 mil? | Adicional de **R$ 49,90/mês por mais R$ 50 mil** em cima do que o plano já dá. |
| — | Táxi e retorno a domicílio | **Táxi:** acima de 2 pessoas, depois de colisão ou outro caso em que fique sem o carro, **de acordo com o plano escolhido** (o km é o do plano). <br> **Retorno a domicílio:** individual, **raio de 20 km** — passou mal no volante, sem condições de dirigir. |

## Em aberto

- **O que é o "carro amigo" e em que ele difere do retorno a domicílio?** A tabela do PDF
  (`src/lib/pdf-quote.ts`) trata os dois como linhas diferentes: carro amigo com **25 km de
  raio** e só do VIP pra cima (o Básico não tem), retorno a domicílio em todos os planos.
  O gabarito da Isa descrevia "carro amigo: se o motorista passar mal, raio de até 25km" —
  que é a descrição do **retorno a domicílio**, com o km do carro amigo. A descrição errada
  saiu; o carro amigo foi pra lista do que ela ainda não sabe até o dono definir.
