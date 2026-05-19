# 21Go — Tracking Setup Guide

## Arquitetura (TrackMaster 3 Camadas)

```
CAMADA 1 — CLIENT-SIDE (site)
  GTM Web → Meta Pixel + GA4 + Google Ads Tag
  DataLayer → 5 eventos com event_id UUID

CAMADA 2 — SERVER-SIDE (Stape.io)
  GTM Server → Meta CAPI + GA4 Server + Enhanced Conversions
  Deduplicação via event_id

CAMADA 3 — OFFLINE (CRM)
  Vendedor fecha → Google Ads API + Meta CAPI Purchase
  Rastreado via GCLID/FBCLID salvo no lead
```

---

## 1. Variáveis de Ambiente

No EasyPanel (projeto `social-21go`, serviço do site), adicionar como
**Build Args / Env** (NEXT_PUBLIC_* são inlinadas em build time, exigem rebuild):

```
NEXT_PUBLIC_GTM_ID=GTM-WQ9L62XN
NEXT_PUBLIC_META_PIXEL_ID=123456789
```

> **GTM oficial em produção:** `GTM-WQ9L62XN` (contêiner "21Go - Web - 2").
> Existe também `GTM-TL4CGJKJ` ("21Go - Web") na mesma conta, mas **não é
> usado** — as tags GA4/Google Ads/Meta Pixel estão no WQ9L62XN.

---

## 2. Conta GTM Web (já criada)

- Conta: **21Go**
- Contêiner em uso: **21Go - Web - 2** → `GTM-WQ9L62XN`
- Contêiner alternativo (não usar): 21Go - Web → `GTM-TL4CGJKJ`

Para trocar de contêiner no futuro, basta atualizar `NEXT_PUBLIC_GTM_ID`
no EasyPanel e rebuildar o serviço do site.

---

## 3. Criar Conta GA4

1. Acesse https://analytics.google.com
2. Crie propriedade "21Go Site"
3. Copie o Measurement ID (ex: G-ABC123)
4. No GTM Web, crie tag: Google Analytics: GA4 Configuration
   - Measurement ID: `G-ABC123`
   - Trigger: All Pages

---

## 4. Configurar Meta Pixel

1. Acesse Meta Business Suite > Events Manager
2. Crie um Pixel "21Go Site"
3. Copie o Pixel ID (ex: 123456789)
4. Cole na variável `NEXT_PUBLIC_META_PIXEL_ID` no Railway
5. O script já é injetado automaticamente pelo GTMProvider

---

## 5. Eventos do DataLayer

O site dispara estes eventos automaticamente:

| Evento | Quando | Meta Pixel | Parâmetros |
|--------|--------|------------|------------|
| `page_view` | Toda página | PageView | url, title, referrer, UTMs |
| `cotacao_inicio` | Clica "Ver Cotação" | InitiateCheckout | event_id |
| `cotacao_completa` | Vê resultado | Lead | marca, modelo, plano, valor, FIPE |
| `whatsapp_click` | Clica WhatsApp | Contact | plano, valor, origem |

Todos incluem: `event_id` (UUID), `gclid`, `fbclid`, UTMs.

---

## 6. Tags no GTM Web

### Tag 1: GA4 — Cotação Início
- Type: GA4 Event
- Event Name: `cotacao_inicio`
- Trigger: Custom Event = `cotacao_inicio`
- Parameters: `event_id` = {{DLV - event_id}}

### Tag 2: GA4 — Cotação Completa
- Type: GA4 Event
- Event Name: `cotacao_completa`
- Trigger: Custom Event = `cotacao_completa`
- Parameters: plan_name, plan_value, vehicle_marca, vehicle_modelo, fipe_value

### Tag 3: GA4 — WhatsApp Click
- Type: GA4 Event
- Event Name: `whatsapp_click`
- Trigger: Custom Event = `whatsapp_click`
- Parameters: click_origin, plan_name, plan_value

### Tag 4: Google Ads Conversion — Lead
- Type: Google Ads Conversion Tracking
- Conversion ID: (do Google Ads)
- Conversion Label: (do Google Ads)
- Trigger: Custom Event = `cotacao_completa`
- Value: {{DLV - plan_value}}

