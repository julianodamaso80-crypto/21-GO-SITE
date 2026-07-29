/**
 * Mídia cinematográfica do redesign (Higgsfield · Seedance 2.0 / Cinema Studio 2.5).
 *
 * Masters 1080p gerados em 2026-07-29 e otimizados (AV1 WebM + H.264 MP4 +
 * posters AVIF/WebP). Os arquivos são servidos de `MEDIA_BASE`:
 *  - Produção/preview: CDN (arquivos hospedados) OU `/media` quando o zip
 *    `21go-media-otimizada.zip` for extraído em `public/media` no build
 *    (ver Dockerfile — etapa "media").
 *  - `NEXT_PUBLIC_MEDIA_BASE` sobrescreve a base quando definido.
 *
 * NUNCA colocar texto, preço, logo ou CTA dentro dos vídeos — todo texto é
 * HTML real sobreposto (regra do manual do projeto).
 */

export const MEDIA_BASE =
  process.env.NEXT_PUBLIC_MEDIA_BASE && process.env.NEXT_PUBLIC_MEDIA_BASE.length > 0
    ? process.env.NEXT_PUBLIC_MEDIA_BASE.replace(/\/$/, '')
    : '/media'

export interface CinematicClip {
  /** id curto usado nos data-attrs */
  id: string
  /** WebM AV1 1080p (desktop, preferido) */
  webm1080: string
  /** MP4 H.264 1080p (desktop, fallback) */
  mp41080: string
  /** MP4 H.264 720p (mobile) */
  mp4720: string
  /** Poster AVIF 1920w */
  posterAvif: string
  /** Poster WebP 1920w */
  posterWebp: string
  /** Poster AVIF 960w (mobile) */
  posterAvifMobile: string
  /** Poster WebP 960w (mobile) */
  posterWebpMobile: string
  /** Descrição da cena (alt/aria) */
  alt: string
}

function clip(name: string, alt: string): CinematicClip {
  return {
    id: name,
    webm1080: `${MEDIA_BASE}/${name}-1080.webm`,
    mp41080: `${MEDIA_BASE}/${name}-1080.mp4`,
    mp4720: `${MEDIA_BASE}/${name}-720.mp4`,
    posterAvif: `${MEDIA_BASE}/${name}-poster-1920.avif`,
    posterWebp: `${MEDIA_BASE}/${name}-poster-1920.webp`,
    posterAvifMobile: `${MEDIA_BASE}/${name}-poster-960.avif`,
    posterWebpMobile: `${MEDIA_BASE}/${name}-poster-960.webp`,
    alt,
  }
}

export const CLIPS = {
  hero: clip(
    'clip1-hero',
    'Automóvel protegido na garagem de uma residência ao anoitecer, câmera revela a casa iluminada'
  ),
  rua: clip(
    'clip2-rua',
    'Carro circulando por rua residencial do Rio de Janeiro no início da noite'
  ),
  assistencia: clip(
    'clip3-assistencia',
    'Profissional de assistência 24h trocando pneu com guincho de plataforma ao fundo'
  ),
  vistoria: clip(
    'clip4-vistoria',
    'Vistoria fotográfica do veículo em oficina profissional organizada'
  ),
  familia: clip(
    'clip5-familia',
    'Veículo retornando à residência iluminada e acolhedora ao anoitecer'
  ),
  cta: clip(
    'clip6-cta',
    'Garagem da residência protegida ao anoitecer, cena estável'
  ),
} as const

/** Imagem-mestre (cenário) — usada como fundo estático de apoio */
export const MASTER_IMAGE = {
  avif2560: `${MEDIA_BASE}/master-2560.avif`,
  webp2560: `${MEDIA_BASE}/master-2560.webp`,
  avif1280: `${MEDIA_BASE}/master-1280.avif`,
  webp1280: `${MEDIA_BASE}/master-1280.webp`,
  jpg1920: `${MEDIA_BASE}/master-1920.jpg`,
}
