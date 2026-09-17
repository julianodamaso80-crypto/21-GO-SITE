/**
 * O blog e so dos `.site` (ordem do dono, 17/09/2026).
 *
 * O `21go.com.br` sai do MESMO container dos `.site`, entao ate hoje servia os
 * 300 artigos inteiros — inclusive dentro de cada site de consultor
 * (`21go.com.br/manghi/blog`). Os subdominios de painel e o `meusite.` sao
 * tratados antes no middleware e nunca chegam aqui.
 */
export const DOMINIO_SEM_BLOG = /(^|\.)21go\.com\.br(:\d+)?$/i

export function hostSemBlog(host: string | null | undefined): boolean {
  return DOMINIO_SEM_BLOG.test((host ?? '').trim())
}
