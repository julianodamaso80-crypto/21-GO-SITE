'use client'

const benefits = [
  'Cadastro SUSEP · Regulamentada',
  'Colisão · Proteção parcial e total',
  'Roubo e Furto · Reembolso FIPE',
  'Incêndio · Eventos da natureza',
  'Guincho 200km · Todo o Brasil',
  'Carro Reserva · Até 15 dias',
  'Assistência 24h · Chaveiro, pneu, pane seca',
  'Carro de Leilão · Pagamos até 80% FIPE',
  'Carro de App · Cota de apenas 6%',
  '20+ Anos de Mercado no RJ',
  '98% de Aprovação',
  'Sem Análise de Perfil',
  'Sem Burocracia',
  'Proteção para Motos',
]

export function TrustBar() {
  const separator = <span className="mx-4 text-white/40">★</span>
  const items = benefits.map((b, i) => (
    <span key={i} className="inline-flex items-center whitespace-nowrap">
      <span className="font-bold text-sm md:text-base tracking-wide uppercase">{b}</span>
      {separator}
    </span>
  ))

  return (
    <section className="bg-[#F2911D] overflow-hidden py-3.5">
      <div className="relative flex">
        <div className="animate-marquee flex items-center text-white">
          {items}
          {items}
        </div>
      </div>
    </section>
  )
}