---

## 7. Stape.io (Server-Side GTM)

### Setup
1. Crie conta em https://stape.io (plano Pro ~$20/mês)
2. Crie Server Container
3. Anote o URL do container (ex: `sgtm.21go.site`)
4. No GTM Web, vá em Admin > Container Settings
5. Em "Server Container URL", cole a URL do Stape

### Tags no GTM Server

#### Meta CAPI (Conversions API)
- Template: Facebook CAPI (do Stape)
- Access Token: (gerar no Meta Business Suite)
- Pixel ID: (mesmo do client-side)
- Eventos:
  - PageView → trigger: page_view
  - InitiateCheckout → trigger: cotacao_inicio
  - Lead → trigger: cotacao_completa (com value)
  - Contact → trigger: whatsapp_click
- IMPORTANTE: event_id deve ser passado para deduplicação

#### GA4 Server
- Template: GA4 (do Stape)
- Measurement ID: (mesmo do client)
- Encaminhar todos os eventos do client

#### Cookie Keeper (Stape)
- Ativar para manter cookies first-party via server
- Importante para Safari/iOS (ITP limits)

---

## 8. Cookies First-Party

O site salva automaticamente:

| Cookie | Conteúdo | Duração |
|--------|----------|---------|
| `_21go_gclid` | Google Click ID | 90 dias |
| `_21go_fbclid` | Meta Click ID | 90 dias |
| `_21go_gbraid` | Google App Click ID | 90 dias |
| `_21go_fbc` | Meta formatted (_fbc) | 90 dias |
| `_21go_utm` | JSON com UTMs | 90 dias |

Backup em `localStorage` para redundância.

---

## 9. Offline Conversion (Futuro — CRM)

Quando o vendedor fechar uma venda no CRM:

1. CRM busca o lead com GCLID/FBCLID salvos
2. Envia para Google Ads API: `uploadClickConversions`
   - gclid + conversion_action + value + timestamp
3. Envia para Meta CAPI: `Purchase` event
   - fbclid + _fbc + value + email_hash + phone_hash
4. Algoritmos aprendem: "esse tipo de clique = cliente R$X/mês"

### Pré-requisitos:
- GCLID/FBCLID devem estar salvos no lead (capturados via cookies do site)
- Google Ads API credentials (OAuth2)
- Meta CAPI Access Token + Pixel ID

---

## 10. UTMs Padrão

| Canal | utm_source | utm_medium | utm_campaign |
|-------|-----------|-----------|-------------|
| Google Ads | google | cpc | [nome_campanha] |
| Meta Ads | meta | paid_social | [nome_campanha] |
| Orgânico | google | organic | — |
| MGM | mgm | referral | indicacao |
| WhatsApp | whatsapp | direct | — |

---

## 11. Validação

Antes de ir pra produção, testar:

1. **GTM Preview Mode**: Verificar se todos os 4 eventos disparam
2. **Meta Pixel Helper**: Chrome extension — verificar PageView, InitiateCheckout, Lead, Contact
3. **GA4 DebugView**: Verificar eventos em tempo real
4. **Google Tag Assistant**: Verificar Google Ads tag
5. **Stape Logs**: Verificar eventos server-side
6. **Meta Events Manager > Test Events**: Verificar CAPI

### Checklist de validação:
- [ ] GTM container carrega em todas as páginas
- [ ] page_view dispara ao entrar no site
- [ ] cotacao_inicio dispara ao clicar "Ver Cotação"
- [ ] cotacao_completa dispara ao ver resultado com preços
- [ ] whatsapp_click dispara ao clicar "Contratar pelo WhatsApp"
- [ ] gclid/fbclid são salvos em cookie ao chegar com ?gclid=xxx
- [ ] UTMs são salvos em cookie ao chegar com ?utm_source=xxx
- [ ] event_id único em cada evento (para deduplicação)
- [ ] Meta Pixel dispara PageView, InitiateCheckout, Lead, Contact
- [ ] Stape recebe e encaminha eventos para Meta CAPI
