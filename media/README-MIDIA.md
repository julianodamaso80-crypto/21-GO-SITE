# Mídia cinematográfica (clipes + posters)

Os arquivos desta pasta NÃO ficam no git (30MB). Eles são baixados
automaticamente no build Docker (ver Dockerfile, etapa "Mídia cinematográfica")
a partir do pacote otimizado:

  21go-media-otimizada.zip
  https://d2ol7oe51mr4n9.cloudfront.net/user_3GoeKQh1bDj5LzenOoPGmI2rV9E/a301d304-ad3b-468f-9788-5d272647414e.zip

Para desenvolvimento local: baixe o zip acima e extraia aqui
(public/media/*.webm|mp4|avif|webp|jpg). Sem os arquivos, o site degrada
para posters/gradientes automaticamente (componente SceneVideo).

Conteúdo: 6 clipes (clip1-hero … clip6-cta) em WebM AV1 1080p, MP4 H.264
1080p e 720p, posters AVIF/WebP 1920/960, e imagem-mestre (master-*).
Masters 4K/1080p brutos: gerados via Higgsfield (Seedance 2.0) em 2026-07-29.
