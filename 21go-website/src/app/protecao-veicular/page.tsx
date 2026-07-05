import { Metadata } from 'next'
import Link from 'next/link'
import {
  Check,
  X,
  Users,
  HandCoins,
  ShieldCheck,
  ArrowRight,
  Building2,
  Sparkles,
  ChevronDown,
} from 'lucide-react'

export const metadata: Metadata = {
  title: '8 Planos pra Proteger Seu Carro, Moto ou SUV | 21Go',
  description:
    'Carros a partir de R$106,50/mês, motos a partir de R$77,50/mês. Sem análise de perfil, sem burocracia. Veja qual plano cabe no seu bolso em 30 segundos.',
}

const mutualSteps = [
  {
    icon: Users,
    title: 'Todos Contribuem',
    description: 'Associados pagam uma mensalidade que forma um fundo comum de proteção.',
  },
  {
    icon: HandCoins,
    title: 'Fundo Coletivo',
    description: 'O fundo é administrado com transparência para cobrir eventos dos associados.',
  },
  {
    icon: ShieldCheck,
    title: 'Todos Protegidos',
    description: 'Quando alguém sofre um evento, o fundo cobre. Quanto mais associados, menor o rateio.',
  },
]

interface FeatureRow {
  feature: string
  basico: boolean | string
  jeito: boolean | string
  vip: boolean | string
  premium: boolean | string
}

const comparisonFeatures: FeatureRow[] = [
  { feature: 'Roubo e Furto', basico: true, jeito: true, vip: true, premium: true },
  { feature: 'Incêndio', basico: 'Proveniente de colisão', jeito: 'Proveniente de colisão', vip: 'Proveniente de colisão', premium: 'Proveniente de colisão' },
  { feature: 'Colisão', basico: true, jeito: true, vip: true, premium: true },
  { feature: 'Fenômenos da Natureza', basico: false, jeito: true, vip: true, premium: true },
  { feature: 'Danos a Terceiros', basico: 'R$5.000', jeito: 'R$10.000', vip: 'R$50.000', premium: 'R$100.000' },
  { feature: 'Carro Reserva', basico: false, jeito: false, vip: '7 dias', premium: '15 dias' },
  { feature: 'Parabrisa', basico: false, jeito: true, vip: true, premium: true },
  { feature: 'Carro Amigo', basico: false, jeito: '25km', vip: '25km', premium: true },
  { feature: 'Reboque', basico: '200km', jeito: '400km', vip: '1.000km', premium: '1.200km' },
  { feature: 'Reboque Adicional', basico: false, jeito: false, vip: false, premium: '200km' },
  { feature: 'Todos os Vidros', basico: false, jeito: false, vip: false, premium: true },
  { feature: 'Monitoramento 24h', basico: true, jeito: true, vip: 'Acima R$50K', premium: true },
  { feature: 'Táxi', basico: '25km', jeito: '50km', vip: '100km', premium: '150km' },
  { feature: 'Clube de Benefícios', basico: true, jeito: true, vip: true, premium: true },
]

const vsSeguro = [
  { item: 'Análise de perfil', seguro: 'Obrigatória', go21: 'Não exigida' },
  { item: 'Restrição de idade', seguro: 'Sim', go21: 'Não' },
  { item: 'Restrição de região', seguro: 'Sim (RJ penalizado)', go21: 'Não' },
  { item: 'Preço médio mensal', seguro: 'R$350 — R$800', go21: 'R$106 — R$601' },
  { item: 'Burocracia', seguro: 'Alta', go21: 'Mínima' },
  { item: 'Tempo de contratação', seguro: '7 a 15 dias', go21: '48 horas' },
  { item: 'Guincho', seguro: '100km (média)', go21: '200km' },
  { item: 'Cancelamento', seguro: 'Multa proporcional', go21: 'Sem multa' },
]

const planFAQ = [
  {
    q: 'Quais são os planos disponíveis?',
    a: 'Para carros: Básico, Do Seu Jeito (personalizável), VIP (mais escolhido) e Premium. Para SUVs/pick-ups temos plano específico. Para motos: VIP até 400cc e VIP 450-1000cc. Para elétricos ou veículos acima de R$150 mil: Veículos Especiais.',
  },
  {
    q: 'Como é calculada a mensalidade?',
    a: 'A mensalidade é definida pela faixa de valor FIPE do seu veículo e pelo plano escolhido. Cada plano tem uma tabela de preços por faixa. Faça a simulação no site e veja o valor exato em segundos.',
  },
  {
    q: 'Posso trocar de plano depois?',
    a: 'Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. A mudança entra em vigor no próximo ciclo de cobrança.',
  },
  {
    q: 'O que é a tabela FIPE e por que ela importa?',
    a: 'A tabela FIPE (Fundação Instituto de Pesquisas Econômicas) é a referência de preços de veículos no Brasil. Usamos ela para calcular sua mensalidade e para definir o valor de indenização em caso de evento de perda total.',
  },
  {
    q: 'Existe carência?',
    a: 'Sim, há uma carência de 90 dias para eventos de roubo/furto e colisão após a ativação. A assistência 24h (guincho) está disponível imediatamente.',
  },
]

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className="text-sm text-[#1A2754] font-semibold">{value}</span>
  }
  return value ? (
    <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto">
      <Check className="w-3.5 h-3.5 text-[#10B981]" />
    </div>
  ) : (
    <div className="w-6 h-6 rounded-full bg-[#F0F4FA] flex items-center justify-center mx-auto">
      <X className="w-3.5 h-3.5 text-[#CBD5E1]" />
    </div>
  )
}

