/**
 * Consultores que pediram pra divulgar o proprio Instagram no site deles.
 *
 * Quem esta neste mapa ganha um botao de Instagram no header do site dele
 * (`21go.com.br/<slug>`), apontando pro perfil DELE. Quem nao esta continua com
 * o header padrao da 21Go — o botao e excecao por consultor, nao mudanca do
 * site.
 *
 * Mesmo padrao do `PIXEL_POR_CONSULTOR` e do `VIDEO_POR_CONSULTOR`: mapa no
 * codigo, escolhido pelo slug da URL. Nao vai ao banco — perfil publico nao
 * justifica coluna nova numa tabela compartilhada com o CRM.
 */
export const INSTAGRAM_POR_CONSULTOR: Record<string, string> = {
  mauricioconsultoria: 'https://www.instagram.com/mauricioteixeiraoficial',
}

export function instagramDoConsultor(slug: string | undefined | null): string | null {
  if (!slug) return null
  return INSTAGRAM_POR_CONSULTOR[slug] ?? null
}
