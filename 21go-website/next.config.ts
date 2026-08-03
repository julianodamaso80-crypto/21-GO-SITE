import type { NextConfig } from 'next'

/**
 * PREVIEW_EXPORT=1 (usado SOMENTE no workflow de preview do GitHub Pages):
 * gera build estatico com basePath. Producao (EasyPanel/Docker) continua
 * identica: output 'standalone'.
 */
const isPreviewExport = process.env.PREVIEW_EXPORT === '1'

/**
 * Consolidacao do cluster "remarcado" (2026-08-03).
 *
 * A esteira SEO gerou 11 posts quase identicos sobre o mesmo assunto — o Agente 02
 * marcava a pauta como duplicada e o worker publicava artigo novo assim mesmo
 * (corrigido em BLOG/seo-worker). Os 11 competiam entre si no Google, nenhum
 * passava de 0-2 cliques.
 *
 * Mantemos o de maior alcance em cada grupo e redirecionamos os demais com 301,
 * concentrando autoridade sem perder as URLs ja indexadas. Vencedor escolhido por
 * impressoes no GSC (90 dias) — os cliques eram ~0 em todos, entao impressao e o
 * unico sinal com volume.
 */
const BLOG_CONSOLIDACOES = [
  // grupo "carro remarcado" -> 51 impressoes
  'carro-remarcado-no-rj-protecao-veicular-e-compra-segura',
  'carro-remarcado-no-rj-entenda-riscos-e-proteja-seu-veiculo',
].map((slug) => ({
  source: `/blog/${slug}`,
  destination: '/blog/carro-remarcado-no-rj-entenda-o-que-e-e-seus-riscos',
  permanent: true,
})).concat(
  // grupo "chassi remarcado" -> 73 impressoes
  [
    'chassi-remarcado-no-rj-legalidade-riscos-e-como-consultar',
    'chassi-remarcado-no-rj-riscos-legalidade-e-protecao-veicular',
    'chassi-remarcado-no-rj-legalidade-regularizacao-e-implicacoes',
  ].map((slug) => ({
    source: `/blog/${slug}`,
    destination: '/blog/chassi-remarcado-no-rj-entenda-implicacoes-e-protecao-veicular',
    permanent: true,
  })),
  // grupo "motor remarcado" -> 46 impressoes, posicao 8.6
  [
    'motor-remarcado-rj-legalidade-venda-e-protecao-veicular',
  ].map((slug) => ({
    source: `/blog/${slug}`,
    destination: '/blog/motor-remarcado-no-rj-entenda-impactos-e-legalidade-no-veiculo',
    permanent: true,
  })),
  // grupo "veiculo remarcado" -> 622 impressoes (de longe o mais forte do cluster)
  [
    'veiculo-remarcado-no-rj-protecao-veicular-para-seu-carro',
  ].map((slug) => ({
    source: `/blog/${slug}`,
    destination: '/blog/veiculo-remarcado-o-que-e-tem-protecao',
    permanent: true,
  })),
)

const nextConfig: NextConfig = {
  output: isPreviewExport ? 'export' : 'standalone',
  ...(isPreviewExport && process.env.BASE_PATH
    ? { basePath: process.env.BASE_PATH }
    : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
  // Links antigos do rodapé que davam 404 no site (auditoria 2026-07-29).
  // Sem inventar conteúdo jurídico: apontam para páginas/canais REAIS.
  ...(isPreviewExport
    ? {}
    : {
        async redirects() {
          return [
            { source: '/termos-de-uso', destination: '/conformidade-legal', permanent: true },
            { source: '/politica-privacidade', destination: '/conformidade-legal', permanent: true },
            { source: '/contato', destination: '/api/wa', permanent: false },
            { source: '/area-do-associado', destination: '/api/wa', permanent: false },
            ...BLOG_CONSOLIDACOES,
          ]
        },
      }),
}

export default nextConfig
