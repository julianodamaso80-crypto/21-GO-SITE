import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, Scale, Building2, MessageSquare, ChevronDown } from 'lucide-react'

/**
 * Pagina de confianca da marca.
 *
 * Motivo, medido em 06/08/2026: "21go" tem 6.600 buscas/mes e e de onde vem quase todo o
 * trafego do site (o dominio ranqueava 11 palavras, 10 delas o proprio nome). Na SERP dessa
 * busca aparecem, na primeira pagina, o Reclame Aqui na posicao 5 e um video "21GO E UMA
 * FARSA" na 7 — e no dia 04/08 o CTR caiu de 17% para 9,2% com o maior numero de impressoes
 * do periodo. Ou seja: o site apareceu mais e levou menos clique.
 *
 * Esta pagina existe para dar a resposta oficial a "a 21Go e confiavel?", com fato verificavel
 * e sem prometer o que nao da: nao esconde reclamacao, aponta os canais formais e explica o
 * modelo. So entra aqui o que a 21Go pode comprovar.
 */
export const metadata: Metadata = {
  // O layout ja aplica o template '%s | 21Go'
  title: 'A 21Go é confiável? Tempo de mercado, regras e como cobrar',
  description:
    'Resposta direta sobre a 21Go: mais de 20 anos de mercado no Rio, modelo de associação regulado pela LC 213/2025, ouvidoria e canal de denúncia abertos. Entenda o que cobrimos e o que não cobrimos antes de decidir.',
  alternates: { canonical: 'https://21go.site/a-21go-e-confiavel' },
  openGraph: {
    title: 'A 21Go é confiável?',
    description:
      'Tempo de mercado, base legal do modelo de associação, canais de ouvidoria e o que olhar antes de contratar qualquer proteção veicular.',
    url: 'https://21go.site/a-21go-e-confiavel',
    type: 'article',
  },
}

const RESPOSTA_DIRETA =
  'A 21Go é uma associação de proteção veicular que atua no Rio de Janeiro há mais de 20 anos, com sede física no estado e atendimento próprio. O modelo é o mutualismo — associados contribuem para um fundo comum que cobre roubo, furto, colisão e incêndio —, atividade reconhecida pela Lei Complementar 213/2025. A 21Go não é seguradora e não vende apólice: por isso não faz análise de perfil nem consulta ao SPC, e por isso também as regras de carência, vistoria e cobertura precisam ser lidas antes de assinar.'

const PILARES = [
  {
    icon: Building2,
    titulo: 'Mais de 20 anos de rua',
    texto:
      'A 21Go opera no Rio de Janeiro desde antes de a proteção veicular virar assunto de lei. Tem sede física no estado, equipe própria de atendimento e rede de oficinas credenciadas.',
  },
  {
    icon: Scale,
    titulo: 'Modelo com base legal',
    texto:
      'A Lei Complementar 213/2025 reconhece e regulamenta a proteção patrimonial mutualista no Brasil. A 21Go opera como associação — não como seguradora — e é transparente sobre essa diferença em todo material.',
  },
  {
    icon: MessageSquare,
    titulo: 'Canal formal aberto',
    texto:
      'Ouvidoria e canal de denúncia ficam no rodapé de todas as páginas, acessíveis sem login. Reclamação registrada por canal formal tem prazo e resposta — é assim que se cobra uma associação.',
  },
]