export default function ProtecaoVeicularPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
          <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] rounded-full bg-[#293C82]/20 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#F2911D] font-semibold mb-6">
            Planos de Proteção
          </span>
          <h1 className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-5">
            Planos de Proteção Veicular 21Go
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Proteção completa para seu veículo a partir de R$77,50/mês. Sem análise de perfil, sem burocracia.
          </p>
        </div>
      </section>

      {/* How Mutualismo Works */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Mutualismo
            </span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-3">
              Como funciona a proteção veicular
            </h2>
            <p className="text-[#64748B] max-w-xl mx-auto">
              Diferente do seguro, a proteção veicular funciona pelo princípio do mutualismo — todos cuidam de todos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {mutualSteps.map((step, i) => (
              <div key={step.title} className="relative bg-white rounded-2xl border border-[#E8ECF4] p-8 text-center hover:shadow-lg hover:shadow-black/[0.03] transition-all">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#293C82] text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="w-14 h-14 rounded-2xl bg-[#293C82]/5 flex items-center justify-center mx-auto mb-5">
                  <step.icon className="w-7 h-7 text-[#293C82]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#1A2754] mb-2">{step.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan Comparison Table */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Comparativo
            </span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-3">
              Compare os planos
            </h2>
            <p className="text-[#64748B]">Veja lado a lado o que cada plano oferece.</p>
          </div>

          <div className="rounded-2xl border border-[#E8ECF4] overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="bg-[#1A2754]">
                  <th className="text-left text-xs sm:text-sm font-semibold text-white/70 px-3 sm:px-5 py-3 sm:py-4 w-[28%]">Benefício</th>
                  <th className="text-center text-[10px] sm:text-xs font-semibold text-white/70 px-2 sm:px-3 py-3 sm:py-4">Básico</th>
                  <th className="text-center text-[10px] sm:text-xs font-semibold text-white/70 px-2 sm:px-3 py-3 sm:py-4">Do Seu Jeito</th>
                  <th className="text-center text-xs font-semibold text-[#F2911D] px-3 py-4 bg-white/5">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-[#F2911D] bg-[#F2911D]/20 px-2 py-0.5 rounded-full mb-1">Popular</span>
                      VIP
                    </div>
                  </th>
                  <th className="text-center text-xs font-semibold text-white/70 px-3 py-4">Premium</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((row, i) => (
                  <tr key={row.feature} className={`border-t border-[#E8ECF4] ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F8FC]'}`}>
                    <td className="text-sm text-[#475569] px-5 py-3.5 font-medium">{row.feature}</td>
                    <td className="text-center px-3 py-3.5"><FeatureCell value={row.basico} /></td>
                    <td className="text-center px-3 py-3.5"><FeatureCell value={row.jeito} /></td>
                    <td className="text-center px-3 py-3.5 bg-[#F2911D]/[0.02]"><FeatureCell value={row.vip} /></td>
                    <td className="text-center px-3 py-3.5"><FeatureCell value={row.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-center mt-10">
            <Link href="/cotacao" className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:shadow-[#F2911D]/30 hover:scale-[1.02] active:scale-[0.98] transition-all">
              Fazer Simulação Agora <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Seguro vs 21Go */}
      <section className="py-20 bg-[#F7F8FC]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Comparação
            </span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-3">
              Seguro Tradicional vs 21Go
            </h2>
            <p className="text-[#64748B]">Veja por que cada vez mais motoristas estão escolhendo a proteção veicular.</p>
          </div>

          <div className="rounded-2xl border border-[#E8ECF4] overflow-hidden shadow-sm bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-[#1A2754]">
                  <th className="text-left text-sm font-semibold text-white/70 px-6 py-4">Item</th>
                  <th className="text-center text-sm font-semibold text-white/50 px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Building2 className="w-4 h-4" /> Seguro
                    </div>
                  </th>
                  <th className="text-center text-sm font-semibold text-[#F2911D] px-6 py-4 bg-white/5">
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" /> 21Go
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vsSeguro.map((row, i) => (
                  <tr key={row.item} className={`border-t border-[#E8ECF4] ${i % 2 === 0 ? '' : 'bg-[#F7F8FC]'}`}>
                    <td className="text-sm text-[#475569] px-6 py-3.5 font-medium">{row.item}</td>
                    <td className="text-sm text-[#94A3B8] text-center px-6 py-3.5">{row.seguro}</td>
                    <td className="text-sm text-[#10B981] text-center px-6 py-3.5 font-semibold bg-[#10B981]/[0.02]">{row.go21}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Dúvidas
            </span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754]">
              Dúvidas sobre os planos
            </h2>
          </div>

          <div className="space-y-3">
            {planFAQ.map((item) => (
              <details key={item.q} className="group bg-[#F7F8FC] rounded-xl border border-[#E8ECF4] overflow-hidden">
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none text-[#1A2754] font-semibold text-[15px] hover:bg-[#F0F4FA] transition-colors">
                  {item.q}
                  <ChevronDown className="w-5 h-5 text-[#94A3B8] group-open:rotate-180 transition-transform flex-shrink-0 ml-4" />
                </summary>
                <div className="px-6 pb-5 text-sm text-[#64748B] leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/faq" className="inline-flex items-center gap-2 text-sm font-semibold text-[#293C82] hover:text-[#3D72DE] transition-colors">
              Ver todas as perguntas <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
