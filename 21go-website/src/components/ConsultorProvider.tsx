'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ROTAS_RESERVADAS } from '@/lib/rotas-reservadas'
import { ehHostDePainel } from '@/lib/consultores-painel'

/**
 * Quem e o dono do site que o visitante esta vendo.
 *
 * ─── Por que o slug sai do pathname, e nao de um header do servidor ─────────
 *
 * O caminho obvio seria o middleware injetar um header e o layout raiz ler com
 * `headers()`. So que `headers()` no layout raiz torna TODA rota dinamica — e o
 * site principal vive de prerender estatico (o TTFB de 70ms e o SEO dependem
 * disso). Cobrar esse preco do 21go.site inteiro pra servir os sites de
 * consultor seria trocar o que ja funciona pelo que ainda vai existir.
 *
 * O rewrite do middleware nao mexe na URL do navegador: quem entrou em
 * `/julianodamaso/cotacao` continua vendo esse endereco na barra, mesmo o
 * servidor tendo renderizado `/cotacao`. Entao o slug ja esta na URL, de graca,
 * sem tornar nada dinamico.
 *
 * ⚠️ Mas ele NAO esta no `usePathname()`. Medido em producao (11/08/2026):
 * com a pagina prerenderizada e o rewrite do middleware, `usePathname()`
 * devolve a rota RENDERIZADA (`/`), nao a que o visitante ve (`/testeqa`) —
 * `window.location.pathname` dizia `/testeqa` e o logo continuava apontando pra
 * `/` mesmo 3s depois de hidratar. Em `next dev` o mesmo codigo funcionava,
 * porque la nao ha prerender: foi um bug que so existia em producao.
 *
 * Por isso a fonte e `window.location.pathname`, com `usePathname()` servindo
 * so de gatilho pra reavaliar em navegacao client-side.
 *
 * O que ISTO nao cobre e o `noindex` — esse nao pode depender de hidratacao,
 * senao o Googlebot indexa antes. Ele e resolvido no middleware, via header
 * `X-Robots-Tag`, do lado do servidor.
 */
export interface ConsultorAtual {
  slug: string
  nome: string
  whatsapp: string
  /** Esconde a taxa de ativacao na tela de cotacao deste consultor. */
  ocultarAtivacao: boolean
}

const Ctx = createContext<ConsultorAtual | null>(null)

/** O slug visivel na URL, ou null se for o site da propria 21Go. */
export function slugDoPathname(pathname: string): string | null {
  const primeiro = pathname.split('/').filter(Boolean)[0]
  if (!primeiro) return null
  if (ROTAS_RESERVADAS.has(primeiro)) return null
  if (!/^[a-z0-9]{3,40}$/.test(primeiro)) return null
  return primeiro
}

export function ConsultorProvider({ children }: { children: React.ReactNode }) {
  // Gatilho, nao fonte: muda a cada navegacao client-side e faz o efeito abaixo
  // reavaliar a URL de verdade.
  const pathname = usePathname()
  const [slug, setSlug] = useState<string | null>(null)
  const [consultor, setConsultor] = useState<ConsultorAtual | null>(null)
  const [foraDoAr, setForaDoAr] = useState(false)

  // Roda depois da hidratacao — o HTML prerenderizado e o mesmo pra todo mundo,
  // entao ler a URL no primeiro render quebraria a hidratacao.
  useEffect(() => {
    // O painel tem host proprio (`parceiroanderson.21go.com.br`). La o 1o
    // segmento e `/app` ou `/cadastro`, que nao sao slug de ninguem: sem esta
    // saida, o provider buscava `/api/consultor/app`, tomava 404 e cobria o
    // painel inteiro com a tela de "pagina indisponivel".
    if (ehHostDePainel(window.location.hostname)) {
      setSlug(null)
      setForaDoAr(false)
      return
    }
    setSlug(slugDoPathname(window.location.pathname))
    setForaDoAr(false)
  }, [pathname])

  // Nome e WhatsApp so sao necessarios pros botoes de contato — o prefixo dos
  // links, que e a regra critica, depende so do slug e nao espera esta busca.
  useEffect(() => {
    if (!slug) {
      setConsultor(null)
      return
    }
    let vivo = true
    fetch(`/api/consultor/${slug}`)
      .then(async (r) => {
        if (!vivo) return
        // 404 aqui e slug que nao existe OU site cortado por falta de pagamento.
        // Sem este ramo, `/qualquercoisa` serviria a home da 21Go como se fosse
        // o site de alguem — e o site de um cancelado continuaria no ar.
        if (r.status === 404) {
          setForaDoAr(true)
          return
        }
        if (!r.ok) return
        const d = await r.json()
        if (vivo && d?.slug) setConsultor(d as ConsultorAtual)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [slug])

  // O slug entra no contexto na hora; nome/whatsapp chegam depois.
  const valor: ConsultorAtual | null = slug
    ? {
        slug,
        nome: consultor?.nome ?? '',
        whatsapp: consultor?.whatsapp ?? '',
        ocultarAtivacao: consultor?.ocultarAtivacao ?? false,
      }
    : null

  if (foraDoAr) return <SiteIndisponivel />

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/**
 * O que aparece em `21go.com.br/algumacoisa` quando esse "algumacoisa" nao e o
 * site de ninguem — nunca existiu, ou saiu do ar por falta de pagamento.
 *
 * Nao diz qual dos dois: se dissesse "cancelado por falta de pagamento", quem
 * abrisse o link antigo de um consultor ficaria sabendo que ele nao pagou.
 *
 * Sem CTA de cotacao: quem chegou por um link fora do ar nao faz simulacao aqui.
 */
function SiteIndisponivel() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#F8FAFC]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-[#1A2754] mb-3">Esta página não está disponível</h1>
        <p className="text-[#64748B]">O endereço que você abriu não está mais no ar.</p>
      </div>
    </div>
  )
}

export function useConsultor(): ConsultorAtual | null {
  return useContext(Ctx)
}

/**
 * Prefixa um caminho interno com o slug do consultor.
 *
 * Esta e a regra do dono, escrita uma vez so: *"uma vez que ele enviou o link,
 * esse link vai ser respeitado pra sempre, independente de onde ele clica"*. Se
 * o visitante entrou por `/julianodamaso`, clicar na logo tem que levar pra
 * `/julianodamaso`, nao pra home da 21Go — senao o consultor paga o anuncio e a
 * casa fica com o lead.
 *
 * Ancora (`#planos`), link externo, `mailto:` e `tel:` passam intactos.
 */
export function comSlug(href: string, slug: string | undefined): string {
  if (!slug) return href
  if (!href.startsWith('/')) return href
  if (href.startsWith('//')) return href
  return `/${slug}${href === '/' ? '' : href}`
}
