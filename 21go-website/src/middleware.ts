import { NextRequest, NextResponse } from 'next/server'
import { ROTAS_RESERVADAS } from '@/lib/rotas-reservadas'
import { VIDEO_POR_CONSULTOR } from '@/lib/consultores-video'
import {
  PAINEL_POR_HOST,
  PAINEL_POR_CONSULTOR,
  COOKIE_VENDEDOR,
  DIAS_COOKIE_VENDEDOR,
} from '@/lib/consultores-painel'
import { painelDoHost, vendedorDoCaminho } from '@/lib/painel/rotas'

/**
 * Site por consultor: `21go.com.br/julianodamaso` serve o MESMO site de sempre,
 * so que carimbado no nome dele.
 *
 * O truque: `/julianodamaso/cotacao` e reescrito pra `/cotacao`. Nenhuma pagina
 * precisou ser duplicada — um app serve N sites. E o rewrite nao mexe na URL do
 * navegador, entao o cliente continua vendo `/julianodamaso/cotacao` e consegue
 * ler o slug de la (ver ConsultorProvider).
 *
 * Este middleware NAO consulta o banco. Ele roda em toda navegacao, e uma
 * consulta por pageview num banco compartilhado com o CRM e exatamente o tipo de
 * carga que ja derrubou a gravacao de lead do site. Aqui so decidimos "isto
 * parece um slug ou e uma rota do site?" — quem confere se o consultor existe de
 * fato e a pagina, com cache.
 */

/**
 * So letras e numeros, 3 a 40. Bate com `slugDoNome` ("Juliano Damaso" ->
 * "julianodamaso") e recusa qualquer coisa com ponto, barra ou hifen — assim um
 * caminho estranho vira 404 normal em vez de virar site de consultor fantasma.
 */
const FORMATO_SLUG = /^[a-z0-9]{3,40}$/

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  /**
   * `meusite.21go.com.br` e a porta de entrada da VENDA do site — o endereco que
   * o consultor recebe no grupo, no lugar do antigo `crm21go.site/quero-site`.
   *
   * Serve `/quero-site` em qualquer caminho de proposito: quem digita o endereco
   * de cabeca erra ("/meusite", "/quero"), e mandar essa pessoa pra um 404
   * perderia uma venda por um detalhe de digitacao. Vem antes da logica de slug
   * pra que `meusite.../qualquercoisa` nunca seja lido como site de consultor.
   */
  if (req.headers.get('host')?.startsWith('meusite.')) {
    if (pathname === '/quero-site') return NextResponse.next()
    return NextResponse.rewrite(new URL(`/quero-site${search}`, req.url))
  }

  /**
   * `parceiroanderson.21go.com.br` — o painel do parceiro.
   *
   * Vem antes da logica de slug pelo mesmo motivo do `meusite.`: nada num host
   * de painel pode ser lido como site de consultor. O slug sai do HOST, nunca
   * da URL, e as rotas ainda conferem contra a sessao.
   */
  const slugDoPainel = painelDoHost(req.headers.get('host') ?? '', PAINEL_POR_HOST)
  if (slugDoPainel) {
    const res = NextResponse.rewrite(
      new URL(`/painel/${slugDoPainel}${pathname === '/' ? '' : pathname}${search}`, req.url),
    )
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  const segmentos = pathname.split('/').filter(Boolean)
  const primeiro = segmentos[0]

  /**
   * `/ConsultorFulano` e o mesmo endereco que `/consultorfulano`.
   *
   * O slug no banco e sempre minusculo (o formulario so aceita `[a-z0-9]`), mas
   * o consultor divulga como escreveu no cartao e na bio. Ate 27/08/2026 essa
   * URL dava 404 puro — o link que ele espalhou simplesmente nao abria.
   *
   * Redireciona em vez de servir nas duas grafias: se a pagina abrisse com a URL
   * como foi digitada, os links dela nasceriam com maiuscula e
   * `/api/wa?c=ConsultorFulano` nao acharia ninguem no banco — o contato e o
   * lead cairiam na casa, que e exatamente a REGRA 0.1. Uma grafia so no
   * sistema inteiro, e a de fora vira atalho.
   */
  if (primeiro && primeiro !== primeiro.toLowerCase() && FORMATO_SLUG.test(primeiro.toLowerCase())) {
    const url = req.nextUrl.clone()
    url.pathname = '/' + [primeiro.toLowerCase(), ...segmentos.slice(1)].join('/')
    return NextResponse.redirect(url, 308)
  }

  // `/c/<slug>` e o destino interno do rewrite abaixo. Quem chega nele digitando
  // ve o site normalmente, mas ele nao pode indexar: seria a home do consultor
  // no indice do Google com outro endereco, competindo com o 21go.site.
  if (primeiro === 'c') {
    const res = NextResponse.next()
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    if (segmentos[1]) marcarDono(res, segmentos[1])
    return res
  }

  if (!primeiro || ROTAS_RESERVADAS.has(primeiro) || !FORMATO_SLUG.test(primeiro)) {
    /**
     * Quem entrou pelo site de um consultor VOLTA pro site dele.
     *
     * Regra do dono (12/08/2026): *"uma vez que ele enviou o link, esse link vai
     * ser respeitado pra sempre, independente de onde ele clica"*.
     *
     * O logo aponta pra `/` no HTML prerenderizado e so vira `/<slug>` depois da
     * hidratacao. Quem clica antes disso caia na home da CASA — o consultor
     * pagou o anuncio e a casa ficava com a visita. Aqui o servidor devolve, sem
     * depender de hidratacao nenhuma.
     *
     * So a HOME redireciona. As outras paginas da casa (`/cotacao`, `/faq`)
     * seguem servindo normalmente: o lead e o botao de WhatsApp ja voltam pro
     * dono pelo cookie (ver `/api/vehicle/lead` e `/api/wa`), e redirecionar
     * tudo quebraria fluxos que sao da casa de proposito — `/quero-site`, por
     * exemplo, e onde o proprio consultor compra o site.
     */
    const dono = req.cookies.get(COOKIE_DONO)?.value
    if (pathname === '/' && dono && FORMATO_SLUG.test(dono)) {
      return NextResponse.redirect(new URL(`/${dono}${search}`, req.url))
    }
    return NextResponse.next()
  }

  /**
   * A HOME de quem tem vídeo próprio vai pra uma cópia prerenderizada com o
   * vídeo já dentro (`/c/<slug>`), em vez da home comum.
   *
   * Sem isto, o hero do presidente aparecia primeiro e só depois da hidratação
   * dava lugar ao vídeo — parecia que o visitante ia entrar no site antigo. As
   * outras páginas dele (`/<slug>/cotacao`) não mudam: o hero só existe na home.
   */
  /**
   * `/andersonagripino/juliano` — o link do divulgador.
   *
   * So pra quem tem painel: sem este corte, `/manghi/qualquercoisa` deixaria de
   * ser 404 nos outros 17 sites vendidos, e um erro de digitacao passaria a
   * servir a home como se fosse pagina de alguem.
   *
   * O slug do vendedor NAO precisa sobreviver na URL: o cookie carrega a
   * atribuicao, a mesma rede que ja resolve a corrida de hidratacao da REGRA
   * 0.1. Por isso o rewrite manda pro caminho normal do site.
   */
  if (PAINEL_POR_CONSULTOR.has(primeiro)) {
    const doVendedor = vendedorDoCaminho(segmentos, ROTAS_RESERVADAS)
    if (doVendedor) {
      const res = NextResponse.rewrite(new URL(`${doVendedor.resto}${search}`, req.url))
      res.headers.set('X-Robots-Tag', 'noindex, nofollow')
      marcarDono(res, primeiro)
      res.cookies.set(COOKIE_VENDEDOR, doVendedor.vendedor, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        maxAge: DIAS_COOKIE_VENDEDOR * 24 * 60 * 60,
      })
      return res
    }
  }

  const ehHome = segmentos.length === 1
  const destinoPath =
    ehHome && primeiro in VIDEO_POR_CONSULTOR
      ? `/c/${primeiro}`
      : `/${segmentos.slice(1).join('/')}`

  // `/julianodamaso` -> `/` · `/julianodamaso/cotacao` -> `/cotacao`
  const destino = new URL(`${destinoPath}${search}`, req.url)
  const res = NextResponse.rewrite(destino)

  /**
   * O noindex TEM que sair daqui, do servidor.
   *
   * Sao centenas de copias da mesma pagina; indexadas, elas canibalizariam o
   * 21go.site — que ja vive so da busca pelo proprio nome e ja disputa com
   * outros dominios da propria 21Go. Como header, vale pro Googlebot na
   * primeira resposta, sem depender de hidratacao nem de metadata dinamica (que
   * custaria tornar o site inteiro dinamico).
   *
   * O site do consultor existe pra ele mandar link e rodar anuncio. Nao pra
   * ranquear.
   */
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  marcarDono(res, primeiro)
  return res
}

