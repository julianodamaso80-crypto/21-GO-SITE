# INVENTÁRIO DE MÍDIA — 21Go (redesign cinematográfico)

Data: 2026-07-29 · Todos os materiais abaixo JÁ FORAM gerados (Higgsfield, Seedance 2.0
a partir da imagem-mestre do Cinema Studio 2.5). **Nenhum crédito novo foi gasto nesta etapa.**

Fontes:
- Pacote otimizado (masters 1080p + posters): `21go-media-otimizada.zip`
  https://d2ol7oe51mr4n9.cloudfront.net/user_3GoeKQh1bDj5LzenOoPGmI2rV9E/a301d304-ad3b-468f-9788-5d272647414e.zip
- Masters originais 1920×1080 no Higgsfield (jobs): imagem-mestre `3617ffc3…`, clipes
  `d01a2e07…` (hero), `04fa2ba6…` (rua), `7b36c6b2…` (assistência), `3b6cd8bd…` (vistoria),
  `b18e3f52…` (família), `e09639a6…` (cta).
- Contact sheet (1º / meio / último quadro de cada cena):
  https://julianodamaso80-crypto.github.io/21-GO-SITE/contact-sheet-21go.jpg

## 1. Imagem-mestre (cenário de referência)

| Arquivo | Dimensões | Peso | Formato | Uso |
|---|---|---|---|---|
| master-2560.avif / .webp | 2560×1430 | 49KB / 144KB | AVIF/WebP | fundo estático de apoio |
| master-1280.avif / .webp | 1280×715 | 22KB / 49KB | AVIF/WebP | mobile |
| master-1920.jpg | 1920×1072 | 178KB | JPEG | fallback |

## 2. Clipes (masters otimizados) — todos 1920×1080 · 24fps · 8,042s · sem áudio

| # | Cena | Arquivo base | MP4 1080 (H.264) | WebM 1080 (AV1) | MP4 720 | Posters (1920/960 AVIF) |
|---|---|---|---|---|---|---|
| 1 | HERO — macro farol/garagem → revela casa | clip1-hero | 2.640.770 B | 704.265 B | 836.153 B | 19,5KB / 9,1KB |
| 2 | MOVIMENTO — carro em rua do RJ à noite | clip2-rua | 3.639.711 B | 1.488.613 B | 1.292.692 B | 42,8KB / 21,3KB |
| 3 | ASSISTÊNCIA — troca de pneu + guincho | clip3-assistencia | 3.479.138 B | 1.375.500 B | 1.139.434 B | 60,8KB / 28,8KB |
| 4 | VISTORIA — inspeção fotográfica na oficina | clip4-vistoria | 2.391.366 B | 1.163.131 B | 898.526 B | 67,3KB / 33,8KB |
| 5 | RETORNO — carro chega à residência | clip5-familia | 2.855.446 B | 1.019.136 B | 935.398 B | 38,2KB / 18,4KB |
| 6 | FINAL/CTA — garagem estável (chave/mesa) | clip6-cta | 1.863.790 B | 643.884 B | 605.141 B | 38,3KB / 17,0KB |

Codecs: H.264 (yuv420p, faststart) · AV1 (SVT-AV1 CRF40) · posters AVIF/WebP.

## 3. Sequências de frames para o scroll-scrub (extraídas dos clipes acima)

Publicadas em `gh-pages` → servidas em `/21-GO-SITE/frames/…`

| Perfil | fps visual | Resolução | Frames/cena | Total | Peso total |
|---|---|---|---|---|---|
| Desktop (`frames/scene-01…06`) | 12 | 1280×720 WebP q55 | 97 | **582** | **19,5MB** (1,9–4,8MB por cena) |
| Mobile (`frames-mobile/…`) | 8 | 640×360 WebP q52 | 64 | **384** | **5,3MB** |

Nomes previsíveis: `scene-01/frame-0001.webp` … `frame-0097.webp`.
Carregamento: esqueleto da cena 1 (1 a cada 6) → cena 1 completa → cenas seguintes em ordem.

## 4. Primeiro / último quadro e continuidade entre cenas

Ver contact sheet (3 quadros por cena). Análise de continuidade — os 6 clipes foram
gerados com a MESMA referência (casa/carro/luz), mas de forma independente
(sem encadear o último quadro de um no primeiro do outro):

| Transição | Continuidade | Situação |
|---|---|---|
| 1 HERO (garagem) → 2 RUA | **QUEBRA** de local (garagem → rua). Mesmo carro/paleta. | mitigada no protótipo com dissolve curto (~6 frames) |
| 2 RUA → 3 ASSISTÊNCIA | plausível (rua à noite → acostamento à noite) | dissolve curto |
| 3 ASSISTÊNCIA → 4 VISTORIA | **QUEBRA** de local (rua → oficina) | dissolve curto |
| 4 VISTORIA → 5 RETORNO | **QUEBRA** de local (oficina → rua/casa) | dissolve curto |
| 5 RETORNO → 6 FINAL | boa (mesma residência/garagem) | dissolve curto |

**Transições que idealmente seriam regeneradas para continuidade perfeita
(SOMENTE com autorização expressa — nada foi gerado agora):**
1. Saída da garagem → rua (ponte 1→2)
2. Chegada do guincho/carro à oficina (ponte 3→4)
3. Saída da oficina → chegada em casa (ponte 4→5)

## 5. Outros ativos

- `public/images/presidente-900.png/.webp` — fotografia ORIGINAL do presidente,
  900×1164, recorte intacto, sem IA (265KB / 31KB).
- `public/logo21go.png`, `logo-21go-white.png` — logomarcas oficiais intactas.
