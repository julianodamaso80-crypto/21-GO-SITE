"use client";
import Link from 'next/link';

export default function MobileCTA() {
  return (
    <div data-cta-section="mobile_cta" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1A2754]/90 backdrop-blur-xl border-t border-white/10 px-4 py-3 safe-area-pb">
      <Link
        href="/cotacao"
        className="animate-glow-pulse block w-full text-center py-3.5 rounded-xl bg-[#F2911D] text-white font-semibold text-base hover:bg-[#D67A0F] transition-colors"
      >
        Fazer Simulação Grátis
      </Link>
    </div>
  );
}
