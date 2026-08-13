/**
 * Consultores que mandaram vídeo próprio pra home do site deles.
 *
 * Quem está neste mapa troca o hero do presidente por um hero de vídeo: menos
 * texto, o vídeo grande e o botão de simulação visível na MESMA dobra. Quem não
 * está continua vendo a home padrão da 21Go — o vídeo é exceção por consultor,
 * não mudança do site.
 *
 * Mesmo padrão do `PIXEL_POR_CONSULTOR`: mapa no código, escolhido pelo slug da
 * URL. Não vai ao banco — o hero é a primeira coisa que pinta na tela e uma
 * consulta por pageview num banco compartilhado com o CRM é exatamente o que já
 * derrubou a gravação de lead do site.
 */
export interface VideoConsultor {
  /** MP4 H.264 (faststart) servido do próprio domínio, em `public/consultores/`. */
  mp4: string
  /** Primeiro quadro — pinta antes do vídeo carregar. */
  poster: string
  /** Headline curta do hero: com vídeo, o texto encolhe pra sobrar tela. */
  titulo: string
  destaque: string
  subtitulo: string
}

export const VIDEO_POR_CONSULTOR: Record<string, VideoConsultor> = {
  manghi: {
    mp4: '/consultores/manghi/apresentacao.mp4',
    poster: '/consultores/manghi/poster.jpg',
    titulo: 'Proteja seu carro ou sua moto',
    destaque: 'sem burocracia',
    subtitulo: 'Simulação grátis em 1 minuto.',
  },
}

export function videoDoConsultor(slug: string | undefined | null): VideoConsultor | null {
  if (!slug) return null
  return VIDEO_POR_CONSULTOR[slug] ?? null
}
