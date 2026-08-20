'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/Link'

/**
 * A navegacao do painel. "Equipe" so aparece pro dono.
 *
 * O papel vem de um cookie de tela (`painel_papel`), nao de permissao: quem
 * decide de verdade e a sessao assinada, conferida no servidor a cada rota — um
 * divulgador que force `/app/usuarios` leva 403 do mesmo jeito. Esconder aqui e
 * so pra ele nao clicar numa aba que nunca foi dele.
 */
export default function NavPainel() {
  const [ehAdmin, setEhAdmin] = useState(false)

  useEffect(() => {
    const papel = document.cookie
      .split('; ')
      .find((c) => c.startsWith('painel_papel='))
      ?.split('=')[1]
    setEhAdmin(papel === 'admin')
  }, [])

  return (
    <nav className="flex gap-4 text-sm font-medium">
      <Link href="/app" className="text-[#293C82]">
        Início
      </Link>
      <Link href="/app/leads" className="text-[#293C82]">
        Leads
      </Link>
      {ehAdmin && (
        <Link href="/app/usuarios" className="text-[#293C82]">
          Equipe
        </Link>
      )}
    </nav>
  )
}
