import Link from '@/components/Link'
import Image from 'next/image'
import { FooterSocials } from '@/components/layout/FooterSocials'
import { FooterCredito } from '@/components/layout/FooterCredito'

const links = {
  Proteção: [
    { label: 'O que é proteção veicular', href: '/protecao-veicular' },
    { label: 'Proteção veicular no RJ', href: '/protecao-veicular-rj' },
    { label: 'Simulação', href: '/cotacao' },
    { label: 'Benefícios', href: '/protecao-veicular#coberturas' },
  ],
  Empresa: [
    { label: 'Sobre', href: '/sobre' },
    { label: 'Blog', href: '/blog' },
    { label: 'Indique e Ganhe', href: '/indique' },
  ],
  Suporte: [
    { label: 'FAQ', href: '/faq' },
    // Destino final direto, e nao `/contato` e `/area-do-associado`. Esses dois
    // sao redirect do next.config, e redirect do config NAO roda depois do
    // rewrite do middleware: no site de um consultor
    // (`/<slug>/contato` -> rewrite -> `/contato`) davam 404 em vez de cair na
    // simulacao. O visitante do consultor clicava em "Contato" e batia numa
    // pagina de erro.
    { label: 'Contato', href: '/cotacao' },
    { label: 'Área do Associado', href: '/faq' },
  ],
}

export function Footer() {
  return (
    <footer className="bg-[#1A2754]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 lg:gap-16">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-5">
              <Image src="/logo21go-72.png" alt="21Go" width={32} height={32} className="rounded-lg" />
              <span className="font-[var(--font-outfit)] text-lg font-bold text-white">21Go</span>
            </Link>
            <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">
              Proteção veicular inteligente no Rio de Janeiro. 20+ anos de mercado protegendo seu patrimônio.
            </p>
            <FooterSocials />
          </div>

          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="font-[var(--font-outfit)] text-xs font-semibold uppercase tracking-widest text-[#64748B] mb-5">
                {title}
              </h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-[#94A3B8] hover:text-white transition-colors duration-200">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Nenhum número de WhatsApp escrito aqui (ordem do dono, 07/08/2026):
            número visível no rodapé de toda página vira contato anônimo direto
            no chip. O caminho é sempre a simulação. */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <Link
            href="/cotacao"
            className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#25D366]">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Falar com a 21Go pela simulação
          </Link>
          <div className="flex gap-5">
            <Link href="/conformidade-legal" className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Termos</Link>
            <Link href="/conformidade-legal" className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Privacidade</Link>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 py-5">
          <p className="text-xs text-[#64748B] text-center">&copy; 2026 21Go Proteção Veicular. Todos os direitos reservados.</p>

          <FooterCredito />
        </div>
      </div>
    </footer>
  )
}
