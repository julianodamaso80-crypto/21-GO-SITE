export interface PlanFeature {
  name: string
  basico: boolean
  completo: boolean
  premium: boolean
}

export interface Plan {
  id: string
  name: string
  rate: number
  adminFee: number
  description: string
  popular?: boolean
  features: string[]
}

export const plans: Plan[] = [
  {
    id: 'basico',
    name: 'Basico',
    rate: 0,
    adminFee: 0,
    description: 'Protecao essencial contra roubo e furto com assistencia 24h.',
    features: [
      'Roubo e furto (reembolso FIPE)',
      'Assistencia 24 horas',
      'Guincho 200km',
    ],
  },
  {
    id: 'do-seu-jeito',
    name: 'Do Seu Jeito',
    rate: 0,
    adminFee: 0,
    description: 'Tudo do Basico + colisao, incendio (proveniente de colisao) e mais.',
    features: [
      'Tudo do Basico',
      'Colisao total e parcial',
      'Incendio (proveniente de colisao) e eventos da natureza',
      'Terceiros R$10.000',
      'Assistencia residencial',
    ],
  },
  {
    id: 'vip',
    name: 'VIP',
    rate: 0,
    adminFee: 0,
    description: 'O mais escolhido — cobertura completa.',
    popular: true,
    features: [
      'Tudo do "Do Seu Jeito"',
      'Terceiros R$20.000',
      'Carro reserva 7 dias',
      'Vidros e farois',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    rate: 0,
    adminFee: 0,
    description: 'Maxima protecao com todos os beneficios.',
    features: [
      'Tudo do VIP',
      'Cobertura total (todos os sinistros)',
      'Reboque 600km',
      'Terceiros R$30.000',
      'Carro reserva 15 dias',
      'Assistencia residencial completa',
    ],
  },
]

export const comparisonFeatures: PlanFeature[] = [
  { name: 'Roubo e Furto', basico: true, completo: true, premium: true },
  { name: 'Assistencia 24h', basico: true, completo: true, premium: true },
  { name: 'Guincho/Reboque', basico: true, completo: true, premium: true },
  { name: 'Colisao', basico: false, completo: true, premium: true },
  { name: 'Incendio (proveniente de colisao)', basico: false, completo: true, premium: true },
  { name: 'Terceiros', basico: false, completo: true, premium: true },
  { name: 'Assistencia Residencial', basico: false, completo: true, premium: true },
  { name: 'Carro Reserva', basico: false, completo: false, premium: true },
  { name: 'Vidros e Farois', basico: false, completo: false, premium: true },
  { name: 'Cobertura Total', basico: false, completo: false, premium: true },
]

export const faqItems = [
  {
    question: 'O que e protecao veicular?',
    answer: 'Protecao veicular e uma alternativa ao seguro tradicional. Funciona por mutualismo: um grupo de associados contribui mensalmente para um fundo comum que cobre sinistros como roubo, furto, colisao e incendio (proveniente de colisao). Quanto mais associados, menor o custo para todos.',
  },
  {
    question: 'Protecao veicular e legal?',
    answer: 'Sim. A Lei Complementar 213/2025 regulamentou as associacoes de protecao veicular no Brasil. A 21Go atua no mercado do RJ ha mais de 20 anos e segue todas as normas vigentes, incluindo cadastro na SUSEP.',
  },
  {
    question: 'Quanto custa a protecao veicular?',
    answer: 'O valor depende do plano escolhido e da faixa de valor FIPE do seu veiculo. Para carros, temos 4 planos: Basico (a partir de R$106,50/mes), Do Seu Jeito, VIP e Premium. Tambem temos planos para motos (a partir de R$77,50/mes), SUVs e veiculos especiais. Use nossa calculadora de cotacao para saber o valor exato.',
  },
  {
    question: 'Precisa de analise de perfil?',
    answer: 'Nao. Diferente do seguro tradicional, a protecao veicular nao faz analise de perfil, nao consulta SPC/Serasa e nao tem restricao de idade, CEP ou genero. Aceitamos todos os perfis.',
  },
  {
    question: 'Como funciona em caso de sinistro?',
    answer: 'Voce aciona pelo 0800, WhatsApp ou app. Geramos um protocolo imediato, designamos uma oficina parceira e acompanhamos todo o processo. A meta e resolver em ate 15 dias, com atualizacoes a cada 48 horas.',
  },
  {
    question: 'Posso cancelar quando quiser?',
    answer: 'Sim. Nao existe fidelidade ou multa de cancelamento. Voce pode sair a qualquer momento.',
  },
  {
    question: 'Aceita carro financiado?',
    answer: 'Sim. Aceitamos veiculos financiados, quitados, de leilao, rebaixados, com GNV e carros com mais de 10 anos. Nenhuma restricao.',
  },
  {
    question: 'O que e o programa Indique e Ganhe?',
    answer: 'Cada amigo que voce indica e que fecha uma adesao gera 10% de desconto permanente na sua mensalidade. Acumula. 10 indicacoes = protecao 100% gratuita. E o programa de indicacao mais generoso do mercado.',
  },
  {
    question: 'Qual a diferenca entre protecao veicular e seguro?',
    answer: 'O seguro e individual e regulado pela SUSEP via seguradoras. A protecao veicular e coletiva (mutualismo) regulada pela LC 213/2025. Na pratica: mesma cobertura, preco ate 60% menor, sem burocracia e sem restricao de perfil.',
  },
  {
    question: 'A 21Go atende em todo o RJ?',
    answer: 'Sim. Atendemos todo o estado do Rio de Janeiro — Zona Norte, Sul, Oeste, Centro, Niteroi, Baixada Fluminense, Regiao Serrana e Regiao dos Lagos. Assistencia 24h em todo o estado.',
  },
  {
    question: 'Como funciona a vistoria?',
    answer: 'A vistoria pode ser feita online pelo celular ou presencialmente. Voce fotografa o veiculo seguindo as instrucoes do app. E rapido e simples — leva menos de 15 minutos.',
  },
  {
    question: 'O que cobre o plano Premium?',
    answer: 'O Premium cobre tudo: roubo, furto, colisao, incendio (proveniente de colisao), assistencia 24h, guincho 200km, carro reserva por 15 dias, danos a terceiros ate R$100.000, protecao de vidros e rastreamento veicular. E a protecao mais completa do mercado. Tambem temos o plano VIP (mais escolhido) e o Do Seu Jeito (personalizavel).',
  },
  {
    question: 'Quanto tempo para ativar a protecao?',
    answer: 'Apos a vistoria aprovada, sua protecao e ativada em ate 48 horas. Do cote ao protegido em menos de 3 dias.',
  },
  {
    question: 'Tem carro reserva?',
    answer: 'Sim. O plano Completo oferece carro reserva por 7 dias e o Premium por 15 dias, em caso de sinistro que deixe o veiculo indisponivel.',
  },
  {
    question: 'Como funciona o rastreamento?',
    answer: 'No plano Premium, instalamos um rastreador GPS no seu veiculo gratuitamente. Voce acompanha a localizacao em tempo real pelo app. Em caso de roubo, aumenta drasticamente a chance de recuperacao.',
  },
]
