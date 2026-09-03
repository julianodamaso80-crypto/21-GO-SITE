/**
 * Regra de leitura dos planos do PowerCRM. Fica separada do client (`powercrm-planos.ts`,
 * que e server-only) pra poder ser testada sem subir o Next — mesmo motivo do
 * `cobertura.regras.ts` no CRM.
 */

import type { PlanId, PricingBand } from '../data/pricing'

/**
 * Monitoramento e "Roubo e Furto + Ass 24h" sao rastreador/cobertura parcial — o site nao vende
 * nenhum dos dois. Criterio do dono (31/07/2026): so vale o veiculo que faz aparecer plano de
 * protecao de verdade (BASICO, Do Seu Jeito, VIP, VIP SUV, VIP ESPECIAIS, VIP MOTOS, PREMIUM).
 *
 * Compara pelo COMECO do nome de proposito: "ROUBO E FURTO + Ass 24h + Monitoramento" nao pode
 * passar por protecao so porque contem "Roubo e Furto", nem ser confundido com monitoramento
 * puro porque termina em "Monitoramento".
 */
export function ePlanoDeProtecao(nome: string): boolean {
  const n = nome.trim().toLowerCase()
  if (!n) return false
  return !n.startsWith('monitoramento') && !n.startsWith('roubo e furto')
}

/**
 * Nome da tabela do Power -> plano do site (so pra pegar as coberturas de `PLAN_INFO`).
 *
 * Ordem importa: "VIP ESPECIAIS" e "VIP SUV" tem que cair em especial/suv antes de bater no
 * `vip` generico. Nome que nao reconhecemos devolve `null` e o plano e DESCARTADO — inventar
 * um id aqui e voltar a mostrar plano que o Power nao deu.
 */
export function mapearPlanoDoPower(nome: string): PlanId | null {
  const n = (nome || '').toLowerCase()
  if (!ePlanoDeProtecao(n)) return null
  if (n.includes('especia')) return 'especial'
  if (n.includes('suv') || n.includes('pick') || n.includes('caminhonete')) return 'suv'
  if (n.includes('moto')) return faixaDeMotoNoNome(n) ?? 'moto-400'
  if (n.includes('premium')) return 'premium'
  if (n.includes('jeito')) return 'do-seu-jeito'
  if (n.includes('vip')) return 'vip'
  if (n.includes('básico') || n.includes('basico')) return 'basico'
  return null
}

type PlanoDeMoto = 'moto-400' | 'moto-1000'

const EH_MOTO = (id: PlanId): id is PlanoDeMoto => id === 'moto-400' || id === 'moto-1000'

/**
 * Qual das duas tabelas de moto o Power esta nomeando — `null` quando o nome nao diz a faixa
 * ("VIP MOTOS" seco), caso em que quem decide e a moto, nao o nome.
 *
 * Medido em 03/09/2026: o Power devolve as DUAS tabelas pra toda moto que ele cota,
 * "VIP MOTOS (HONDA E YAMAHA ATÉ 400 CC)" e "VIP MOTOS (MOTOS ATÉ 1.000 CC)".
 */
export function faixaDeMotoNoNome(nome: string): PlanoDeMoto | null {
  const n = (nome || '').toLowerCase()
  if (!n.includes('moto')) return null
  if (/400/.test(n)) return 'moto-400'
  if (/1[.\s]?000|1000/.test(n)) return 'moto-1000'
  return null
}

/**
 * Dados da moto que decidem a tabela. A cilindrada vem da placa (DENATRAN) ou de
 * `resolveMotoCc` sobre o nome do modelo — quem chama resolve, este modulo nao importa
 * `pricing` pra continuar rodando no `node --test` sem transpilar.
 */
export interface DadosDaMoto {
  marca?: string | null
  cilindrada?: number | null
}

/**
 * Em qual tabela do Power essa moto entra.
 *
 * A tabela barata e nominalmente "HONDA E YAMAHA ATÉ 400 CC" — as duas condicoes valem, e nao
 * so a cilindrada. Uma Kawasaki Versys 650 saiu do site com ela por R$ 257,40 em 03/09/2026
 * (a tabela dela e a de ate 1.000 cc, R$ 282,90).
 *
 * Sem marca conhecida decide so a cilindrada, e cilindrada indeterminada de Honda/Yamaha fica
 * na tabela de 400 — e onde esta a esmagadora maioria delas, e chutar a de cima cobraria a
 * mais de quem faz CG e Factor.
 */
export function tabelaDeMoto(moto?: DadosDaMoto | null): PlanoDeMoto {
  const cc = Number(moto?.cilindrada) || 0
  if (cc > 400) return 'moto-1000'
  const marca = (moto?.marca || '').toLowerCase()
  if (marca && !/honda|yamaha/.test(marca)) return 'moto-1000'
  return 'moto-400'
}

