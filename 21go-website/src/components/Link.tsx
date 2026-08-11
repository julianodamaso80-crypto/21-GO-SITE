'use client'
import NextLink from 'next/link'
import type { ComponentProps } from 'react'
import { comSlug, useConsultor } from './ConsultorProvider'

/**
 * O `<Link>` do site. Use ESTE, nunca o `next/link` direto.
 *
 * Num site de consultor (`/julianodamaso/...`) ele prefixa sozinho todo caminho
 * interno. E o que impede o visitante de escorregar do site do consultor pra
 * home da 21Go no primeiro clique na logo — e o consultor esta pagando trafego
 * pra trazer essa pessoa.
 *
 * `scripts/verificar-links.mjs` roda no build e quebra o build se alguem
 * importar `next/link` fora daqui. Nao e regra de convivencia, e trava.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const consultor = useConsultor()
  const destino = typeof href === 'string' ? comSlug(href, consultor?.slug) : href
  return <NextLink href={destino} {...props} />
}
