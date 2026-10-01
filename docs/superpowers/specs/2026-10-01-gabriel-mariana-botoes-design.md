---
data: 2026-10-01
projeto: 21go
tags: [crm, gabriel-juliano, mariana, whatsapp, gastos, lucro]
tipo: decisão
---

# Gabriel Juliano — botões WhatsApp, Gastos e Lucro no CRM (ciclo 1)

## Contexto

Pedido do dono em 01/10/2026: no CRM do consultor **Gabriel Juliano** (web e app), liberar os
botões de WhatsApp, Gastos e Lucro. O WhatsApp dele vai ser atendido por um robô igual à Isa,
com a mesma inteligência, chamado **Mariana**. Gasto = gasto dele no Meta. Lucro segue a mesma
lógica da Leticya. **Neste ciclo os botões entram com os dados em branco.**

Regra do dono para este trabalho: **o que se faz para o Gabriel não vale para mais ninguém.**
Nada aqui pode abrir dado da Isa/Leticya para ele, nem dar estas telas a outro consultor.

Divisão aprovada:

- **Ciclo 1 (este documento):** botões e telas do Gabriel, com dados em branco.
- **Ciclo 2 (outra especificação):** a Mariana atendendo de verdade. Depende de um número de
  WhatsApp próprio dela, que ainda não existe.

## Quem é o Gabriel no sistema

| Onde | Valor |
|---|---|
| Usuário do CRM | `ee11e4e3-64d1-457f-9f80-dbc90bf65644`, papel `vendedor`, ativo |
| E-mail | `suportekdigital@gmail.com` |
| Power | companyUser `169397`, PowerLink `XDmAbx6D`, salesman `274773` |
| Ligação CRM ↔ Power | linha em `power_usuarios_map` (já existe) |

O app (`com.r21go.crm`) é um invólucro Capacitor que carrega o CRM web. Liberando no web, o app
mostra o mesmo, sem mudança no app.

## Desenho

### Trava: lista própria da Mariana

- Variável nova no servidor do CRM: `ATENDIMENTO_MARIANA_USUARIOS`, mesmo formato da lista da Isa
  (`<userId>:<rótulo>`). Valor inicial: `ee11e4e3-64d1-457f-9f80-dbc90bf65644:gabriel`.
- A lista da Isa (`ATENDIMENTO_ISA_USUARIOS`) **não muda** e as rotas da Isa continuam olhando
  só para ela. Estar na lista da Mariana não dá acesso a nenhuma rota da Isa (403 como hoje).
- Liberação por **ID de usuário**, nunca por papel nem por nome, igual à regra da Leticya.
- Um usuário nas duas listas é tratado como Isa (caso que não deve existir; a Isa prevalece para
  não mudar nada da Leticya).
- `GET /api/atendimento-isa/liberado` passa a devolver também `atendente: 'isa' | 'mariana' | null`.
  Os campos atuais (`liberado`, `usuario`, `lucro`) continuam com o mesmo significado para a Isa;
  para o Gabriel, `liberado` segue `false` (é o campo que abre as rotas da Isa).

### Menu (web e app)

- `canSeeItem` em `AppLayout.tsx`: WhatsApp (`/atendimento`) e Gastos (`/gastos`) aparecem quando
  `atendente` é `isa` **ou** `mariana`. Lucro continua aparecendo para ele, como já aparece para
  todo vendedor.
- A tela inicial do Gabriel **não muda** (continua o funil). O redirecionamento para
  `/atendimento` no carregamento continua só para a Isa.

### Tela WhatsApp do Gabriel

- Mesmo endereço `/atendimento`; quando `atendente === 'mariana'` a página mostra a versão da
  Mariana e **não chama nenhuma rota da Isa** (contatos, conversa, etiquetas, funil).
- Cabeçalho com o nome **Mariana**. Lista de conversas vazia, com o aviso de que a Mariana ainda
  não está atendendo e que as conversas dela vão aparecer ali.
- Barra de etiquetas: a mesma lista da Isa **sem "Falando com Leticya" e sem "Falando com
  Guilherme"** (pedido do dono em 01/10/2026). A lista fica no CRM, fixa para a Mariana, e só
  filtra (não há conversas para etiquetar ainda).

### Tela Gastos do Gabriel

- Quando `atendente === 'mariana'`, a página não chama a rota de gastos da Isa.
- Dois quadros: **Meta Ads (Gabriel)** e **WhatsApp da Mariana**, ambos com traço no valor e o
  aviso "ainda não conectado".

### Lucro do Gabriel no formato da Leticya

- Novo modo de Lucro `mariana`, decidido no backend por `modoDoLucro`: na lista da Isa →
  `leticya`; na lista da Mariana → `mariana`; outro `vendedor` → `consultor`; resto → nada (403).
- **Venda = vistoria aprovada** (decisão do dono, 01/10/2026), a mesma fonte do modo `consultor`
  de hoje: vendas do salesman `274773` via `power_usuarios_map`, de setembro/2026 em diante, com
  os filtros de dia, semana, mês e período.
- Layout da aba da Leticya, com os nomes trocados:
  - bloco **Quem fechou**: Mariana com zero vendas e Gabriel com todas, até a Mariana existir;
  - gasto do Meta em branco (traço), sem entrar na conta do lucro enquanto não houver número;
  - **Caixa** continua o dele, o mesmo de hoje (dono do caixa = ID do usuário dele);
  - confirmação de valor pago continua a do consultor (só as vendas dele).
- **Sem Mercado Pago.** A conta do Mercado Pago da aba da Leticya é a dela; a do Gabriel não é
  conhecida.

### O que não muda

- Nada para a Leticya: menu, telas, Lucro, Caixa e Gastos dela ficam idênticos.
- Nada para os outros vendedores: continuam vendo só a aba Lucro de consultor.
- Nenhuma tabela nova, nenhuma migração.

## Erros e segurança

- Toda rota que o modo Mariana usar checa a lista da Mariana no backend; fora dela, 403.
- O acesso espelho continua sem Lucro, nos dois modos.
- Se a variável `ATENDIMENTO_MARIANA_USUARIOS` estiver vazia ou ausente, ninguém vê as telas da
  Mariana e o Gabriel volta a ter só o Lucro de consultor (estado de hoje).

## Testes

- Funções puras com testes:
  - a leitura da lista da Mariana (formato, ID ausente, lista vazia);
  - `modoDoLucro` para Leticya, Gabriel, vendedor comum, admin fora das listas e espelho;
  - quem vê cada item do menu (Isa, Mariana, vendedor comum);
  - a lista de etiquetas da Mariana sem `leticya` e sem `guilherme`.
- Conferência no navegador (puppeteer) das três telas. Limite: sem a senha do Gabriel, a
  conferência visual é feita com um usuário de teste colocado na lista da Mariana só no ambiente
  local, nunca em produção.

## Produção

- Mudança só aditiva. Antes do deploy: CRM respondendo 200. Depois: CRM 200 e o commit servido
  conferido.
- A variável nova entra em `/opt/crm21go/.env.producao` com o ID do Gabriel.

## Fora deste ciclo

- A Mariana atendendo (robô, número, prompt com o nome Mariana, painel de conversas).
- Gasto real do Meta Ads do Gabriel (conta de anúncio dele, ainda não conhecida).
- Custo real do WhatsApp da Mariana.

## Links relacionados

- [[project_gabriel_21goapp_power]]
- [[feedback_crm_so_leticya_nunca_outro]]
- [[project_venda_leticya_liga_pelo_telefone_do_power]]
- [[project_painel_gastos_meta_whatsapp]]
