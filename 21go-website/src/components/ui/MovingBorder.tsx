'use client'
import { cn } from '@/lib/cn'

interface Props {
  children: React.ReactNode
  className?: string
  borderColor?: string
}

export function MovingBorder({ children, className, borderColor = '#C7D301' }: Props) {
  return (
    <div className={cn('relative rounded-2xl p-[1px]', className)}>
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: `conic-gradient(from var(--angle), transparent 60%, ${borderColor} 80%, transparent 100%)`,
          animation: 'rotateBorder 4s linear infinite',
        }}
      />
      <div className="absolute inset-[1px] rounded-2xl bg-[#141420]" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
