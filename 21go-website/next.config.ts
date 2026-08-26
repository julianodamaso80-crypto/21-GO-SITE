import type { NextConfig } from 'next'

/**
 * PREVIEW_EXPORT=1 (usado SOMENTE no workflow de preview do GitHub Pages):
 * gera build estatico com basePath. Producao (EasyPanel/Docker) continua
 * identica: output 'standalone'.
 */
const isPreviewExport = process.env.PREVIEW_EXPORT === '1'

/**
 * Consolidacao de clusters canibais do blog.
 *
 * A esteira SEO gerou dezenas de posts quase identicos sobre os mesmos temas: o
 * Agente 02 marcava a pauta como duplicada e o worker publicava artigo novo assim
 * mesmo (corrigido em BLOG/seo-worker). Em 90 dias o cluster "remarcado" somou 12
 * URLs, 2.034 impressoes e 3 cliques — com varias paginas empatadas, o Google nao
 * promove nenhuma.
 *
 * Este mapa aponta SEMPRE pro destino final. Nao encadear 301: a consolidacao de
 * 08/08 mandava pra paginas que a de 13/08 tambem redirecionou, criando saltos em
 * cadeia que desperdicam crawl e diluem o sinal.
 *
 * Sobram DOIS pilares no cluster remarcado, com intencoes de busca diferentes:
 *   veiculo-remarcado-o-que-e-tem-protecao   -> "o que e remarcado" (710 impressoes)
 *   carro-rm-no-rio-entenda-a-classificacao  -> a sigla "RM" (1o lugar hoje no Google)
 */
const PILAR_REMARCADO = 'veiculo-remarcado-o-que-e-tem-protecao'
const PILAR_RM = 'carro-rm-no-rio-entenda-a-classificacao-e-suas-implicacoes'
const PILAR_BYD = 'seguro-byd-protecao-veicular-guia-completo'

const BLOG_CONSOLIDACOES = Object.entries({
  // -- tudo que fala do ESTADO "remarcado" cai no pilar do tema --
  'carro-remarcado-no-rj-protecao-veicular-e-compra-segura': PILAR_REMARCADO,
  'carro-remarcado-no-rj-entenda-riscos-e-proteja-seu-veiculo': PILAR_REMARCADO,
  'carro-remarcado-no-rj-entenda-o-que-e-e-seus-riscos': PILAR_REMARCADO,
  'chassi-remarcado-no-rj-legalidade-riscos-e-como-consultar': PILAR_REMARCADO,
  'chassi-remarcado-no-rj-riscos-legalidade-e-protecao-veicular': PILAR_REMARCADO,
  'chassi-remarcado-no-rj-legalidade-regularizacao-e-implicacoes': PILAR_REMARCADO,
  'chassi-remarcado-no-rj-entenda-implicacoes-e-protecao-veicular': PILAR_REMARCADO,
  'motor-remarcado-rj-legalidade-venda-e-protecao-veicular': PILAR_REMARCADO,
  'motor-remarcado-no-rj-entenda-impactos-e-legalidade-no-veiculo': PILAR_REMARCADO,
  'veiculo-remarcado-no-rj-protecao-veicular-para-seu-carro': PILAR_REMARCADO,
  // -- quem busca a SIGLA tem intencao propria e cai no outro pilar --
  'rm-no-documento-do-veiculo-no-rj-o-que-significa': PILAR_RM,
  // -- cluster BYD/eletrico (21/08) --
  // 22 artigos disputavam o tema e SEIS respondiam a mesma pergunta ("protecao
  // veicular pra BYD/eletrico"), todos entre a 5a e a 8a posicao com ~0 clique.
  // O pilar novo (seguro-byd-protecao-veicular-guia-completo) assume a intencao
  // "seguro/protecao de BYD", que e o termo que o dono quer dominar e onde nao
  // haviamos nenhuma query rankeando. Ficam de fora da consolidacao os artigos com
  // intencao PROPRIA (bateria, oficina, recarga, revisao, roubo, recorte RJ).
  'protecao-veicular-byd-dolphin-custo-cobertura-e-alternativas': PILAR_BYD,
  'protecao-veicular-para-carro-eletrico-byd-alternativa-ao-seguro': PILAR_BYD,
  'protecao-veicular-byd-seal-alternativa-ao-seguro-alto-custo': PILAR_BYD,
  'protecao-veicular-para-carros-hibridos-e-eletricos-guia-completo': PILAR_BYD,
  'carro-eletrico-21go-protege-sim': PILAR_BYD,
  // -- recarga de eletrico (05/08): dois artigos do mesmo dia respondiam a mesma
  //    pergunta ("onde carregar meu eletrico"). Fica o que fala de BYD, o publico-alvo.
  'mapa-de-pontos-de-recarga-para-carros-eletricos-onde-carregar':
    'apps-para-encontrar-pontos-de-recarga-byd-guia-completo-2',
  // -- REMOVIDO POR INFORMACAO FALSA (25/08/2026) --
  // O artigo inteiro afirmava que a 21Go nao cobra taxa de adesao. A 21Go SEMPRE
  // cobrou: a taxa de ativacao e calculada na cotacao (max(plano, VIP) + R$ 50).
  // O texto ja tinha virado fonte da Visao Geral de IA do Google, que respondia
  // "Nao, a 21Go nao cobra taxa de adesao" citando 21go.site. Nao reescrever:
  // a keyword inteira ("protecao veicular sem adesao") promete o que nao existe.
  'protecao-veicular-sem-adesao-no-rj-economia-e-seguranca':
    'quanto-custa-protecao-veicular',
}).map(([de, para]) => ({
  source: `/blog/${de}`,
  destination: `/blog/${para}`,
  permanent: true,
}))

const nextConfig: NextConfig = {
  output: isPreviewExport ? 'export' : 'standalone',
  // `pg` fala TCP/TLS direto e nao pode ser empacotado pelo bundler — e o plano B de gravacao
  // de lead quando a API REST do Supabase cai (ver src/lib/supabase-direto.ts).
  serverExternalPackages: ['pg'],
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
            // www -> raiz (301). O canonical ja apontava certo, mas o Google seguia
            // indexando as duas versoes: no Search Console as URLs com www aparecem com
            // impressoes PROPRIAS (108 numa unica pagina), ou seja, a autoridade estava
            // sendo dividida entre dois enderecos do mesmo site.
            {
              source: '/:path*',
              has: [{ type: 'host', value: 'www.21go.site' }],
              destination: 'https://21go.site/:path*',
              permanent: true,
            },
            {
              source: '/:path*',
              has: [{ type: 'host', value: 'www.21goconsultoraleticya.site' }],
              destination: 'https://21goconsultoraleticya.site/:path*',
              permanent: true,
            },
            { source: '/termos-de-uso', destination: '/conformidade-legal', permanent: true },
            { source: '/politica-privacidade', destination: '/conformidade-legal', permanent: true },
            // Nada de mandar direto pro WhatsApp (ordem do dono, 07/08/2026):
            // esses dois redirects despejavam gente anônima no chip. Agora caem
            // em páginas com formulário — o contato só abre depois de preenchido.
            { source: '/contato', destination: '/cotacao', permanent: false },
            { source: '/area-do-associado', destination: '/faq', permanent: false },
            ...BLOG_CONSOLIDACOES,
          ]
        },
      }),
}

export default nextConfig