const FAQ = [
  {
    q: 'A 21Go é confiável?',
    a: 'A 21Go atua há mais de 20 anos no Rio de Janeiro, com sede física, equipe própria e rede credenciada. Como qualquer associação de proteção veicular, ela não é seguradora e não é fiscalizada pela SUSEP — é regida pelo modelo mutualista da Lei Complementar 213/2025. Antes de contratar, leia o regulamento: carência, vistoria e limites de cobertura estão escritos lá, e é isso que separa uma associação séria de uma promessa vazia.',
  },
  {
    q: 'Por que aparecem reclamações da 21Go no Reclame Aqui?',
    a: 'Toda empresa com base grande de clientes tem reclamação registrada — e proteção veicular é um setor em que a expectativa do associado e o que o regulamento cobre nem sempre coincidem. O que vale olhar não é a existência da reclamação, e sim se a empresa responde, em quanto tempo e se resolve. Se você tem um caso aberto, o caminho mais rápido é a ouvidoria: ela tem prazo formal de resposta.',
  },
  {
    q: 'A 21Go é uma seguradora?',
    a: 'Não. A 21Go é uma associação de proteção veicular. A diferença é real e importante: seguradora vende apólice, é regulada pela SUSEP e calcula preço por análise de perfil. Associação opera por rateio entre associados, não faz análise de perfil e é regida pela LC 213/2025. Quem promete "seguro" e entrega associação está mentindo — nós dizemos o que somos.',
  },
  {
    q: 'O que a 21Go NÃO cobre?',
    a: 'Eventos fora do regulamento, veículo sem vistoria aprovada, evento dentro do prazo de carência (90 dias para roubo, furto e colisão) e situações excluídas em contrato, como uso do veículo em atividade ilícita. A assistência 24h vale desde a ativação. Todas as regras ficam no regulamento entregue na adesão.',
  },
  {
    q: 'Como faço para reclamar ou cobrar a 21Go?',
    a: 'Pela ouvidoria, no rodapé do site — é o canal com prazo formal de resposta. Para suspeita de irregularidade existe também o canal de denúncia, que aceita registro anônimo. Guardar protocolo e datas ajuda em qualquer instância posterior.',
  },
]

function schemaDaPagina() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
      {
        '@type': 'Organization',
        name: '21Go Proteção Veicular',
        url: 'https://21go.site',
        description: RESPOSTA_DIRETA,
        areaServed: { '@type': 'State', name: 'Rio de Janeiro' },
        // Sem `foundingDate`: o material da 21Go diz "20+ anos" e nao o ano exato. Numero
        // chutado em dado estruturado e o tipo de coisa que o Google pega e a gente perde.
        knowsAbout: ['proteção veicular', 'mutualismo', 'associação de proteção patrimonial'],
      },
    ],
  }
}

export default function ConfiavelPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaDaPagina()) }}
      />

      <section className="pt-32 pb-16 bg-gradient-to-b from-[#1A2754] via-[#1F3068] to-[#293C82] relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#F2911D]/10 blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#F2911D] font-semibold mb-6">
            <ShieldCheck className="w-4 h-4" /> Transparência
          </span>
          <h1 className="font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white mb-5">
            A 21Go é confiável?
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Resposta direta, com o que dá para verificar — e com o que a gente não faz.
          </p>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="rounded-2xl border border-[#E8ECF4] bg-[#F7F8FC] p-6 sm:p-8">
            <p className="text-[15px] text-[#475569] leading-relaxed">{RESPOSTA_DIRETA}</p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#F7F8FC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {PILARES.map((p) => (
              <div key={p.titulo} className="bg-white rounded-2xl border border-[#E8ECF4] p-7">
                <div className="w-12 h-12 rounded-2xl bg-[#293C82]/5 flex items-center justify-center mb-5">
                  <p.icon className="w-6 h-6 text-[#293C82]" />
                </div>
                <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#1A2754] mb-2">
                  {p.titulo}
                </h2>
                <p className="text-sm text-[#64748B] leading-relaxed">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-[var(--font-display)] text-3xl font-bold text-[#1A2754] mb-8 text-center">
            O que perguntam antes de fechar
          </h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group bg-[#F7F8FC] rounded-xl border border-[#E8ECF4] overflow-hidden">
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none text-[#1A2754] font-semibold text-[15px] hover:bg-[#F0F4FA] transition-colors">
                  {item.q}
                  <ChevronDown className="w-5 h-5 text-[#94A3B8] group-open:rotate-180 transition-transform flex-shrink-0 ml-4" />
                </summary>
                <div className="px-6 pb-5 text-sm text-[#64748B] leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/cotacao"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#F2911D] to-[#F5A845] text-white font-bold rounded-full shadow-lg shadow-[#F2911D]/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Ver quanto fica no meu veículo <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/ouvidoria" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">Ouvidoria</Link>
              <Link href="/denuncia" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">Canal de denúncia</Link>
              <Link href="/conformidade-legal" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">Conformidade legal</Link>
              <Link href="/protecao-veicular" className="font-semibold text-[#293C82] hover:text-[#3D72DE]">O que é proteção veicular</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
