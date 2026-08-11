'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ROTAS_RESERVADAS } from '@/lib/rotas-reservadas'

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
 * servidor tendo renderizado `/cotacao`. Entao o slug ja esta no pathname, de
 * graca, sem tornar nada dinamico.
 *
 * O que ISTO nao cobre e o `noindex` — esse nao pode depender de hidratacao,
 * senao o Googlebot indexa antes. Ele e resolvido no middleware, via header
 * `X-Robots-Tag`, do lado do servidor.
 */
export interface ConsultorAtual {
  slug: string
  nome: string
  whatsapp: string
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
  const pathname = usePathname()
  const slug = slugDoPathname(pathname || '/')
  const [consultor, setConsultor] = useState<ConsultorAtual | null>(null)

  // Nome e WhatsApp so sao necessarios pros botoes de contato. O prefixo dos
  // links (que e a regra critica) depende so do slug e ja vale no primeiro
  // render, sem esperar esta busca.
  useEffect(() => {
    if (!slug) {
      setConsultor(null)
      return
    }
    let vivo = true
    fetch(`/api/consultor/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.slug) setConsultor(d as ConsultorAtual)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [slug])

  // O slug entra no contexto na hora; nome/whatsapp chegam depois.
  const valor: ConsultorAtual | null = slug
    ? { slug, nome: consultor?.nome ?? '', whatsapp: consultor?.whatsapp ?? '' }
    : null

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
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
