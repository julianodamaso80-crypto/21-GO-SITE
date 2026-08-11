import { NextRequest, NextResponse } from 'next/server'
import { ROTAS_RESERVADAS } from '@/lib/rotas-reservadas'

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
  const segmentos = pathname.split('/').filter(Boolean)
  const primeiro = segmentos[0]

  if (!primeiro || ROTAS_RESERVADAS.has(primeiro) || !FORMATO_SLUG.test(primeiro)) {
    return NextResponse.next()
  }

  // `/julianodamaso` -> `/` · `/julianodamaso/cotacao` -> `/cotacao`
  const destino = new URL(`/${segmentos.slice(1).join('/')}${search}`, req.url)
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
  return res
}

export const config = {
  // Fora: assets do Next, rotas de API e qualquer arquivo com extensao. Sem
  // isto, `/logo21go-72.png` seria lido como slug de consultor.
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
}
