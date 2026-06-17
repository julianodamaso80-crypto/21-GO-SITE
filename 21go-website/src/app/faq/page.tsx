import { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, ShieldCheck, ArrowRight, ChevronDown } from 'lucide-react'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'

export const metadata: Metadata = {
  title: 'Dúvidas? A Gente Explica Tudo | 21Go',
  description:
    'Tire suas dúvidas sobre planos, preços, como funciona, pagamento e cancelamento na 21Go.',
}

const categories = [
  {
    title: 'Sobre Proteção Veicular',
    items: [
      {
        q: 'O que é proteção veicular?',
        a: 'Proteção veicular é um sistema cooperativo (mutualismo) em que todos os associados contribuem mensalmente para um fundo comum. Quando alguém sofre um evento — roubo, furto, colisão ou incêndio (proveniente de colisão) — o fundo cobre a indenização. Diferente do seguro tradicional, não há análise de perfil e os custos são muito menores.',
      },
      {
        q: 'Proteção veicular é legal?',
        a: 'Sim! A proteção veicular por cooperativas e associações é 100% legal no Brasil, amparada pelo artigo 5 da Constituição Federal (liberdade de associação) e pelo Código Civil. A 21Go atua há mais de 20 anos no Rio de Janeiro com total transparência.',
      },
      {
        q: 'Qual a diferença entre proteção veicular e seguro?',
        a: 'O seguro é vendido por seguradoras reguladas pela SUSEP e tem análise de perfil. A proteção veicular funciona por associação mútua — todos contribuem para um fundo e não há restrições de perfil, idade ou região. O resultado é um custo até 60% menor.',
      },
    ],
  },
  {
    title: 'Planos e Preços',
    items: [
      {
        q: 'Quanto custa a proteção veicular?',
        a: 'O valor depende do plano e da faixa de valor FIPE do veículo. Para carros temos 4 planos: Básico (a partir de R$106,50/mês), Do Seu Jeito, VIP e Premium. Também temos planos para motos (a partir de R$77,50/mês), SUVs e veículos especiais. Faça uma simulação gratuita em 30 segundos.',
      },
      {
        q: 'Quais são os planos disponíveis?',
        a: 'Para carros: Básico (roubo/furto + assistência 24h), Do Seu Jeito (personalizável), VIP (proteção completa, mais escolhido) e Premium (máxima proteção com rastreamento). Para SUVs/pick-ups temos plano específico. Para motos: VIP até 400cc e VIP 450-1000cc. Para elétricos ou veículos acima de R$150 mil: plano Veículos Especiais.',
      },
      {
        q: 'Posso trocar de plano depois?',
        a: 'Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. A mudança entra em vigor no próximo ciclo de cobrança, sem custos adicionais.',
      },
      {
        q: 'Como é calculada a mensalidade?',
        a: 'A mensalidade é definida pela faixa de valor FIPE do seu veículo e pelo plano escolhido. Cada plano tem uma tabela de preços por faixa. Faça a simulação no site e veja o valor exato para o seu veículo em segundos.',
      },
    ],
  },
  {
    title: 'Eventos',
    items: [
      {
        q: 'Como funciona o comunicado de evento?',
        a: 'Em caso de evento, entre em contato pelo WhatsApp ou app. Abrimos o processo imediatamente, direcionamos para uma oficina credenciada e acompanhamos tudo até a resolução. Para roubo/furto com perda total, a indenização é baseada na tabela FIPE.',
      },
      {
        q: 'Qual o prazo de resolução do evento?',
        a: 'Para reparos (colisão, vidros), o prazo médio é de 7 a 15 dias úteis dependendo da oficina. Para indenização por perda total (roubo/furto), o prazo é de 15 a 30 dias após a entrega de toda documentação.',
      },
      {
        q: 'Existe carência para eventos?',
        a: 'Sim. Há uma carência de 90 dias para eventos de roubo/furto e colisão após a ativação da proteção. A assistência 24h (guincho, pane mecânica) está disponível imediatamente após a ativação.',
      },
    ],
  },
  {
    title: 'Pagamento',
    items: [
      {
        q: 'Quais as formas de pagamento?',
        a: 'Aceitamos boleto bancário e PIX. O boleto é gerado automaticamente todo mês e você também pode pagar via PIX com QR Code. Em breve, cartão de crédito.',
      },
      {
        q: 'O que acontece se eu atrasar o pagamento?',
        a: 'Você tem 15 dias de tolerância após o vencimento. Após esse prazo, a proteção é suspensa e você não terá proteção até a regularização. Após 60 dias, a associação é cancelada automaticamente.',
      },
    ],
  },
  {
    title: 'Cancelamento',
    items: [
      {
        q: 'Posso cancelar quando quiser?',
        a: 'Sim! Não existe fidelidade ou multa de cancelamento. Você pode cancelar sua proteção a qualquer momento sem burocracia. Basta entrar em contato pelo WhatsApp.',
      },
      {
        q: 'Tem multa de cancelamento?',
        a: 'Não. A 21Go não cobra multa de cancelamento. Você paga apenas até o último mês de utilização.',
      },
      {
        q: 'Posso voltar depois de cancelar?',
        a: 'Sim! Você pode se reassociar a qualquer momento. Será necessário fazer uma nova vistoria e o período de carência será reiniciado.',
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#293C82]/20 blur-[120px]" />
          <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] rounded-full bg-[#F2911D]/10 blur-[100px]" />
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-repeat opacity-[0.04]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F2911D]" />
            Tire suas dúvidas
          </span>
          <h1 className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-4">
            Perguntas Frequentes
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Tudo o que você precisa saber sobre proteção veicular, planos, eventos e mais.
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 bg-[#F7F8FC]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-10">
            {/* Main content */}
            <div className="space-y-10">
              {categories.map((category) => (
                <div key={category.title}>
                  <h2 className="font-[var(--font-display)] text-xl font-bold text-[#1A2754] mb-4 flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full bg-[#F2911D]" />
                    {category.title}
                  </h2>
                  <div className="space-y-3">
                    {category.items.map((item) => (
                      <details key={item.q} className="group bg-white rounded-xl border border-[#E8ECF4] overflow-hidden shadow-sm">
                        <summary className="flex items-center justify-between px-4 sm:px-6 py-4 cursor-pointer list-none text-[#1A2754] font-medium text-sm sm:text-[15px] hover:bg-[#F7F8FC] transition-colors">
                          {item.q}
                          <ChevronDown className="w-5 h-5 text-[#94A3B8] group-open:rotate-180 transition-transform flex-shrink-0 ml-4" />
                        </summary>
                        <div className="px-4 sm:px-6 pb-5 text-sm text-[#64748B] leading-relaxed border-t border-[#E8ECF4] pt-4">
                          {item.a}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar CTA */}
            <div className="lg:sticky lg:top-28 h-fit space-y-6">
              <div className="bg-gradient-to-br from-[#1A2754] to-[#293C82] rounded-2xl p-8 text-white">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-[#F2911D]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-bold mb-2">
                  Não encontrou sua resposta?
                </h3>
                <p className="text-sm text-white/60 mb-6">
                  Fale com nosso time pelo WhatsApp. Estamos prontos para ajudar.
                </p>
                <WhatsAppLink
                  href="https://wa.me/5521980214882?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20prote%C3%A7%C3%A3o%20veicular."
                  origin="faq_sidebar"
                  buttonText="Falar no WhatsApp"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#10B981] text-white font-semibold text-sm hover:bg-[#059669] transition-colors mb-4"
                >
                  <MessageCircle className="w-4 h-4" />
                  Falar no WhatsApp
                </WhatsAppLink>
                <div className="w-full h-px bg-white/10 my-5" />
                <h3 className="font-[var(--font-display)] text-base font-semibold mb-2">Pronto para simular?</h3>
                <p className="text-sm text-white/50 mb-4">Descubra quanto custa proteger seu veículo.</p>
                <Link
                  href="/cotacao"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-semibold text-sm hover:shadow-lg hover:shadow-[#F2911D]/20 transition-all"
                >
                  Fazer Simulação <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
