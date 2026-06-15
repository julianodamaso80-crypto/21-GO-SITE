# RUNBOOK — Sites .site (21go.site + 21goconsultoraleticya.site)

> Os dois sites rodam do MESMO serviço no Easypanel: **social-21go / site** (pasta `21go-website/`).
> O **.com.br** (21-SITE-OFICIAL-2) é OUTRA coisa, fica na Vercel e NÃO se mexe aqui.

---

## ⚠️ Conceito que resolve 90% da confusão

O número de WhatsApp aparece em **DOIS lugares independentes**. Trocar em um NÃO troca o outro:

| # | Lugar | O que controla | Onde fica |
|---|-------|----------------|-----------|
| **1** | **ENVIO** (instância Evolution) | De qual número SAI o PDF/mensagem automática | **ENV do Easypanel** (`EVOLUTION_INSTANCE` + `EVOLUTION_API_KEY`) |
| **2** | **BOTÕES** do site (wa.me) | Pra qual número o cliente é mandado ao clicar | **CÓDIGO no GitHub** (`21go-website/src/...`) |

**Ao trocar de número, SEMPRE faça os DOIS.**

---

## 🔴 CENÁRIO A — Site caiu (bolinha vermelha / 502 / "Service is not reachable")

1. **Espere 1–2 minutos e recarregue.** Existe um auto-cura (cron no servidor) que sobe o site sozinho quando ele cai pra 0 réplicas. Na maioria das vezes resolve sem fazer nada.
2. Se NÃO voltar em 2 min, no **Easypanel → social-21go → site → botão verde "Implantar"**.
3. Último recurso (via SSH no servidor `167.71.31.77`):
   ```bash
   docker service update --update-order start-first --replicas 1 social-21go_site
   ```

> Causa: o serviço `social-21go_site` tem a mania de cair pra `0/0` réplicas (bug do Easypanel/Swarm). O auto-cura (`/root/autoheal-site.sh` + cron de 1 min) existe pra isso.

---

## 🟢 CENÁRIO B — Trocar o número de WhatsApp / instância

### Parte 1 — ENVIO (Easypanel) — faz a mensagem automática sair do número novo
1. Confirme na **Evolution** (evolution.sinistro21go.site) que a instância nova está **Connected** e é o número certo.
2. Easypanel → **site → Ambiente**. Ajuste:
   - `EVOLUTION_INSTANCE` = nome da instância nova
   - `EVOLUTION_API_KEY` = a key DELA (cada instância tem a sua)
   - `NOTIFY_NUMBER` = número novo (se aplicável)
3. **MUITO IMPORTANTE:** não pode haver a MESMA variável duas vezes no env. Se existir uma seção duplicada (ex: `# EVOLUTION API 2` com valores antigos), **apague a antiga** — senão a de baixo vence e volta tudo pro número errado.
4. **Salvar** → **Implantar**.

### Parte 2 — BOTÕES do site (código/GitHub) — faz o cliente cair no número novo
1. No projeto, trocar o número antigo pelo novo em **TODO o `21go-website/`** (NÃO no `21-SITE-OFICIAL-2/`). Arquivos que costumam ter:
   - `src/lib/constants.ts`, `src/lib/whatsapp.ts`, `src/lib/pdf-quote.ts`
   - `src/components/layout/Footer.tsx`, `src/components/seo/SchemaOrg.tsx`
   - `src/app/{cotacao,faq,indique,seja-consultor}/page.tsx`
   - `src/app/api/{consultor,lead-abandoned,followup}/route.ts`
   - `public/llms.txt` e qualquer `content/blog/*.mdx` que cite o número
2. Conferir que não sobrou nenhum número antigo (busca global pelo número).
3. **Commit + push + deploy** (ver abaixo).

---

## 🔑 CENÁRIO C — Subir código pro GitHub (o passo que sempre trava)

O deploy do Easypanel SÓ publica o que está no **GitHub**. Mudança no código só vai pro ar depois do **push**.

No terminal do VSCode (pasta do projeto):
```bash
git add .
git commit -m "fix: troca numero de contato"
git push site master
```

- Se abrir janela do GitHub → **logar / Authorize** no navegador.
- Se travar pedindo senha → usar **token**:
  1. Gerar em: https://github.com/settings/tokens/new → marcar **repo** → Generate.
  2. Push com o token:
     ```bash
     git push https://SEU_TOKEN@github.com/julianodamaso80-crypto/21-GO-SITE.git master
     ```
- Se der "rejected / non-fast-forward":
  ```bash
  git pull --rebase site master
  git push site master
  ```

Depois do push, **disparar o deploy** (gatilho do Easypanel):
```bash
curl -X POST "http://167.71.31.77:3000/api/deploy/<TOKEN_DE_DEPLOY>"
```
(o `<TOKEN_DE_DEPLOY>` está em Easypanel → site → Implantações → "Gatilho de Implantação")

---

## ✅ Como CONFERIR que ficou certo (sem achismo)

1. Abrir os dois sites em **aba anônima** + `Ctrl+Shift+R` (limpa cache):
   - https://21go.site e https://21goconsultoraleticya.site
2. Clicar num botão de WhatsApp e ver se o número na URL (`wa.me/...` ou `api.whatsapp.com/send?phone=...`) é o **novo**.
3. Conferir saúde técnica:
   ```
   https://21go.site/api/health/full
   ```
   Tem que vir `"evolution":{"ok":true,"detail":"open"}`.

---

## Referência rápida (estado em 02/06/2026)
- Instância de envio ATUAL: `disparo_xHH2aIEs_site21go` → número **5521980214882**
- Instância ANTIGA (banida pelo WhatsApp): `site21leticya` → 5521969454824 (NÃO usar)
- Evolution URL: https://evolution.sinistro21go.site
- Servidor (SSH): `167.71.31.77`
- Auto-cura: `/root/autoheal-site.sh` + cron 1 min (log em `/var/log/autoheal-site.log`)
