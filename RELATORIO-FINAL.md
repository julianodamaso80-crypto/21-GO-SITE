# RELATÓRIO FINAL — Redesign Cinematográfico 21Go

Data: 2026-07-31 · Repositório: `julianodamaso80-crypto/21-GO-SITE` · Branch publicada: `master` (commit `9f519d2`)

## 1. O que foi entregue

A home foi redesenhada em cima do site real, preservando 100% do conteúdo, das URLs, da cotação, dos links de WhatsApp e do analytics (GTM `GTM-WQ9L62XN`, Google Ads `AW-16811926370`, Meta Pixel — todos verificados ativos no build de produção).

**Hero do presidente.** O carro saiu da home. O presidente aparece GRANDE à direita, com o texto à esquerda. No desktop roda o vídeo dele mexendo a mão — gerado UMA única vez a partir da fotografia original (rosto, terno e relógio intactos, conferidos quadro a quadro) — em WebM AV1 de apenas 115KB, com MP4 de fallback. No celular entra a fotografia original em WebP (31KB). O vídeo roda sempre no desktop (decisão do proprietário), pausa fora da tela e some no modo economia de dados.

**Rolagem 3D na home.** Jornada cinematográfica real de scroll-scrub: canvas fixado (pin do ScrollTrigger), 4 cenas (rua → assistência → vistoria → retorno), frame controlado diretamente pela barra de rolagem — rolar para baixo avança, rolar para cima volta. Desktop: 97 frames/cena em 1280×720; celular: 64 frames/cena em 640×360. Textos em HTML real sincronizados por janelas de progresso. O protótipo completo de 6 cenas continua em `/preview-scroll-3d` (noindex).

**Nenhum crédito novo do Higgsfield foi gasto nesta etapa final.** Toda a mídia usada já existia; ela agora está versionada no próprio repositório (`public/media`, `public/frames`, `public/frames-mobile`, ~60MB), e o Dockerfile não depende mais de download externo — o build de produção ficou determinístico.

## 2. Velocidade (a queixa: "site antigo travando, muito pesado")

Medições no build de produção real (standalone, mesmo Docker da EasyPanel), Chromium local:

| Métrica | Antes desta rodada | Agora |
|---|---|---|
| Peso inicial da home (celular 390px) | ~4,3MB / 250 requisições | **337KB / ~26 requisições** |
| Peso inicial da home (desktop 1366px) | ~9,2MB | **483KB** |
| Load local | ~3,8s | **~0,9–1,1s** |
| Erros de console | 404s de rodapé/blog | **zero** |

Principais causas atacadas: os frames da rolagem 3D carregavam todos no load — agora só começam a baixar no primeiro gesto de rolagem, ou 2,5s depois do load com a rede ociosa, ou se a seção já estiver visível (deep-link). Vídeos de fundo com `preload="none"` e fontes anexadas só quando a cena se aproxima. Redesenhos do canvas suprimidos durante o pré-carregamento. Somam-se as otimizações que chegaram do outro fluxo de trabalho e foram integradas no merge: `content-visibility` nas seções fora da tela, blur decorativo reduzido no celular, blog paginado, ícones leves.

## 3. Responsivo (99% dos clientes no celular)

Matriz final verificada no build publicado: 8 larguras (320, 360, 390, 414, 768, 1024, 1366, 1920px) × 4 páginas (home, cotação, artigo de blog, proteção veicular) — **zero pan horizontal** em todas. Artigo de blog corrigido no celular (tabelas roláveis, quebra de palavras, `min-w-0`), `overflow-x: clip` global.

## 4. Correções de links (auditoria)

Os links do rodapé que davam 404 no site antigo agora respondem: `/termos-de-uso` e `/politica-privacidade` → `/conformidade-legal` (308), `/contato` e `/area-do-associado` → WhatsApp via `/api/wa` (307). Nenhum conteúdo jurídico foi inventado. O card do blog na home que apontava para artigo inexistente agora aponta para o artigo real "10 Truques de Ladrão de Carro".

## 5. Integração com o trabalho recente de produção

O `master` remoto tinha 5 commits novos (Amarok na lista de exclusão, fim do limite de 3 simulações, blog paginado, perf mobile). Tudo foi integrado por merge — nada foi sobrescrito ou perdido — e o conjunto foi rebuildado e re-testado antes do push.

## 6. Como publicar / reverter

- **Publicar (último passo, manual):** Easypanel `http://167.71.31.77:3000` → projeto **social-21go** → serviço **site** → botão verde **"Implantar"**. O build usa o `master` já atualizado.
- **Reverter:** `git revert -m 1 9f519d2 && git push` (ou implantar o commit `1b0b374` anterior). O snapshot original de antes do redesign está preservado em `e2bf3ab` e no espelho `backup-bare.git`.

## 7. Pré-visualização

GitHub Pages (sem analytics, com basePath): https://julianodamaso80-crypto.github.io/21-GO-SITE/ — protótipo completo em `/preview-scroll-3d/` (use `?motion=1` se o Windows estiver com animações reduzidas).

## 8. Pendências conhecidas (não bloqueiam)

Canonical/OG apontam para `21go.site` (comportamento herdado do site atual — decidir domínio definitivo). Transições de continuidade perfeita entre cenas exigiriam 3 clipes-ponte novos no Higgsfield — **não gerados**, pois dependem de autorização expressa para gastar créditos.