/** Ordem em que os planos aparecem na tela — a mesma da cotacao do consultor. */
const ORDEM: PlanId[] = [
  'basico',
  'do-seu-jeito',
  'vip',
  'suv',
  'especial',
  'moto-400',
  'moto-1000',
  'premium',
]

export interface PlanoCruDoPower {
  name?: string | null
  priceValue?: number | null
}

export interface PlanoLidoDoPower {
  id: PlanId
  /** Nome exato como o Power devolveu — pra auditar divergencia sem adivinhar. */
  nomePower: string
  /** Mensalidade que o Power cobra. E ela que vai pra tela, nao a tabela local. */
  monthly: number
}

/**
 * Le a resposta do `POST /api/plans/` e devolve os planos que o site pode mostrar.
 *
 * Esta funcao e a unica autoridade sobre "quais planos e por quanto": lista vazia significa
 * NAO FAZEMOS esse veiculo, e nao "calcule voce mesmo". O site tinha tabela e heuristica
 * propria (categoria adivinhada por palavra no nome do modelo) e errava — um Tiida 2009 de
 * R$ 28 mil esta em VEICULOS ESPECIAIS no Power, e a BMW X1 sDrive20i nao e SUV pra ele.
 *
 * @param moto marca/modelo/cilindrada da moto — so pra escolher entre as duas tabelas de
 *             motocicleta do Power. O preco continua sendo o dele, o da tabela escolhida.
 */
export function lerPlanosDoPower(
  planos: PlanoCruDoPower[] | null | undefined,
  moto?: DadosDaMoto | null,
): PlanoLidoDoPower[] {
  if (!Array.isArray(planos)) return []

  const lidos: PlanoLidoDoPower[] = []
  for (const p of planos) {
    const nome = (p?.name || '').trim()
    const preco = Number(p?.priceValue)
    // Plano sem preco nao pode ir pra tela: preco 0 vira "gratis" na cara do cliente.
    if (!nome || !Number.isFinite(preco) || preco <= 0) continue
    const id = mapearPlanoDoPower(nome)
    if (!id) continue
    // O Power repete a mesma tabela em respostas diferentes; fica a primeira.
    if (lidos.some((x) => x.id === id)) continue
    lidos.push({ id, nomePower: nome, monthly: preco })
  }

  return resolverMoto(lidos, moto).sort((a, b) => ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id))
}

/**
 * Moto tem UM plano so (regra oficial 21Go), mas o Power devolve as duas tabelas. Escolhe a
 * da moto e devolve com o preco DELA — pegar a primeira da lista era o que fazia a Versys 650
 * sair por R$ 257,40, o preco da tabela de Honda/Yamaha ate 400.
 *
 * Quando o Power manda uma tabela de moto so, ela fica com o preco que veio: o rotulo se
 * ajusta a moto (o nome generico "VIP MOTOS" nao diz faixa), o valor nunca.
 */
function resolverMoto(
  lidos: PlanoLidoDoPower[],
  moto?: DadosDaMoto | null,
): PlanoLidoDoPower[] {
  const motos = lidos.filter((p) => EH_MOTO(p.id))
  if (motos.length === 0) return lidos
  const outros = lidos.filter((p) => !EH_MOTO(p.id))

  const alvo = tabelaDeMoto(moto)
  if (motos.length === 1) {
    const unico = motos[0]
    // Nome sem faixa: quem diz as coberturas e a moto. Com faixa, respeita o que o Power deu.
    const id = faixaDeMotoNoNome(unico.nomePower) ? unico.id : alvo
    return [...outros, { ...unico, id }]
  }

  const escolhido = motos.find((p) => p.id === alvo) || motos[0]
  return [...outros, escolhido]
}

/**
 * Quanto a regra de leilao/remarcado desconta nesse plano, pra esse FIPE: a diferenca entre a
 * faixa do veiculo e a faixa imediatamente abaixo, na tabela oficial (regra do dono,
 * 29/07/2026 — "desce uma faixa", nunca percentual).
 *
 * Devolve o DESCONTO e nao o preco de proposito: quem manda no valor e o Power, e o leilao so
 * desce a mesma quantia que desceria na tabela. Zero quando nao ha faixa anterior (piso) ou
 * quando o FIPE esta fora da tabela — nesses casos nao ha o que descontar, e inventar um
 * desconto sairia mais errado que nao aplicar.
 */
export function descontoDeLeilao(
  tabela: PricingBand[] | undefined,
  fipeValue: number,
): number {
  if (!Array.isArray(tabela) || !Number.isFinite(fipeValue) || fipeValue <= 0) return 0
  const idx = tabela.findIndex((b) => fipeValue >= b.min && fipeValue <= b.max)
  if (idx <= 0) return 0
  const delta = tabela[idx].price - tabela[idx - 1].price
  // Faixa fora de curva (existe na tabela SUV) nunca pode deixar o leilao mais caro.
  return delta > 0 ? delta : 0
}
