'use client'
import { cn } from '@/lib/cn'

interface Props {
  children: React.ReactNode
  className?: string
}

export function BorderBeam({ children, className }: Props) {
  return (
    <div className={cn('relative inline-flex rounded-full p-[1px] overflow-hidden', className)}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from var(--angle), transparent 70%, #C7D301 85%, transparent 100%)',
          animation: 'rotateBorder 3s linear infinite',
        }}
      />
      <div className="relative z-10 rounded-full bg-[#0F0F18] px-4 py-1.5 text-sm font-medium text-[#C7D301]">
        {children}
      </div>
    </div>
  )
}
