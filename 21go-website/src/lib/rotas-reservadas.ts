/**
 * As rotas de primeiro nivel que o site tem de verdade. O que NAO esta aqui e
 * candidato a slug de consultor (`21go.com.br/julianodamaso`).
 *
 * Mora sozinho num arquivo porque duas pontas dependem da mesma lista: o
 * middleware (servidor, decide o rewrite) e o ConsultorProvider (cliente, decide
 * se prefixa os links). Se as duas divergirem, o site do consultor quebra de um
 * jeito silencioso — links apontando pro lugar errado sem nenhum erro.
 *
 * ⚠️ Rota nova em `src/app/` PRECISA entrar aqui, senao ela vira slug e some do
 * ar. `scripts/verificar-rotas.mjs` roda no build e quebra o build se esta lista
 * divergir das pastas reais — nao e pra confiar na memoria de ninguem.
 */
export const ROTAS_RESERVADAS = new Set([
  'a-21go-e-confiavel',
  'api',
  'blog',
  'conformidade-legal',
  'cotacao',
  'criativos',
  'denuncia',
  'faq',
  'indique',
  'ouvidoria',
  'preview-scroll-3d',
  'protecao-veicular',
  'protecao-veicular-rj',
  'quero-site',
  'seja-consultor',
  'sobre',
  // Geradas por rota (robots.ts / sitemap.ts), nao por pasta.
  'robots.txt',
  'sitemap.xml',
])
