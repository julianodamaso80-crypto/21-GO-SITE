'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { fadeInUp, staggerContainer } from '@/lib/motion'
import Link from 'next/link'

const posts = [
  { slug: 'protecao-veicular-vs-seguro', title: 'Proteção Veicular vs Seguro: Qual a Diferença?', excerpt: 'Entenda as vantagens e desvantagens de cada opção para proteger seu veículo no Rio de Janeiro.', tag: 'Guia' },
  { slug: '7-dicas-evitar-roubo-carro-rj', title: '7 Dicas Para Evitar Roubo de Carro no RJ', excerpt: 'Medidas práticas para reduzir o risco de roubo e furto na cidade do Rio de Janeiro.', tag: 'Segurança' },
  { slug: 'quanto-custa-protecao-veicular', title: 'Quanto Custa Proteção Veicular em 2026?', excerpt: 'Valores atualizados, comparativo com seguro e como economizar na proteção do seu carro.', tag: 'Preços' },
]

export function BlogPreview() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="bg-white py-20 lg:py-28">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-7xl px-6"
      >
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <h2 className="font-[var(--font-outfit)] text-3xl md:text-4xl font-bold text-[#1A2754]">
            Blog 21Go
          </h2>
          <p className="mt-4 text-lg text-[#64748B]">Conteúdo para você fazer escolhas mais inteligentes</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {posts.map((post, i) => (
            <motion.div key={post.slug} variants={fadeInUp} transition={{ delay: i * 0.1 }}>
              <Link
                href={`/blog/${post.slug}`}
                className="block group bg-[#F0F4FA] rounded-2xl p-6 border border-[#E2E8F0] hover:shadow-lg hover:-translate-y-1.5 hover:border-[#293C82]/20 transition-all duration-300"
              >
                <span className="inline-block bg-[#293C82]/5 text-[#293C82] text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  {post.tag}
                </span>
                <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#1A2754] group-hover:text-[#293C82] transition-colors">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{post.excerpt}</p>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-[#293C82] hover:text-[#2D4379] transition-colors">
            Ver todos os posts <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </section>
  )
}
