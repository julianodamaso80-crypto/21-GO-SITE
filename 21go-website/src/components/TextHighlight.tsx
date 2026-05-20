"use client";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function TextHighlight({ children, color = '#F2911D' }: { children: React.ReactNode; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    gsap.fromTo(el,
      { backgroundSize: '0% 40%' },
      {
        backgroundSize: '100% 40%',
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 80%" }
      }
    );
  }, [color]);

  return (
    <span
      ref={ref}
      style={{
        backgroundImage: `linear-gradient(120deg, ${color}40, ${color}40)`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 90%',
        backgroundSize: '0% 40%',
      }}
    >
      {children}
    </span>
  );
}
