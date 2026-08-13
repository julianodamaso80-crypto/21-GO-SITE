/**
 * Mensagem que o CLIENTE envia pro WhatsApp da 21Go ao clicar em "Quero
 * contratar" no fim da cotação.
 *
 * Dois objetivos:
 *
 * 1. VARIAÇÃO (anti-ban). Todo cliente mandando exatamente o mesmo texto pro
 *    mesmo número é assinatura de automação — é assim que o WhatsApp derruba
 *    chip. Aqui a abertura, os títulos de seção e o fecho variam por seed, mas
 *    os rótulos de dado ("Nome:", "FIPE:", "Mensalidade:"…) ficam FIXOS, senão
 *    a consultora (e a Letycya) perdem a referência de leitura.
 *
 * 2. CONTEXTO COMPLETO. A consultora precisa receber tudo que o cliente marcou
 *    na simulação — leilão, carro de app, danos a terceiros, adesivo, seguro
 *    atual — e a lista inteira de planos que apareceu na tela, não só o
 *    escolhido. Sem isso ela tem que perguntar de novo o que o site já sabe.
 *
 * Client-safe: sem `node:crypto`, roda no browser.
 */

/** Hash djb2 — determinístico e suficiente pra sortear variante. */
function hashSeed(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  }
  return h
}

/** Mesma seed + mesmo salt → sempre a mesma variante (href estável no render). */
function pick<T>(arr: T[], seed: string, salt: string): T {
  return arr[hashSeed(`${seed}|${salt}`) % arr.length]
}

const ABERTURAS: string[] = [
  'Olá! Fiz uma simulação no site.',
  'Oi! Acabei de simular meu plano aqui no site. 🙂',
  'Olá, tudo bem? Terminei minha cotação pelo site da 21Go.',
  'Oi! Simulei aqui no site e gostei do que apareceu.',
  'Boa! Fiz a simulação no site e quero seguir. 👋',
  'Olá! Passei pelo site e montei minha simulação.',
  'Oi, tudo certo? Fiz minha cotação agora pelo site.',
  'Olá! Simulação feita no site da 21Go. ✅',
]

const TITULOS_DADOS: string[] = [
  '*Meus dados*',
  '*Meus dados de contato*',
  '*Contato*',
  '*Quem está falando*',
]

const TITULOS_VEICULO: string[] = [
  '*Meu veículo*',
  '*Dados do veículo*',
  '*Sobre o veículo*',
  '*O veículo da simulação*',
]

const TITULOS_PLANOS: string[] = [
  '*Planos que apareceram pra mim*',
  '*Opções que o site me mostrou*',
  '*Planos disponíveis na minha simulação*',
  '*Todos os planos da simulação*',
]

const TITULOS_ESCOLHIDO: string[] = [
  '*Plano que escolhi*',
  '*Minha escolha*',
  '*O plano que eu quero*',
  '*Plano selecionado*',
]

const FECHOS: string[] = [
  'Quero contratar!',
  'Quero seguir com a contratação!',
  'Podemos fechar?',
  'Quero fechar esse plano, me chama!',
  'Bora fechar? Fico no aguardo.',
  'Quero contratar, me explica os próximos passos!',
  'Pode me ajudar a finalizar a contratação?',
  'Quero garantir essa proteção!',
]

export interface QuoteMessagePlan {
  name: string
  /** Já com os adicionais aplicados (carro de app, danos a terceiros). */
  monthlyFormatted: string
  selected: boolean
}

