/**
 * Os FATOS do veiculo que a Isa pode falar — calculados aqui, nunca lembrados pela IA.
 *
 * Ideia central do Parlant: o numero nao sai da "memoria" do modelo, sai de um calculo. Tudo que
 * a Isa disser com R$ ou % tem que estar em `numerosPermitidos`; o validador reprova o resto.
 *
 * As regras copiam o que a TELA de cotacao faz (src/app/cotacao/page.tsx), para o cliente ouvir
 * da Isa o mesmo numero que viu no site:
 *   - adesivo: VIP/Premium/SUV/Especial ate 30 mil = 10%, acima = 15%; Basico/Do Seu Jeito ate
 *     60 mil = 10%, acima = 15%; moto nao tem.
 *   - em dia (5 dias antes): 5%, arredondado em centavos como a tela.
 *   - carro de aplicativo: + R$ 20 na mensalidade (CARRO_APP_EXTRA do pdf-quote).
 * O valor COMBINADO adesivo + em dia fica de fora de proposito: a tela multiplica (0,85 x 0,95)
 * e o PDF soma (15% + 5%), entao qualquer numero combinado discordaria de um dos dois.
 *
 * Gabarito do dono (10/09/2026): cota 6/10/15; indenizacao 100% ou 80% em leilao/remarcado;
 * rastreador obrigatorio no RJ ja embutido no plano (carro > 50 mil, app > 35 mil, moto > 15 mil),
 * opcional R$ 100 + R$ 19,90; adicionais vidros R$ 29,90 e terceiros moto R$ 22,90.
 */

export interface PlanoEntrada {
  id: string
  nome: string
  mensal: number
  /** Texto oficial do site (PLAN_INFO) — o que o plano cobre e o que nao cobre. */
  beneficios?: { text: string; included: boolean }[]
}

export interface EntradaFatos {
  marca: string | null
  modelo: string | null
  ano: number | null
  fipe: number | null
  combustivel: string | null
  leilao: boolean
  carroApp: boolean
  estado: string | null
  planos: PlanoEntrada[]
  ativacaoReferencia: number | null
  ativacaoPorPlano: Record<string, number>
  desconto50: { de: number; para: number } | null
  /** Valores em R$ que aparecem nos beneficios oficiais (terceiros, monitoramento...). */
  numerosDosBeneficios?: number[]
}

export interface PlanoFatos {
  id: string
  nome: string
  mensal: number
  adesivoPct: 10 | 15 | null
  mensalComAdesivo: number | null
  mensalEmDia: number
  ativacao: number | null
  cobre: string[]
  naoCobre: string[]
}

export interface Fatos {
  veiculo: { descricao: string; ano: number | null; fipe: number | null; moto: boolean; eletrico: boolean }
  cotaPct: 6 | 10 | 15
  /** Quanto o associado paga num reparo: cota% da FIPE. */
  cotaValor: number | null
  indenizacaoPct: 100 | 80
  rastreadorEmbutido: boolean
  planos: PlanoFatos[]
  ativacaoReferencia: number | null
  desconto50: { de: number; para: number } | null
  numerosPermitidos: { dinheiro: number[]; pct: number[] }
}

const CARRO_APP_EXTRA = 20
const RASTREADOR = { instalacao: 100, mensal: 19.9 }
/** FIPE a partir da qual o rastreador e obrigatorio no RJ (gabarito do dono, 10/09/2026). */
export const RASTREADOR_OBRIGATORIO = { moto: 15000, app: 35000, carro: 50000 }
const ADICIONAIS = { vidros: 29.9, terceirosMoto: 22.9 }
const DESCONTO_ENTRADA = 50

const MARCAS_ELETRIFICADAS = ['BYD', 'TESLA', 'GWM', 'ZEEKR', 'NETA', 'ORA']
const PALAVRAS_ELETRICO = /\b(ELETRIC|ELÉTRIC|ELECTRIC|EV|BEV|H[IÍ]BRID|HYBRID|HEV|PHEV|MHEV|E-TECH|E:HEV|RECHARGE)/i

const r2 = (v: number) => Math.round(v * 100) / 100

export function ehMoto(planos: PlanoEntrada[]): boolean {
  return planos.some((p) => p.id === 'moto-400' || p.id === 'moto-1000')
}

/** Eletrico e hibrido contam igual (dono, 10/09/2026). BYD e sempre. */
export function ehEletricoOuHibrido(v: { marca: string | null; modelo: string | null; combustivel: string | null }): boolean {
  const marca = (v.marca || '').trim().toUpperCase()
  if (MARCAS_ELETRIFICADAS.some((m) => marca.startsWith(m))) return true
  return PALAVRAS_ELETRICO.test(`${v.modelo || ''} ${v.combustivel || ''}`)
}

