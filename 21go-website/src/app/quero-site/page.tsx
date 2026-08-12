import type { Metadata } from 'next'
import { FormularioSite } from './FormularioSite'

/**
 * A pagina de venda do site do consultor. Substitui o `crm21go.site/quero-site`,
 * que so juntava pedido pra alguem ligar depois — aqui a venda se fecha sozinha.
 */

export const metadata: Metadata = {
  title: 'Seu site da 21Go',
  description:
    'Tenha um site da 21Go no seu nome, com seus leads caindo direto no seu Power. R$ 80 por mês.',
  // Pagina de venda pra consultor, nao pra cliente final: nao disputa busca com
  // o site principal nem com os sites dos consultores.
  robots: { index: false, follow: false },
}

export default function QueroSitePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pt-24 pb-16 px-6 flex flex-col items-center">
      <div className="w-full max-w-md mb-8 text-center">
        <h1 className="text-3xl font-bold text-[#1A2754] mb-3">
          Seu site, seus leads, seu Power
        </h1>
        <p className="text-[#64748B]">
          O mesmo site da 21Go, no seu endereço. Quem cotar por ele cai no seu Power e fala no seu
          WhatsApp.
        </p>
      </div>

      <FormularioSite />

      <div className="w-full max-w-md mt-8 grid gap-3 text-sm text-[#64748B]">
        <Item>Seu endereço próprio: 21go.com.br/seunome</Item>
        <Item>As cotações nascem no seu nome dentro do Power</Item>
        <Item>Pode fazer tráfego pago apontando pro seu link</Item>
        <Item>Sem fidelidade — cancela quando quiser</Item>
      </div>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#C7D301] flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}