export interface QuoteMessageInput {
  nome: string
  whatsapp: string
  email?: string
  /** Vazio = cliente não informou. */
  placa?: string
  tipo: 'Carro' | 'Moto'
  /** Zero km não tem placa ainda — a mensagem diz isso em vez de "não informada". */
  condicao: 'zero' | 'usado'
  veiculo: string
  /** Já formatado em pt-BR, sem o "R$". */
  fipeFormatted: string
  leilao: 'nao' | 'leilao' | 'remarcado'
  carroApp: boolean
  /** null quando não é moto (a opção nem aparece pro cliente). */
  danosTerceiros: boolean | null
  /** Nome da seguradora/associação atual, ou null quando não tem. */
  seguroAtual: string | null
  /** null quando é moto (adesivo não se aplica). */
  adesivo: { aceito: boolean; percentual: number; valorFormatted: string } | null
  planos: QuoteMessagePlan[]
  planoEscolhido: string
  mensalidadeFormatted: string
  ativacaoAvistaFormatted: string
  ativacao12xFormatted: string
  /** Consultor que prefere tratar a ativacao na conversa (ver ocultarAtivacao). */
  ocultarAtivacao?: boolean
  /** Semente da variação — use o leadId; cai pro fallback da página se não houver. */
  seed: string
}

export function buildContratarMessage(input: QuoteMessageInput): string {
  const seed = input.seed || `${input.nome}|${input.whatsapp}`

  const origemLabel =
    input.leilao === 'leilao' ? 'Sim, leilão'
    : input.leilao === 'remarcado' ? 'Sim, remarcado'
    : 'Não'

  const linhasContato = [
    `Nome: ${input.nome}`,
    `WhatsApp: ${input.whatsapp}`,
    input.email ? `E-mail: ${input.email}` : null,
  ].filter(Boolean) as string[]

  const linhasVeiculo = [
    `Tipo: ${input.tipo}`,
    `Condição: ${input.condicao === 'zero' ? 'Zero km' : 'Usado'}`,
    `Veículo: ${input.veiculo}`,
    `Placa: ${
      input.placa
        ? input.placa
        : input.condicao === 'zero'
          ? 'ainda não tem (zero km)'
          : 'não informada'
    }`,
    `FIPE: R$ ${input.fipeFormatted}`,
    // Zero km nunca é leilão/remarcado — a pergunta nem aparece pra ele.
    input.condicao === 'zero' ? null : `Leilão/remarcado: ${origemLabel}`,
    `Carro de aplicativo: ${input.carroApp ? 'Sim (Uber/99)' : 'Não'}`,
    input.danosTerceiros !== null
      ? `Danos a Terceiros: ${input.danosTerceiros ? 'Sim (+R$ 22/mês)' : 'Não'}`
      : null,
    input.adesivo
      ? `Adesivo no vidro: ${
          input.adesivo.aceito
            ? `Sim (-${input.adesivo.percentual}% → R$ ${input.adesivo.valorFormatted}/mês)`
            : 'Não quero'
        }`
      : null,
    `Seguro/proteção hoje: ${input.seguroAtual || 'Não tenho'}`,
  ].filter(Boolean) as string[]

  const linhasPlanos = input.planos.map(
    (p) => `• ${p.name}: R$ ${p.monthlyFormatted}/mês${p.selected ? '  ← escolhi este' : ''}`,
  )

  const linhasEscolhido = [
    `Plano: ${input.planoEscolhido}`,
    `Mensalidade: R$ ${input.mensalidadeFormatted}/mês`,
    // A ativacao sai da mensagem quando o consultor prefere tratar esse valor
    // na conversa. O calculo nao muda — some da vista, nao da conta.
    ...(input.ocultarAtivacao
      ? []
      : [`Ativação: R$ ${input.ativacaoAvistaFormatted} à vista no cartão ou 12x de R$ ${input.ativacao12xFormatted}`]),
  ]

  const blocos = [
    pick(ABERTURAS, seed, 'abertura'),
    [pick(TITULOS_DADOS, seed, 'tit-dados'), ...linhasContato].join('\n'),
    [pick(TITULOS_VEICULO, seed, 'tit-veiculo'), ...linhasVeiculo].join('\n'),
    [pick(TITULOS_PLANOS, seed, 'tit-planos'), ...linhasPlanos].join('\n'),
    [pick(TITULOS_ESCOLHIDO, seed, 'tit-escolhido'), ...linhasEscolhido].join('\n'),
    pick(FECHOS, seed, 'fecho'),
  ]

  return blocos.join('\n\n')
}