/**
 * Nome do cookie que diz de quem e a visita.
 *
 * ─── Por que um cookie, e nao so o slug da URL ──────────────────────────────
 *
 * O HTML das paginas e PRERENDERIZADO e compartilhado entre todos os sites: o
 * mesmo arquivo serve `/`, `/manghi` e `/regionalsp`. Entao os links dentro
 * dele nascem sem slug (`href="/cotacao"`), e o slug so entra depois que a
 * pagina hidrata e o ConsultorProvider le `window.location.pathname`.
 *
 * Isso abre uma CORRIDA: quem clica antes de hidratar sai de `/manghi` e cai em
 * `/cotacao` — a cotacao da CASA. Dali o lead nasce sem `consultorSlug`, vai
 * pro PowerLink da 21Go e o botao de WhatsApp cai no numero da casa. O
 * consultor que pagou pelo site perde o cliente, em silencio e de forma
 * intermitente (medido em 17/08/2026: leads de `/regionalsp` e `/paivarj21go`
 * chegaram certos e um teste em `/manghi` caiu na Leticya).
 *
 * O servidor, ao contrario do HTML, SEMPRE sabe de quem e a visita. Entao ele
 * carimba aqui, e `/api/wa` e `/api/vehicle/lead` leem este cookie quando o
 * slug nao veio pela URL. Nao depende de hidratacao nenhuma.
 *
 * Cookie de sessao de proposito: ele existe pra sobreviver ao clique perdido
 * dentro da MESMA visita, nao pra criar regra de atribuicao por N dias.
 */
export const COOKIE_DONO = 'c21go_dono'

function marcarDono(res: NextResponse, slug: string): void {
  res.cookies.set(COOKIE_DONO, slug, {
    path: '/',
    sameSite: 'lax',
    // Sem `httpOnly`: o ConsultorProvider tambem le, pra pintar o site certo.
    httpOnly: false,
  })
}

export const config = {
  // Fora: assets do Next, rotas de API e qualquer arquivo com extensao. Sem
  // isto, `/logo21go-72.png` seria lido como slug de consultor.
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
}
