import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, MapPin, Clock, Check, ChevronDown } from 'lucide-react'

/**
 * Pagina local do Rio.
 *
 * Medido em 06/08/2026 (DataForSEO, SERP ao vivo de "protecao veicular rj"): o top 18 e todo
 * de concorrente local — Atual Clube, Facility, Quality Rio, Avantage, APVS, Clube Auto,
 * Altima, Vale Beneficios — e o 21go.site nao aparece em nenhuma posicao. Quem aparece pela
 * 21Go e o dominio ANTIGO (21go.online, posicao 12), que ninguem mantem.
 *
 * A 21Go tem o ativo que nenhum deles tem de graca: 20+ anos de rua no Rio. Esta pagina existe
 * para disputar essa busca com o dominio certo.
 */
export const metadata: Metadata = {
  // O layout ja aplica o template '%s | 21Go'
  title: 'Proteção Veicular RJ: Preço, Cobertura e Como Contratar',
  description:
    'Proteção veicular no Rio de Janeiro com 20+ anos de mercado. Sem análise de perfil, sem consulta ao SPC. Carro a partir de R$106,50/mês, moto a partir de R$77,50/mês. Simule com a placa em 30 segundos.',
  alternates: { canonical: 'https://21go.site/protecao-veicular-rj' },
  openGraph: {
    title: 'Proteção Veicular RJ: Preço, Cobertura e Como Contratar',
    description:
      'Como funciona a proteção veicular no Rio de Janeiro, quanto custa e o que olhar antes de escolher a associação.',
    url: 'https://21go.site/protecao-veicular-rj',
    type: 'article',
  },
}

const RESPOSTA_DIRETA =
  'Proteção veicular no Rio de Janeiro é a alternativa ao seguro para quem teve o perfil recusado ou recebeu cotação cara — situação comum no RJ por causa do índice de roubo e furto. Em vez de apólice de seguradora, você entra numa associação: todos os associados contribuem para um fundo comum que cobre roubo, furto, colisão e incêndio. Não há análise de perfil nem consulta ao SPC. Na 21Go, que atua no Rio há mais de 20 anos, a mensalidade parte de R$77,50 para motos e R$106,50 para carros, calculada pela faixa de valor FIPE.'

const REGIOES = [
  'Zona Sul', 'Zona Norte', 'Zona Oeste', 'Centro', 'Barra da Tijuca', 'Jacarepaguá',
  'Niterói', 'São Gonçalo', 'Baixada Fluminense', 'Duque de Caxias', 'Nova Iguaçu', 'Campo Grande',
]

const MOTIVOS = [
  {
    icon: ShieldCheck,
    titulo: 'Perfil recusado pelo seguro',
    texto:
      'Motorista jovem, quem mora em área de risco pelo mapa da seguradora ou quem já teve sinistro costuma ouvir não. Na associação não existe análise de perfil.',
  },
  {
    icon: MapPin,
    titulo: 'Cotação cara demais no Rio',
    texto:
      'O índice de roubo e furto do estado entra no cálculo do prêmio e encarece o seguro. No mutualismo o custo é rateado entre os associados, e não precificado por perfil individual.',
  },
  {
    icon: Clock,
    titulo: 'Pressa para estar protegido',
    texto:
      'A simulação sai em cerca de 30 segundos com a placa. A assistência 24h vale desde a ativação; roubo, furto e colisão têm carência de 90 dias.',
  },
]

const FAQ_RJ = [
  {
    q: 'Quanto custa a proteção veicular no Rio de Janeiro?',
    a: 'Depende da faixa de valor FIPE do veículo e do plano escolhido. Na 21Go começa em R$77,50/mês para motos e R$106,50/mês para carros. O valor exato do seu veículo aparece na simulação do site, feita só com a placa.',
  },
  {
    q: 'A 21Go atende quais regiões do Rio?',
    a: 'Todo o estado — capital (Zona Sul, Norte, Oeste e Centro), Baixada Fluminense, Niterói, São Gonçalo e região dos lagos. A assistência 24h com reboque acompanha o veículo mesmo em viagem para fora do estado.',
  },
  {
    q: 'Proteção veicular vale a pena no RJ?',
    a: 'Vale principalmente para quem foi recusado pelo seguro ou recebeu cotação alta — os dois casos são frequentes no estado. Quem tem perfil bem aceito e consegue seguro barato deve comparar as duas opções: a cobertura no dia a dia é parecida, o que muda é quem administra e como o preço é formado.',
  },
  {
    q: 'Preciso de vistoria para contratar?',
    a: 'Sim, o veículo passa por vistoria simples com fotos antes da ativação. É o que garante que o estado do carro está registrado no momento da entrada — protege você e o grupo de associados.',
  },
  {
    q: 'Como escolher uma associação de proteção veicular no Rio?',
    a: 'Confira tempo de mercado, sede física no estado, reputação pública e se a associação explica com clareza o que cobre e o que não cobre. Desconfie de preço muito abaixo do mercado: no mutualismo, mensalidade baixa demais significa fundo insuficiente na hora do evento.',
  },
]

