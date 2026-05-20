'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { fadeInUp } from '@/lib/motion'
import Link from 'next/link'

interface InlineCTAProps {
  text: string
  buttonText?: string
  bg?: 'white' | 'gray'
}

export function InlineCTA({ text, buttonText = 'Fazer Simulação Grátis', bg = 'white' }: InlineCTAProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <section data-cta-section="inline_cta" ref={ref} className={bg === 'gray' ? 'bg-[#F0F4FA]' : 'bg-white'}>
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-3xl px-6 py-10"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[#F2911D]/15 bg-[#F2911D]/[0.03] px-6 py-5 sm:px-8">
          <p className="text-sm sm:text-base font-medium text-[#1A2754] text-center sm:text-left">
            {text}
          </p>
          <Link
            href="/cotacao"
            className="flex-shrink-0 inline-flex items-center px-6 py-3 rounded-xl bg-[#F2911D] text-white text-sm font-semibold hover:bg-[#D67A0F] transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
          >
            {buttonText}
          </Link>
        </div>
      </motion.div>
    </section>
  )
}
