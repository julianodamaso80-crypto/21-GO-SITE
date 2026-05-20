"use client";
import { useRef } from 'react';

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export default function PremiumCard({ children, className = '', glowColor = '#293C82' }: PremiumCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`
        relative group rounded-2xl border border-white/10 bg-white/[0.03]
        backdrop-blur-sm overflow-hidden
        transition-all duration-500
        hover:border-white/20 hover:shadow-2xl
        hover:-translate-y-1
        ${className}
      `}
      style={{
        background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${glowColor}08, transparent 40%)`
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${glowColor}15, transparent 40%)`
        }}
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
