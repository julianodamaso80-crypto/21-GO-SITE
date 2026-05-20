'use client'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

interface Props {
  text: string
  className?: string
  highlightWord?: string
  highlightClass?: string
}

export function TextReveal({ text, className, highlightWord, highlightClass = 'text-[#C7D301]' }: Props) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const words = text.split(' ')

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className={`inline-block mr-[0.3em] ${word === highlightWord ? highlightClass : ''}`}
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={isInView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.4, delay: i * 0.04, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}
