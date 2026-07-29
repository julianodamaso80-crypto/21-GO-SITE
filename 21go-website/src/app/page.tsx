import { CinematicHero } from '@/components/sections/CinematicHero'
import { JourneyProtecao } from '@/components/sections/JourneyProtecao'
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

export default function Home() {
  return (
    <>
      <CinematicHero />
      <TrustBar />
      <JourneyProtecao />
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
