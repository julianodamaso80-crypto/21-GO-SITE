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

/**
 * Aberturas e fechos de quem clicou em "Tenho uma dúvida".
 *
 * Precisam soar DIFERENTE do fecho de contratação: quem recebe tem que saber
 * na primeira linha que ali não é um cliente pedindo pra fechar, e sim alguém
 * com uma pergunta em aberto. Tratar os dois igual queima o lead — o de dúvida
 * leva um "vamos fechar?" quando o que ele queria era entender.
 */
const ABERTURAS_DUVIDA: string[] = [
  'Olá! Fiz uma simulação no site e fiquei com uma dúvida.',
  'Oi, tudo bem? Simulei aqui no site mas tenho uma pergunta antes. 🙂',
  'Olá! Terminei a cotação no site e queria tirar uma dúvida.',
  'Oi! Vi minha simulação no site e preciso entender uma coisa.',
  'Olá, tudo certo? Fiz a simulação e fiquei na dúvida sobre uma parte.',
  'Oi! Simulei pelo site da 21Go e queria perguntar uma coisa.',
]

/** Quem tem dúvida não "escolheu" nada ainda — o título não pode dizer que sim. */
const TITULOS_ESCOLHIDO_DUVIDA: string[] = [
  '*Plano que eu estava vendo*',
  '*O plano da minha dúvida*',
  '*Plano que apareceu pra mim*',
]

const FECHOS_DUVIDA: string[] = [
  'Pode me explicar?',
  'Consegue me ajudar com isso?',
  'Me tira essa dúvida, por favor?',
  'Antes de decidir eu queria entender melhor. Pode me explicar?',
  'Fico no aguardo pra entender direitinho!',
  'Me explica como funciona, por favor?',
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
  /**
   * Parcela do 12x ja formatada, ou null pra quem nao parcela — que e a regra
   * desde 25/08/2026 (a casa e todos os sites vendidos, menos os consultores
   * de `temParcelamento`).
   */
  ativacao12xFormatted?: string | null
  /** Consultor que prefere tratar a ativacao na conversa (ver ocultarAtivacao). */
  ocultarAtivacao?: boolean
  /**
   * URL publica do PDF da simulacao (`/api/pdfs/<leadId>`).
   *
   * Vai na mensagem porque `wa.me` nao anexa arquivo — so texto. Com o link, o
   * consultor recebe a simulacao pelo unico canal que nao depende de chip
   * nenhum: a propria mensagem que o cliente manda. Fica de fora enquanto o
   * lead nao terminou de salvar (sem `leadId` nao existe PDF pra abrir).
   */
  pdfUrl?: string | null
  /** Semente da variação — use o leadId; cai pro fallback da página se não houver. */
  seed: string
  /**
   * O que o cliente clicou. 'duvida' troca abertura e fecho pra quem atende
   * saber, já na primeira linha, que ali tem pergunta em aberto e não pedido
   * de fechamento. O corpo (dados, veículo, planos) é o mesmo nos dois: a
   * consultora precisa do contexto igual pra responder.
   */
  intencao?: 'contratar' | 'duvida'
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

  const ehDuvida = input.intencao === 'duvida'

  const linhasPlanos = input.planos.map(
    (p) =>
      `• ${p.name}: R$ ${p.monthlyFormatted}/mês${
        p.selected ? (ehDuvida ? '  ← estava vendo este' : '  ← escolhi este') : ''
      }`,
  )

  const linhasEscolhido = [
    `Plano: ${input.planoEscolhido}`,
    `Mensalidade: R$ ${input.mensalidadeFormatted}/mês`,
    // A ativacao sai da mensagem quando o consultor prefere tratar esse valor
    // na conversa. O calculo nao muda — some da vista, nao da conta.
    ...(input.ocultarAtivacao
      ? []
      : [
          // O valor e o do Pix. No cartao a operadora cobra juros, entao ele nao pode sair
          // escrito como "a vista no cartao" (ordem do dono, 03/09/2026).
          `Ativação: R$ ${input.ativacaoAvistaFormatted} à vista no Pix ou no cartão com juros${
            input.ativacao12xFormatted ? ` (12x de R$ ${input.ativacao12xFormatted})` : ''
          }`,
        ]),
  ]

  const blocos = [
    pick(ehDuvida ? ABERTURAS_DUVIDA : ABERTURAS, seed, 'abertura'),
    [pick(TITULOS_DADOS, seed, 'tit-dados'), ...linhasContato].join('\n'),
    [pick(TITULOS_VEICULO, seed, 'tit-veiculo'), ...linhasVeiculo].join('\n'),
    [pick(TITULOS_PLANOS, seed, 'tit-planos'), ...linhasPlanos].join('\n'),
    [
      pick(ehDuvida ? TITULOS_ESCOLHIDO_DUVIDA : TITULOS_ESCOLHIDO, seed, 'tit-escolhido'),
      ...linhasEscolhido,
    ].join('\n'),
    pick(ehDuvida ? FECHOS_DUVIDA : FECHOS, seed, 'fecho'),
  ]

  // Sem emoji de proposito: o proprio wa.me troca caractere fora do BMP pelo
  // caractere de substituicao na versao web (medido em 19/08/2026). O link e o
  // que importa.
  if (input.pdfUrl) blocos.push(`Minha simulação em PDF:\n${input.pdfUrl}`)

  return blocos.join('\n\n')
}
