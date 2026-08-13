import { PresidentHero } from '@/components/sections/PresidentHero'
import { ConsultorVideoHero } from '@/components/sections/ConsultorVideoHero'
import { ScrollCinema } from '@/components/cinema/ScrollCinema'
import { MensagemPresidente } from '@/components/sections/MensagemPresidente'
import { TrustBar } from '@/components/sections/TrustBar'
import { ProblemSolution } from '@/components/sections/ProblemSolution'
import { SusepSection } from '@/components/sections/SusepSection'
import { InlineCTA } from '@/components/sections/InlineCTA'
import { PlansSection } from '@/components/sections/PlansSection'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { ComparisonSection } from '@/components/sections/ComparisonSection'
import { RejectedSection } from '@/components/sections/RejectedSection'
import { SocialProof } from '@/components/sections/SocialProof'
import { AIShowcase } from '@/components/sections/AIShowcase'
import { MGMBanner } from '@/components/sections/MGMBanner'
import { BlogPreview } from '@/components/sections/BlogPreview'
import { HomeFAQ } from '@/components/sections/HomeFAQ'
import { FinalCTA } from '@/components/sections/FinalCTA'
import type { VideoConsultor } from '@/lib/consultores-video'

/**
 * O conteúdo da home — o mesmo pra 21Go e pra todo site de consultor.
 *
 * Só o hero muda: quem tem vídeo próprio (`video`) recebe o hero de vídeo já no
 * HTML, em vez de trocar depois de hidratar. Ver `src/app/c/[slug]/page.tsx`.
 */
export function HomeContent({ video }: { video?: VideoConsultor }) {
  return (
    <>
      {video ? <ConsultorVideoHero video={video} /> : <PresidentHero />}
      <TrustBar />
      <ScrollCinema variant="home" />
      <ProblemSolution />
      <SusepSection />
      <PlansSection />
      <HowItWorks />

      <InlineCTA
        text="Carro, moto, app ou leilão. Faça sua simulação personalizada."
        buttonText="Cotar Agora"
        bg="gray"
      />

      <ComparisonSection />
      <RejectedSection />
      <SocialProof />
      <AIShowcase />

      <InlineCTA
        text="Proteção completa a partir de poucos reais por dia. Simule grátis."
        buttonText="Simular Proteção"
        bg="white"
      />

      <MGMBanner />
      <BlogPreview />
      <HomeFAQ />
      <MensagemPresidente />
      <FinalCTA />
    </>
  )
}
