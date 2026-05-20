import { Metadata } from 'next'
import { Calendar, User, Clock, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { getPostBySlug, getPostSlugs, getAllPosts } from '@/lib/blog'
import { notFound } from 'next/navigation'
import { BlogTracking } from '@/components/tracking/BlogTracking'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Post nao encontrado' }
  return {
    title: `${post.title} | Blog 21Go`,
    description: post.description,
    openGraph: { type: 'article', title: post.title },
  }
}

export async function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }))
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const allPosts = getAllPosts()
  const related = allPosts.filter((p) => p.slug !== slug).slice(0, 3)

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: post.image?.startsWith('http') ? post.image : `https://21go.site${post.image || '/blog/default.jpg'}`,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: post.author || '21Go', url: 'https://21go.site' },
    publisher: {
      '@type': 'Organization',
      name: '21Go',
      logo: { '@type': 'ImageObject', url: 'https://21go.site/logo.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://21go.site/blog/${slug}` },
    keywords: (post.keywords ?? []).join(', '),
    articleSection: post.category,
    inLanguage: 'pt-BR',
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <BlogTracking
        articleSlug={slug}
        articleTitle={post.title}
        articleCategory={post.category || null}
        mainKeyword={post.keywords?.[0] ?? null}
      />
      {/* Article header */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82]">
        <div className="max-w-4xl mx-auto px-6">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Blog
          </Link>

          <span className="inline-block bg-[#F2911D]/15 text-[#F5A845] text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            {post.category}
          </span>

          <h1 className="font-[var(--font-display)] text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-white mb-8 leading-[1.15]">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-5 text-sm text-white/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span>{post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{new Date(post.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{post.readTime} min de leitura</span>
            </div>
          </div>
        </div>
      </section>

      {/* Content + Sidebar */}
      <section className="py-12 md:py-16 bg-[#F7F8FC]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1fr_320px] gap-10">
            {/* Article content */}
            <div className="bg-white rounded-2xl border border-[#E8ECF4] shadow-sm p-8 md:p-12">
              <article
                className="
                  max-w-none
                  [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.5rem] [&_h2]:font-bold [&_h2]:text-[#1A2754] [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:pb-3 [&_h2]:border-b [&_h2]:border-[#E8ECF4]
                  [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.2rem] [&_h3]:font-semibold [&_h3]:text-[#1A2754] [&_h3]:mt-8 [&_h3]:mb-3
                  [&_p]:text-[#475569] [&_p]:text-[15px] [&_p]:leading-[1.8] [&_p]:mb-5
                  [&_ul]:my-4 [&_ul]:pl-0 [&_ul]:space-y-2
                  [&_ol]:my-4 [&_ol]:pl-0 [&_ol]:space-y-2 [&_ol]:list-none [&_ol]:counter-reset-[item]
                  [&_li]:text-[#475569] [&_li]:text-[15px] [&_li]:leading-[1.7] [&_li]:pl-6 [&_li]:relative
                  [&_ul_li]:before:content-[''] [&_ul_li]:before:absolute [&_ul_li]:before:left-0 [&_ul_li]:before:top-[10px] [&_ul_li]:before:w-1.5 [&_ul_li]:before:h-1.5 [&_ul_li]:before:rounded-full [&_ul_li]:before:bg-[#F2911D]
                  [&_strong]:text-[#1A2754] [&_strong]:font-semibold
                  [&_a]:text-[#293C82] [&_a]:font-medium [&_a]:underline [&_a]:decoration-[#293C82]/30 hover:[&_a]:decoration-[#293C82]
                  [&_table]:w-full [&_table]:my-6 [&_table]:border-collapse [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:text-sm
                  [&_thead]:bg-[#1A2754] [&_th]:text-white [&_th]:font-semibold [&_th]:text-left [&_th]:px-4 [&_th]:py-3
                  [&_td]:px-4 [&_td]:py-3 [&_td]:text-[#475569] [&_td]:border-b [&_td]:border-[#E8ECF4]
                  [&_tr:nth-child(even)]:bg-[#F7F8FC]
                  [&_blockquote]:border-l-4 [&_blockquote]:border-[#F2911D] [&_blockquote]:bg-[#F2911D]/5 [&_blockquote]:px-6 [&_blockquote]:py-4 [&_blockquote]:my-6 [&_blockquote]:rounded-r-xl
                  [&_hr]:my-8 [&_hr]:border-[#E8ECF4]
                "
                dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
              />
            </div>

            {/* Sidebar */}
            <aside className="space-y-6 lg:sticky lg:top-28 h-fit">
              {/* CTA Card */}
              <div className="bg-gradient-to-br from-[#1A2754] to-[#293C82] rounded-2xl p-8 text-white">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-[#F2911D]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-bold mb-2">
                  Proteja seu veículo
                </h3>
                <p className="text-sm text-white/60 mb-6">
                  Simulação gratuita em 30 segundos. Sem compromisso.
                </p>
                <Link
                  href="/cotacao"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-semibold text-sm hover:shadow-lg hover:shadow-[#F2911D]/20 transition-all"
                >
                  Fazer Simulação <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Related posts */}
              {related.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#E8ECF4] p-6">
                  <h3 className="font-[var(--font-display)] text-xs font-semibold text-[#94A3B8] mb-5 uppercase tracking-wider">
                    Artigos Relacionados
                  </h3>
                  <div className="space-y-4">
                    {related.map((r) => (
                      <Link key={r.slug} href={`/blog/${r.slug}`} className="block group">
                        <span className="text-[10px] font-bold text-[#293C82] bg-[#293C82]/5 px-2 py-0.5 rounded-full uppercase">
                          {r.category}
                        </span>
                        <p className="mt-1.5 text-sm font-medium text-[#1A2754] group-hover:text-[#293C82] transition-colors leading-snug">
                          {r.title}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}

/* ─── Markdown → HTML (improved) ─── */
function markdownToHtml(md: string): string {
  let html = md

  // Tables: detect and convert properly
  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) => {
    const ths = header.split('|').filter(Boolean).map((h: string) => `<th>${h.trim()}</th>`).join('')
    const rows = body.trim().split('\n').map((row: string) => {
      const tds = row.split('|').filter(Boolean).map((d: string) => `<td>${d.trim()}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`
  })

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />')

  // Headers (must come before bold/paragraph processing)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n')

  // Unordered lists — collect consecutive lines
  html = html.replace(/(^- .+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('\n')
    return `<ul>${items}</ul>`
  })

  // Ordered lists
  html = html.replace(/(^\d+\. .+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('\n')
    return `<ol>${items}</ol>`
  })

  // Paragraphs: non-empty lines not starting with HTML tags
  html = html.replace(/^(?!<[hultaob]|<\/|$|\s*$)(.+)$/gm, '<p>$1</p>')

  // Clean up empty paragraphs and extra whitespace
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}
