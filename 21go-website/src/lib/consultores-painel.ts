/**
 * Quem tem painel de parceiro, e em qual endereco.
 *
 * Mora no codigo, e nao no banco, pelo mesmo motivo do `PIXEL_POR_CONSULTOR` e
 * do `VIDEO_POR_CONSULTOR`: o middleware le isto a cada request e uma consulta
 * por pageview num banco compartilhado com o CRM ja derrubou a gravacao de lead
 * do site uma vez.
 *
 * ⚠️ `painel.21go.com.br` NAO serve pra isto: aquele endereco ja e o controle
 * de acesso da recepcao (container `painel21go`). Por isso o padrao e um
 * subdominio por parceiro.
 *
 * Parceiro novo = 3 passos aditivos: registro A no Cloudflare apontando pra
 * 56.126.48.234 DNS-ONLY (proxied quebra a emissao do certificado pelo Caddy),
 * bloco novo no /etc/caddy/Caddyfile com reverse_proxy 127.0.0.1:3100, e uma
 * linha aqui.
 */
export const PAINEL_POR_HOST: Record<string, string> = {
  'parceiroanderson.21go.com.br': 'andersonagripino',
}

/**
 * Os consultores cujo site aceita `/<slug>/<vendedor>`. Derivado do mapa acima
 * de proposito: um painel sem link de divulgacao, ou um link sem painel pra
 * conferir o resultado, seria meia funcionalidade.
 */
export const PAINEL_POR_CONSULTOR = new Set(Object.values(PAINEL_POR_HOST))

/**
 * Quem trouxe a visita. Vive 30 dias, ao contrario do `c21go_dono` (que e de
 * sessao): o dono existe pra sobreviver a um clique perdido dentro da mesma
 * visita; este define quem recebe comissao, e o visitante costuma voltar
 * depois pra fechar.
 */
export const COOKIE_VENDEDOR = 'c21go_vend'
export const DIAS_COOKIE_VENDEDOR = 30
