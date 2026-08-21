import { Metadata } from 'next'
import { Calendar, ArrowRight, ArrowLeft, Clock } from 'lucide-react'
import Link from '@/components/Link'
import { getAllPosts } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Blog 21Go — Conteudo sobre Protecao Veicular',
  description: 'Artigos, dicas e guias sobre protecao veicular, seguranca no transito, economia e muito mais. Blog da 21Go Protecao Patrimonial Veicular no RJ.',
}

const categoryColors: Record<string, string> = {
  Seguranca: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  Dicas: 'bg-[#293C82]/10 text-[#293C82] border-[#293C82]/20',
  Guia: 'bg-[#293C82]/10 text-[#293C82] border-[#293C82]/20',
  Economia: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
  Tecnologia: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
  Comparativo: 'bg-[#F2911D]/10 text-[#F2911D] border-[#F2911D]/20',
  Geral: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
  // Categorias que a esteira SEO gera — sem elas os 3 clusters principais (88 posts)
  // caiam todos no cinza de "Geral". Paleta da marca: azul #293C82, laranja #F2911D,
  // verde #C7D301.
  Carros: 'bg-[#293C82]/10 text-[#293C82] border-[#293C82]/20',
  Motos: 'bg-[#F2911D]/10 text-[#F2911D] border-[#F2911D]/20',
  Frotas: 'bg-[#293C82]/10 text-[#1F2E63] border-[#293C82]/30',
  Educativo: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
  // O verde da marca puro (#C7D301) nao tem contraste suficiente como texto em fundo
  // claro — o fundo/borda usam a cor da marca e o texto usa a versao escurecida.
  'Carros Elétricos': 'bg-[#C7D301]/15 text-[#6B7300] border-[#C7D301]/40',
}

/**
 * Quantos artigos por página. Antes a listagem cuspia TODOS de uma vez: com 161
 * artigos o HTML de /blog batia em 984 KB e a página tinha 71.470 px de altura —
 * no celular em 4G isso levava ~3,6 s só pra abrir.
 */
const POSTS_POR_PAGINA = 12

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const todos = getAllPosts()
  const totalPaginas = Math.max(1, Math.ceil(todos.length / POSTS_POR_PAGINA))
  const pedida = Number((await searchParams)?.page)
  const pagina = Number.isFinite(pedida) ? Math.min(Math.max(1, pedida), totalPaginas) : 1
  const inicio = (pagina - 1) * POSTS_POR_PAGINA
  const posts = todos.slice(inicio, inicio + POSTS_POR_PAGINA)

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
          <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] rounded-full bg-[#293C82]/20 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F2911D]" />
            Conteúdo exclusivo
          </span>
          <h1 className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-4">
            Blog 21Go
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Artigos, dicas e guias para você tomar decisões mais inteligentes sobre seu veículo.
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <section className="py-16 bg-[#F7F8FC]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-7">
            {posts.map((post, i) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group bg-white rounded-2xl border border-[#E8ECF4] overflow-hidden hover:shadow-xl hover:shadow-black/[0.04] hover:-translate-y-1 transition-all duration-300 ${
                  i === 0 && pagina === 1 ? 'md:col-span-2 lg:col-span-2' : ''
                }`}
              >
                {/* Cover gradient */}
                <div className={`${i === 0 && pagina === 1 ? 'h-56' : 'h-44'} bg-gradient-to-br from-[#1A2754] to-[#293C82] relative overflow-hidden flex items-end p-6`}>
                  <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.06]" />
                  <span className={`relative z-10 text-xs font-bold px-3 py-1 rounded-full border ${categoryColors[post.category] || categoryColors.Geral}`}>
                    {post.category}
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 mb-3 text-xs text-[#94A3B8]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(post.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{post.readTime} min</span>
                    </div>
                  </div>

                  <h2 className={`font-[var(--font-display)] font-semibold text-[#1A2754] mb-2.5 leading-tight group-hover:text-[#293C82] transition-colors ${
                    i === 0 && pagina === 1 ? 'text-xl' : 'text-base'
                  }`}>
                    {post.title}
                  </h2>

                  <p className="text-sm text-[#64748B] leading-relaxed mb-4 line-clamp-3">
                    {post.description}
                  </p>

                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#293C82] group-hover:gap-2.5 transition-all">
                    Ler artigo <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Paginação — os 161 artigos seguem todos no sitemap.xml, então o
              Google acha cada um direto; aqui é navegação pra pessoa. */}
          {totalPaginas > 1 && (
            <nav
              aria-label="Paginação do blog"
              className="mt-12 flex flex-wrap items-center justify-center gap-2"
            >
              {pagina > 1 && (
                <Link
                  href={pagina === 2 ? '/blog' : `/blog?page=${pagina - 1}`}
                  rel="prev"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white border border-[#E8ECF4] text-sm font-semibold text-[#293C82] hover:border-[#293C82]/40 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Anterior
                </Link>
              )}

              <span className="px-4 py-2.5 text-sm text-[#64748B]">
                Página <strong className="text-[#1A2754]">{pagina}</strong> de {totalPaginas}
              </span>

              {pagina < totalPaginas && (
                <Link
                  href={`/blog?page=${pagina + 1}`}
                  rel="next"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#293C82] text-sm font-semibold text-white hover:bg-[#1F3068] transition-colors"
                >
                  Próxima <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  )
}
