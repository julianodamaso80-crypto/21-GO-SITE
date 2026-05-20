'use client'
import { cn } from '@/lib/cn'
import Link from 'next/link'

interface Props {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function ShimmerButton({ children, href, onClick, className, size = 'md' }: Props) {
  const sizes = { sm: 'px-5 py-2 text-sm', md: 'px-7 py-3 text-base', lg: 'px-9 py-4 text-lg' }
  const base = cn(
    'relative inline-flex items-center justify-center gap-2 font-semibold rounded-full',
    'bg-gradient-to-r from-[#C7D301] to-[#E0C060] text-[#0A0A0F]',
    'overflow-hidden transition-all duration-300',
    'hover:shadow-[0_0_30px_rgba(201,168,76,0.3)] hover:scale-[1.02]',
    'active:scale-[0.98]',
    sizes[size],
    className
  )

  const shimmer = (
    <span className="absolute inset-0 overflow-hidden rounded-full">
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmerSlide_2s_ease-in-out_infinite]" />
    </span>
  )

  if (href) {
    return <Link href={href} className={base}>{shimmer}<span className="relative z-10">{children}</span></Link>
  }
  return <button onClick={onClick} className={base}>{shimmer}<span className="relative z-10">{children}</span></button>
}
