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
}

export default nextConfig