function schemaDaPagina() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQ_RJ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
      {
        '@type': 'Service',
        name: 'Proteção Veicular no Rio de Janeiro — 21Go',
        serviceType: 'Proteção veicular por mutualismo',
        description: RESPOSTA_DIRETA,
        areaServed: [
          { '@type': 'State', name: 'Rio de Janeiro' },
          { '@type': 'City', name: 'Rio de Janeiro' },
          { '@type': 'City', name: 'Niterói' },
          { '@type': 'City', name: 'São Gonçalo' },
          { '@type': 'City', name: 'Duque de Caxias' },
          { '@type': 'City', name: 'Nova Iguaçu' },
        ],
        provider: {
          '@type': 'Organization',
          name: '21Go Proteção Veicular',
          url: 'https://21go.site',
        },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'BRL',
          lowPrice: '77.50',
          highPrice: '499.00',
          url: 'https://21go.site/cotacao',
        },
      },
    ],
  }
}

export default function ProtecaoVeicularRJPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaDaPagina()) }}
      />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
          <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] rounded-full bg-[#293C82]/20 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#F2911D] font-semibold mb-6">
            <MapPin className="w-4 h-4" /> Rio de Janeiro
          </span>
          <h1 className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-5">
            Proteção Veicular RJ
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Mais de 20 anos protegendo motorista carioca e fluminense. Sem análise de perfil,
            sem consulta ao SPC.
          </p>
          <Link
            href="/cotacao"
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Simular com a placa <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Resposta direta */}
      <section className="py-12 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="rounded-2xl border border-[#E8ECF4] bg-[#F7F8FC] p-6 sm:p-8">
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[#1A2754] mb-3">
              Como funciona a proteção veicular no Rio de Janeiro
            </h2>
            <p className="text-[15px] text-[#475569] leading-relaxed">{RESPOSTA_DIRETA}</p>
          </div>
        </div>
      </section>

      {/* Por que procuram no RJ */}
      <section className="py-16 bg-[#F7F8FC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold text-[#F2911D] bg-[#F2911D]/10 px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Por que no Rio
            </span>
            <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754]">
              Três motivos que trazem o motorista carioca até aqui
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {MOTIVOS.map((m) => (
              <div
                key={m.titulo}
                className="bg-white rounded-2xl border border-[#E8ECF4] p-7 hover:shadow-lg hover:shadow-black/[0.03] transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#293C82]/5 flex items-center justify-center mb-5">
                  <m.icon className="w-6 h-6 text-[#293C82]" />
                </div>
                <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#1A2754] mb-2">
                  {m.titulo}
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{m.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regioes */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-3">
            Atendemos todo o estado
          </h2>
          <p className="text-[#64748B] mb-8 max-w-2xl mx-auto">
            Capital, Baixada, Niterói, São Gonçalo e região dos lagos. A assistência 24h segue
            com você mesmo fora do estado.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {REGIOES.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F7F8FC] border border-[#E8ECF4] text-sm text-[#475569]"
              >
                <Check className="w-3.5 h-3.5 text-[#293C82]" /> {r}
              </span>
            ))}
          </div>
          <div className="mt-10">
            <Link
              href="/cotacao"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Ver meu valor agora <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#F7F8FC]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-8 text-center">
            Perguntas de quem mora no Rio
          </h2>
          <div className="space-y-3">
            {FAQ_RJ.map((item) => (
              <details
                key={item.q}
                className="group bg-white rounded-xl border border-[#E8ECF4] overflow-hidden"
              >
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none text-[#1A2754] font-semibold text-[15px] hover:bg-[#F0F4FA] transition-colors">
                  {item.q}
                  <ChevronDown className="w-5 h-5 text-[#94A3B8] group-open:rotate-180 transition-transform flex-shrink-0 ml-4" />
                </summary>
                <div className="px-6 pb-5 text-sm text-[#64748B] leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>

          <div className="text-center mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/protecao-veicular" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">
              O que é proteção veicular
            </Link>
            <Link href="/faq" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">
              Todas as perguntas
            </Link>
            <Link href="/cotacao" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">
              Fazer simulação
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
