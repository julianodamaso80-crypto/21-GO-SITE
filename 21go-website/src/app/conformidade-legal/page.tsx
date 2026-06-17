import { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, FileText, Building2, Scale, ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Conformidade Legal | 21Go Proteção Patrimonial Veicular',
  description: 'Como a 21Go opera juridicamente — associação de proteção patrimonial veicular por mutualismo, respaldada pelo Código Civil. Diferenças regulatórias entre seguro e proteção.',
  alternates: { canonical: 'https://21go.site/conformidade-legal' },
}

export default function ConformidadeLegalPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FC] pt-32 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#475569] hover:text-[#293C82] mb-8">
          <ArrowLeft className="w-4 h-4" /> Voltar ao início
        </Link>

        <div className="bg-white rounded-3xl border border-[#E8ECF4] p-10 md:p-14 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#293C82] to-[#1A2754] flex items-center justify-center">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-[var(--font-display)] text-3xl md:text-4xl font-bold text-[#1A2754]">
              Conformidade Legal
            </h1>
          </div>

          <p className="text-[#475569] text-[15px] leading-[1.8] mb-8">
            Transparência total sobre como a 21Go opera juridicamente, qual a diferença regulatória entre proteção patrimonial veicular e seguro, e quais os direitos do associado.
          </p>

          <section className="mb-10">
            <h2 className="font-[var(--font-display)] text-[1.5rem] font-bold text-[#1A2754] mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#F2911D]" /> O que é a 21Go juridicamente
            </h2>
            <p className="text-[#475569] text-[15px] leading-[1.8] mb-4">
              A 21Go é uma <strong>associação de proteção patrimonial veicular</strong>, constituída segundo os <strong>artigos 53 a 61 do Código Civil brasileiro</strong> (Lei 10.406/2002). Funciona por <strong>mutualismo</strong>: um grupo de associados contribui mensalmente para um fundo comum, que cobre eventos como roubo, furto, colisão e incêndio (proveniente de colisão).
            </p>
            <p className="text-[#475569] text-[15px] leading-[1.8]">
              Diferente das seguradoras, a 21Go <strong>não opera por contrato de seguro</strong> e portanto <strong>não é regulada pela SUSEP</strong> (Superintendência de Seguros Privados). Esse formato cooperativo é o que permite o custo significativamente menor — em média 30-50% mais barato que seguro tradicional.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="font-[var(--font-display)] text-[1.5rem] font-bold text-[#1A2754] mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#F2911D]" /> Marcos legais aplicáveis
            </h2>
            <ul className="space-y-3 text-[#475569] text-[15px] leading-[1.8]">
              <li><strong>Código Civil arts. 53-61</strong> — Constituição e funcionamento das associações sem fins lucrativos.</li>
              <li><strong>Código de Defesa do Consumidor (Lei 8.078/90)</strong> — Direitos do associado como consumidor, inclusive cancelamento em até 7 dias (art. 49).</li>
              <li><strong>Lei do Marco do Cooperativismo (5.764/71)</strong> — Aplicável subsidiariamente.</li>
              <li><strong>Resolução BACEN 4.659/2018</strong> — Recomenda transparência das associações sobre sua natureza jurídica não-securitária.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="font-[var(--font-display)] text-[1.5rem] font-bold text-[#1A2754] mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#F2911D]" /> Direitos do associado
            </h2>
            <ul className="space-y-2 text-[#475569] text-[15px] leading-[1.8] list-disc pl-5">
              <li>Cancelamento a qualquer momento, sem multa e sem fidelidade (CDC art. 49).</li>
              <li>Acesso ao estatuto da associação, balanço financeiro e ata de assembleia.</li>
              <li>Voto em assembleia geral conforme estatuto.</li>
              <li>Atendimento a reclamações em até 10 dias úteis (CDC art. 67).</li>
              <li>Devolução proporcional de mensalidades pagas em caso de não-cumprimento por parte da associação.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="font-[var(--font-display)] text-[1.5rem] font-bold text-[#1A2754] mb-4">
              Diferenças regulatórias — Seguro vs Proteção
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse rounded-xl overflow-hidden">
                <thead className="bg-[#1A2754] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">Aspecto</th>
                    <th className="px-4 py-3 text-left">Seguradora</th>
                    <th className="px-4 py-3 text-left">21Go (Proteção)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="px-4 py-3 border-b border-[#E8ECF4]">Regulação</td><td className="px-4 py-3 border-b border-[#E8ECF4]">SUSEP</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Código Civil arts. 53-61</td></tr>
                  <tr className="bg-[#F7F8FC]"><td className="px-4 py-3 border-b border-[#E8ECF4]">Modelo</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Contrato de seguro</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Mutualismo (rateio)</td></tr>
                  <tr><td className="px-4 py-3 border-b border-[#E8ECF4]">Análise de perfil</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Sim</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Não</td></tr>
                  <tr className="bg-[#F7F8FC]"><td className="px-4 py-3 border-b border-[#E8ECF4]">Carência</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Sim (variável)</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Definida em estatuto</td></tr>
                  <tr><td className="px-4 py-3 border-b border-[#E8ECF4]">Fidelidade</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Comum</td><td className="px-4 py-3 border-b border-[#E8ECF4]">Não há</td></tr>
                  <tr className="bg-[#F7F8FC]"><td className="px-4 py-3">Custo médio</td><td className="px-4 py-3">Referência (100%)</td><td className="px-4 py-3 font-semibold text-[#293C82]">~30-50% menor</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-[#293C82]/5 rounded-2xl p-6 border border-[#293C82]/10">
            <p className="text-[13px] text-[#475569] leading-relaxed">
              <strong className="text-[#1A2754]">⚖️ Esta página representa nosso compromisso com transparência total.</strong><br />
              Última atualização: 25 de maio de 2026. Para esclarecimentos jurídicos específicos, consulte um advogado de sua confiança ou nossa Ouvidoria via <Link href="mailto:contato@21go.org" className="text-[#293C82] underline">contato@21go.org</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
