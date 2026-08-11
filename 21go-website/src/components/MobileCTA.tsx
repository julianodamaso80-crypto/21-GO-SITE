"use client";
import Link from '@/components/Link'

export default function MobileCTA() {
  return (
    // Barra fixa e só-mobile: backdrop-blur aqui era recomposto a cada frame do
    // scroll. Sobre fundo 90% opaco o blur não aparecia — agora é sólido.
    <div data-cta-section="mobile_cta" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1A2754] border-t border-white/10 px-4 py-3 safe-area-pb">
      <Link
        href="/cotacao"
        className="animate-glow-pulse block w-full text-center py-3.5 rounded-xl bg-[#F2911D] text-white font-semibold text-base hover:bg-[#D67A0F] transition-colors"
      >
        Fazer Simulação Grátis
      </Link>
    </div>
  );
}