/** Mesmo corte da tela de cotacao. Moto nao tem adesivo. */
export function adesivoPct(planoId: string, fipe: number | null): 10 | 15 | null {
  if (planoId === 'moto-400' || planoId === 'moto-1000') return null
  const corte = ['vip', 'premium', 'suv', 'especial'].includes(planoId) ? 30000 : 60000
  return (fipe || 0) > corte ? 15 : 10
}

export function montarFatos(e: EntradaFatos): Fatos {
  const moto = ehMoto(e.planos)
  const eletrico = !moto && ehEletricoOuHibrido(e)
  const cotaPct: Fatos['cotaPct'] = moto ? 15 : eletrico ? 10 : 6

  const noRio = !e.estado || e.estado.toUpperCase() === 'RJ'
  const fipe = e.fipe || 0
  const limite = moto ? RASTREADOR_OBRIGATORIO.moto : e.carroApp ? RASTREADOR_OBRIGATORIO.app : RASTREADOR_OBRIGATORIO.carro
  const rastreadorEmbutido = noRio && fipe > limite

  const planos: PlanoFatos[] = e.planos.map((p) => {
    const mensal = r2(p.mensal + (e.carroApp && !moto ? CARRO_APP_EXTRA : 0))
    const pct = adesivoPct(p.id, e.fipe)
    return {
      id: p.id,
      nome: p.nome,
      mensal,
      adesivoPct: pct,
      mensalComAdesivo: pct ? r2(mensal * (1 - pct / 100)) : null,
      mensalEmDia: r2(mensal * 0.95),
      ativacao: e.ativacaoPorPlano[p.id] ?? null,
      cobre: (p.beneficios || []).filter((b) => b.included).map((b) => b.text),
      naoCobre: (p.beneficios || []).filter((b) => !b.included).map((b) => b.text),
    }
  })

  const dinheiro = new Set<number>([
    RASTREADOR.instalacao,
    RASTREADOR.mensal,
    ADICIONAIS.vidros,
    ADICIONAIS.terceirosMoto,
    DESCONTO_ENTRADA,
    ...Object.values(RASTREADOR_OBRIGATORIO),
  ])
  const cotaValor = e.fipe ? r2((e.fipe * cotaPct) / 100) : null
  if (e.fipe) dinheiro.add(r2(e.fipe))
  if (cotaValor) dinheiro.add(cotaValor)
  for (const v of e.numerosDosBeneficios || []) dinheiro.add(r2(v))
  if (e.fipe && e.leilao) dinheiro.add(r2(e.fipe * 0.8))
  if (e.ativacaoReferencia) dinheiro.add(r2(e.ativacaoReferencia))
  if (e.desconto50) {
    dinheiro.add(r2(e.desconto50.de))
    dinheiro.add(r2(e.desconto50.para))
  }
  for (const p of planos) {
    dinheiro.add(p.mensal)
    dinheiro.add(p.mensalEmDia)
    if (p.mensalComAdesivo) dinheiro.add(p.mensalComAdesivo)
    if (p.ativacao) dinheiro.add(r2(p.ativacao))
  }

  const pct = new Set<number>([cotaPct, 5, 100, e.leilao ? 80 : 100])
  for (const p of planos) if (p.adesivoPct) pct.add(p.adesivoPct)

  const descricao = [e.marca, e.modelo].filter(Boolean).join(' ').trim()
  return {
    veiculo: { descricao, ano: e.ano, fipe: e.fipe, moto, eletrico },
    cotaPct,
    cotaValor,
    indenizacaoPct: e.leilao ? 80 : 100,
    rastreadorEmbutido,
    planos,
    ativacaoReferencia: e.ativacaoReferencia,
    desconto50: e.desconto50,
    numerosPermitidos: { dinheiro: [...dinheiro], pct: [...pct] },
  }
}

/**
 * Quais planos a Isa oferece, dentre os que o Power devolveu (dono, 11/09/2026):
 *  - tem Veiculos Especiais → SO Especiais (nada de Basico/VIP junto);
 *  - moto → so o plano da cilindrada (o site ja escolhe um: ate 400 cc ou acima);
 *  - o resto → Basico, Do Seu Jeito, VIP/VIP SUV (e Premium, quando o Power devolve).
 * Nunca acrescenta plano que o Power nao devolveu — preco inventado e proibido.
 */
export function planosQueAparecem<T extends { id: string }>(planos: T[]): T[] {
  if (planos.some((p) => p.id === 'especial')) return planos.filter((p) => p.id === 'especial')
  const motos = planos.filter((p) => p.id === 'moto-400' || p.id === 'moto-1000')
  if (motos.length) return motos.slice(0, 1)
  return planos.filter((p) => ['basico', 'do-seu-jeito', 'vip', 'suv', 'premium'].includes(p.id))
}
