import type { NextConfig } from 'next'

/**
 * PREVIEW_EXPORT=1 (usado SOMENTE no workflow de preview do GitHub Pages):
 * gera build estatico com basePath. Producao (EasyPanel/Docker) continua
 * identica: output 'standalone'.
 */
const isPreviewExport = process.env.PREVIEW_EXPORT === '1'

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
          ]
        },
      }),
}

export default nextConfig
