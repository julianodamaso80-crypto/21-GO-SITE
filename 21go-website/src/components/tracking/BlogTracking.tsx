'use client'

import { useEffect, useRef } from 'react'
import {
  trackBlogArticleView,
  trackBlogScrollDepth,
  trackBlogCtaClick,
  trackBlogInternalLinkClick,
  trackWhatsAppClick,
} from '@/lib/tracking'

type Props = {
  articleSlug: string
  articleTitle: string
  articleCategory: string | null
  mainKeyword: string | null
}

const SCROLL_THRESHOLDS = [25, 50, 75, 90] as const
type ScrollThreshold = (typeof SCROLL_THRESHOLDS)[number]

// Componente invisível plugado dentro da página do artigo (server component).
// Responsável por: 1 disparo de blog_article_view no mount; scroll depth
// uma vez por threshold; event delegation em clicks pra classificar
// CTA (cotacao/wa.me) vs link interno do site.
//
// Nunca envia PII. Nunca quebra navegação (não chama preventDefault).
export function BlogTracking({ articleSlug, articleTitle, articleCategory, mainKeyword }: Props) {
  const firedView = useRef(false)
  const firedScroll = useRef<Set<ScrollThreshold>>(new Set())
  const firedLinks = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (firedView.current) return
    firedView.current = true

    trackBlogArticleView({
      article_slug: articleSlug,
      article_title: articleTitle,
      article_category: articleCategory,
      main_keyword: mainKeyword,
    })

    function computeScrollPercent(): number {
      const doc = document.documentElement
      const scrollTop = doc.scrollTop || document.body.scrollTop
      const viewport = window.innerHeight
      const fullHeight = doc.scrollHeight
      const denominator = fullHeight - viewport
      if (denominator <= 0) return 100
      return Math.floor(((scrollTop + viewport) / fullHeight) * 100)
    }

    function onScroll() {
      const pct = computeScrollPercent()
      for (const threshold of SCROLL_THRESHOLDS) {
        if (pct >= threshold && !firedScroll.current.has(threshold)) {
          firedScroll.current.add(threshold)
          trackBlogScrollDepth({
            article_slug: articleSlug,
            article_title: articleTitle,
            article_category: articleCategory,
            scroll_percent: threshold,
          })
        }
      }
    }

    function classifyAnchor(href: string): 'whatsapp' | 'cotacao' | 'internal' | 'external' {
      if (/wa\.me\/|api\.whatsapp\.com|whatsapp:/i.test(href)) return 'whatsapp'
      if (/^\/cotacao(?:[/?#]|$)/.test(href) || /\/cotacao(?:[/?#]|$)/i.test(href)) return 'cotacao'
      // Internal = relativo / mesmo origin / âncora. Externo = http(s) com outra origem.
      if (href.startsWith('/') || href.startsWith('#')) return 'internal'
      try {
        const u = new URL(href, window.location.origin)
        if (u.origin === window.location.origin) return 'internal'
      } catch {
        return 'external'
      }
      return 'external'
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      if (!href) return

      const kind = classifyAnchor(href)
      const rawText = (anchor.textContent || '').trim()
      const linkText = rawText.length > 120 ? `${rawText.slice(0, 120)}…` : rawText

      // Dedup leve: uma combinação (kind + href) por sessão de página.
      const dedupKey = `${kind}:${href}`
      if (firedLinks.current.has(dedupKey)) return
      firedLinks.current.add(dedupKey)

      if (kind === 'whatsapp') {
        trackBlogCtaClick({
          article_slug: articleSlug,
          article_title: articleTitle,
          article_category: articleCategory,
          cta_text: linkText,
          cta_href: href,
          cta_type: 'whatsapp',
        })
        // WhatsApp do blog também alimenta o evento comercial Contact (Meta).
        trackWhatsAppClick('blog_article', { buttonText: linkText })
        return
      }

      if (kind === 'cotacao') {
        trackBlogCtaClick({
          article_slug: articleSlug,
          article_title: articleTitle,
          article_category: articleCategory,
          cta_text: linkText,
          cta_href: href,
          cta_type: 'cotacao',
        })
        return
      }

      if (kind === 'internal') {
        trackBlogInternalLinkClick({
          article_slug: articleSlug,
          link_href: href,
          link_text: linkText,
        })
      }
      // externo: ignorado — fora do escopo de SEO interno do blog.
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick)
    // Roda uma vez caso a página seja curta o suficiente pra já estar no fim.
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick)
    }
  }, [articleSlug, articleTitle, articleCategory, mainKeyword])

  return null
}
