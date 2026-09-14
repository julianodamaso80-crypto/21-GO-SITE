/**
 * Quem decide se a 21Go faz o veiculo — a regra sozinha, sem rede, pra poder ser testada.
 *
 * A lista certa e a do PowerCRM (`POST /api/plans/`), que e a mesma resposta que o consultor
 * ve na cotacao dele. Regra do dono (06/08/2026), depois de perder venda com veiculo que a
 * 21Go faz: o site segue 100% o Power, sem lista paralela e sem regra propria.
 *
 *   1. "nao fazemos esse veiculo" so pode ser dito quando o Power CONFIRMA que nao ha plano.
 *   2. Silencio do Power nao e "nao": se a consulta falhou, o cliente vai pro consultor.
 *
 * O que saiu junto desta decisao:
 *   - a lista de ~100 marcas/modelos escrita a mao (rodava no front DEPOIS de o Power ja ter
 *     aprovado o veiculo — so podia virar "faz" em "nao faz").
 *
 * A allowlist extraida (`vehicle-allowlist.ts`) ficou so como sinal de "vale um humano
 * conferir": ela envelhece rapido — com 3 dias ja bloqueava o BYD Dolphin Mini, que o Power
 * cota normalmente — entao nao dispensa cliente sozinha.
 *
 * EXCECAO DE ANO (ordem do dono, 12/08/2026): o corte em 2006 VOLTOU e vale acima do Power.
 * Motivo: as tabelas de preco do Power cotam ate 1998, mas a 21Go nao aceita veiculo abaixo de
 * 2006 — sairam do site um Ford Ka 2003 (id 1678) e outros com plano cheio vindo do Power.
 * Aqui o Power nao e a autoridade: e cadastro dele que esta largo, nao regra comercial.
 */

export type Elegibilidade =
  /** Power confirmou plano de protecao (ou nao ha motivo pra duvidar) — segue a cotacao. */
  | { acao: 'cotar' }
  /**
   * Nao fazemos: `model` = o Power negou; `ano` = anterior a 2006; `byd_leilao` = BYD de
   * leilao/remarcado. A tela agradece e encerra.
   */
  | { acao: 'nao_fazemos'; motivo: 'model' | 'ano' | 'byd_leilao' | 'modelo_excluido' | 'moto_leilao' }
  /** Nao deu pra confirmar. Cliente vai pro WhatsApp do consultor, nunca dispensado. */
  | { acao: 'consultor'; motivo: 'elegibilidade_indisponivel' }

/** Primeiro ano-modelo que a 21Go aceita. Abaixo disso nao ha cotacao, o Power que se entenda. */
export const ANO_MINIMO = 2006

/** Ano desconhecido nao reprova: dispensar cliente no escuro e o erro que custa venda. */
export function aceitaAno(ano: number | null | undefined): boolean {
  if (ano == null || !Number.isFinite(ano)) return true
  return ano >= ANO_MINIMO
}

/**
 * BYD de leilao ou remarcado nao e aceito — NENHUM modelo (ordem do dono, 27/08/2026).
 *
 * Como a exececao de ano, esta regra vence o Power: ele cota o veiculo normalmente (saiu do
 * site um Song Pro 2025 marcado como leilao, com plano Veiculos Especiais e ativacao de
 * R$ 1.550). Nao e cadastro largo do Power — e regra comercial que so existe aqui.
 *
 * Olha marca E modelo porque nem todo fluxo separa os dois: a descricao que chega pode ser
 * "BYD Song Pro GL 1.5 16V Aut. (Hibrido)" inteira no modelo. `\bbyd\b` pra nao pegar marca
 * nenhuma que apenas contenha essas tres letras.
 */
export function ehBydDeLeilao(
  marca: string | null | undefined,
  modelo: string | null | undefined,
  origem: string | null | undefined,
): boolean {
  if (!origem || origem === 'nao') return false
  return /\bbyd\b/i.test(`${marca || ''} ${modelo || ''}`)
}

/**
 * A LISTA — o que a 21Go nao faz, mesmo com o Power cotando.
 *
 * Ordem do dono (14/09/2026): *"chegou um veiculo, voce vai consultar essa lista; se tiver na
 * lista e o que nao faz, ja segue que nao faz; ai depois voce consulta o Power"*. E por isso
 * que ela roda ANTES do `/api/plans/` em `decidirElegibilidade`.
 *
 * ⚠️ Cada nome fica amarrado a MARCA dele. Padrao solto no texto recusa veiculo que a 21Go FAZ
 * — medido contra as 6.900 versoes do catalogo do Power em 14/09/2026:
 *
 *     "smart"  pegava Hyundai Creta Smart      "MINI"  pegava BYD Dolphin Mini
 *     "Blazer" pegava o Blazer EV (o novo)     "500"   pegava Honda CB 500 e quadriciclo BRP
 *     "CC"     pegava JAC E-JV CC e Maserati
 *
 * ⚠️ Isto NAO e a volta da lista por nome banida em 06/08/2026. Aquela dizia quem PODE cotar e
 * derrubava venda de veiculo que a 21Go faz. Esta so tira o que o dono mandou tirar, e cada
 * entrada veio de uma linha escrita por ele. Nao inferir, nao "completar" a lista.
 */
interface Excluido {
  /** Como a linha aparece na lista do dono — pra achar a origem de cada recusa. */
  nome: string
  /** A marca a que a regra pertence. Sozinha, exclui a marca inteira. */
  marca: RegExp
  /** A versao dentro da marca. */
  modelo?: RegExp
  /** Escapa da regra (o "exceto" da lista). */
  exceto?: RegExp
  /** Ano-modelo ate o qual vale a exclusao — a geracao nova voltou a ser aceita. */
  ate?: number
}

/** Marcas inteiras. Ancoradas no inicio: a marca abre o texto, venha separada ou na descricao. */
const MARCAS: Excluido[] = [
  { nome: 'AGRALE', marca: /^agrale\b/i },
  { nome: 'ALFA ROMEU', marca: /^alfa\s*rom/i },
  { nome: 'AM GEN', marca: /^am\s*gen\b/i },
  { nome: 'ASIA MOTORS', marca: /^asia\b/i },
  { nome: 'AUDI', marca: /^audi\b/i },
  { nome: 'BABY', marca: /^baby\b/i },
  { nome: 'BRM', marca: /^brm\b/i },
  { nome: 'BUGRE', marca: /^bugre\b/i },
  // O Power cadastra tambem como "Caoa Changan".
  { nome: 'CHANA', marca: /^chana\b/i },
  { nome: 'CHANGAN', marca: /^(caoa\s+)?changan\b/i },
  // "Exceto Tiggo, que precisa comparecer na empresa" — o Tiggo segue cotando pelo Power.
  { nome: 'CAOA CHERRY', marca: /^(caoa\s+)?chery\b/i, exceto: /\btiggo\b/i },
  { nome: 'CHRYSLER', marca: /^chrysler\b/i },
  { nome: 'CROSS LANDER', marca: /^cross\s*lander\b/i },
  { nome: 'DAEWOO', marca: /^daewoo\b/i },
  { nome: 'DAIHATSU', marca: /^daihatsu\b/i },
  { nome: 'DODGE', marca: /^dodge\b/i },
  { nome: 'EFFA', marca: /^effa\b/i },
  { nome: 'FIBRAVAN', marca: /^fibravan\b/i },
  { nome: 'FYBER', marca: /^fyber\b/i },
  { nome: 'GELLY', marca: /^geely\b/i },
  { nome: 'HAFEI', marca: /^hafei\b/i },
  { nome: 'HAIMA', marca: /^haima\b/i },
  { nome: 'JAC', marca: /^jac\b/i },
  { nome: 'JAMBELI', marca: /^jambeli\b/i },
  { nome: 'LADA', marca: /^lada\b/i },
  { nome: 'LAND ROVER', marca: /^land[\s-]*rover\b/i },
  { nome: 'LANDWIND', marca: /^landwind\b/i },
  { nome: 'LEXUS', marca: /^lexus\b/i },
  { nome: 'LIFAN', marca: /^lifan\b/i },
  { nome: 'MAHINDRA', marca: /^mahindra\b/i },
  { nome: 'MAZDA', marca: /^mazda\b/i },
  { nome: 'MINI', marca: /^mini\b/i },
  { nome: 'MIURA', marca: /^miura\b/i },
  { nome: 'RELY', marca: /^rely\b/i },
  { nome: 'SEAT', marca: /^seat\b/i },
  { nome: 'SMART', marca: /^smart\b/i },
  { nome: 'SSANGYONG', marca: /^ssangyong\b/i },
  { nome: 'SUBARO', marca: /^subaru\b/i },
  { nome: 'SUZUKI', marca: /^suzuki\b/i },
  { nome: 'TAC', marca: /^tac\b/i },
  { nome: 'VOLVO', marca: /^volvo\b/i },
  { nome: 'WAKE', marca: /^wake\b/i },
]

/* As marcas como o Power as escreve, pra amarrar os modelos. */
const CHEVROLET = /chevrolet|^gm\b/i
const CITROEN = /^citro/i
const FIAT = /^fiat\b/i
const FORD = /^ford\b/i
const HONDA = /^honda\b/i
const HYUNDAI = /^hyundai\b/i
const KIA = /^kia\b/i
const MITSUBISHI = /^mitsubishi\b/i
const NISSAN = /^nissan\b/i
const PEUGEOT = /^peugeot\b/i
const RENAULT = /^renault\b/i
const TOYOTA = /^toyota\b/i
const VW = /volkswagen|^vw\b/i
const YAMAHA = /^yamaha\b/i

/** Modelos, marca por marca. Cada linha da lista do dono vira uma entrada. */
const MODELOS: Excluido[] = [
  // CHEVROLET. "S10 BLAZER (todos)" e a S10 antiga — o BLAZER EV e outro carro e continua.
  { nome: 'CHEVROLET Captiva', marca: CHEVROLET, modelo: /\bcaptiva\b/i },
  { nome: 'CHEVROLET Malibu', marca: CHEVROLET, modelo: /\bmalibu\b/i },
  { nome: 'CHEVROLET Camaro', marca: CHEVROLET, modelo: /\bcamaro\b/i },
  { nome: 'CHEVROLET Omega', marca: CHEVROLET, modelo: /\bomega\b/i },
  { nome: 'CHEVROLET S10 Blazer', marca: CHEVROLET, modelo: /\bs-?10\s+blazer\b/i },
  { nome: 'CHEVROLET Corvette', marca: CHEVROLET, modelo: /\bcorvette\b/i },
  { nome: 'CHEVROLET Sonic', marca: CHEVROLET, modelo: /\bsonic\b/i },
  { nome: 'CHEVROLET Bolt', marca: CHEVROLET, modelo: /\bbolt\b/i },
  { nome: 'CHEVROLET Suburban', marca: CHEVROLET, modelo: /\bsuburban\b/i },
  { nome: 'CHEVROLET Suprema', marca: CHEVROLET, modelo: /\bsuprema\b/i },
  { nome: 'CHEVROLET Silverado', marca: CHEVROLET, modelo: /\bsilverado\b/i },
  { nome: 'CHEVROLET Zafira', marca: CHEVROLET, modelo: /\bzafira\b/i },
  // "Tracker ate 2013": o Tracker de 2014 em diante e outra geracao e segue cotando.
  { nome: 'CHEVROLET Tracker ate 2013', marca: CHEVROLET, modelo: /\btracker\b/i, ate: 2013 },
  // 10/09/2026, com um Meriva Maxx 1.4 2012 na mao: "nenhum meriva faz ... tirar de todos site".
  { nome: 'CHEVROLET Meriva', marca: CHEVROLET, modelo: /\bmeriva\b/i },

  // CITROEN. "C4 todos (exceto Cactus)".
  { nome: 'CITROEN Xsara', marca: CITROEN, modelo: /\bxsara\b/i },
  { nome: 'CITROEN Picasso', marca: CITROEN, modelo: /\bpicasso\b/i },
  { nome: 'CITROEN Evasion', marca: CITROEN, modelo: /\bevasion\b/i },
  { nome: 'CITROEN Xantia', marca: CITROEN, modelo: /\bxantia\b/i },
  { nome: 'CITROEN XM', marca: CITROEN, modelo: /\bxm\b/i },
  { nome: 'CITROEN Lounge', marca: CITROEN, modelo: /\blounge\b/i },
  { nome: 'CITROEN C4 (exceto Cactus)', marca: CITROEN, modelo: /\bc4\b/i, exceto: /\bcactus\b/i },
  { nome: 'CITROEN C5', marca: CITROEN, modelo: /\bc5\b/i },
  { nome: 'CITROEN C6', marca: CITROEN, modelo: /\bc6\b/i },
  { nome: 'CITROEN C8', marca: CITROEN, modelo: /\bc8\b/i },
  // A lista traz "AIRcross" como se fosse marca; e modelo da Citroen.
  { nome: 'AIRcross', marca: CITROEN, modelo: /\baircross\b/i },

  // FIAT.
  { nome: 'FIAT 500', marca: FIAT, modelo: /\b500\b/i },
  { nome: 'FIAT Brava', marca: FIAT, modelo: /\bbrava\b/i },
  { nome: 'FIAT Bravo', marca: FIAT, modelo: /\bbravo\b/i },
  { nome: 'FIAT Marea', marca: FIAT, modelo: /\bmarea\b/i },
  { nome: 'FIAT Stilo', marca: FIAT, modelo: /\bstilo\b/i },
  { nome: 'FIAT Tempra', marca: FIAT, modelo: /\btempra\b/i },
  { nome: 'FIAT Tipo', marca: FIAT, modelo: /\btipo\b/i },
  // 08/09/2026: "nenhum veiculo ideia faz, msm se tiver no power ta errado". O dono escreve
  // "ideia", a Fiat escreve "Idea" — as duas grafias barram, e o \b poupa "Idealle".
  { nome: 'FIAT Idea', marca: FIAT, modelo: /\bide(i)?a\b/i },
  { nome: 'FIAT Linea', marca: FIAT, modelo: /\blinea\b/i },
  { nome: 'FIAT Freemont', marca: FIAT, modelo: /\bfreemont\b/i },
  { nome: 'FIAT Palio Week.', marca: FIAT, modelo: /\bpalio\s+week/i },

  // FORD. "EcoSport (ate 2012)": a geracao de 2013 em diante segue cotando.
  { nome: 'FORD Edge', marca: FORD, modelo: /\bedge\b/i },
  { nome: 'FORD Explorer', marca: FORD, modelo: /\bexplorer\b/i },
  { nome: 'FORD Mondeo', marca: FORD, modelo: /\bmondeo\b/i },
  { nome: 'FORD Transit', marca: FORD, modelo: /\btransit\b/i },
  { nome: 'FORD Maverick', marca: FORD, modelo: /\bmaverick\b/i },
  { nome: 'FORD Mustang', marca: FORD, modelo: /\bmustang\b/i },
  { nome: 'FORD F150', marca: FORD, modelo: /\bf-?\s?150\b/i },
  { nome: 'FORD Bronco', marca: FORD, modelo: /\bbronco\b/i },
  { nome: 'FORD EcoSport ate 2012', marca: FORD, modelo: /\becosport\b/i, ate: 2012 },
  { nome: 'FORD Territory', marca: FORD, modelo: /\bterritory\b/i },
  { nome: 'FORD Focus', marca: FORD, modelo: /\bfocus\b/i },
  { nome: 'FORD Courier', marca: FORD, modelo: /\bcourier\b/i },
  { nome: 'FORD Escort', marca: FORD, modelo: /\bescort\b/i },
  { nome: 'FORD Fusion', marca: FORD, modelo: /\bfusion\b/i },

  // HONDA.
  { nome: 'HONDA Accord', marca: HONDA, modelo: /\baccord\b/i },
  { nome: 'HONDA Civic Coupe', marca: HONDA, modelo: /\bcivic\s+coup/i },

  // HYUNDAI.
  { nome: 'HYUNDAI Santa Fe', marca: HYUNDAI, modelo: /\bsanta\s*f[eé]\b/i },
  { nome: 'HYUNDAI Sonata', marca: HYUNDAI, modelo: /\bsonata\b/i },
  { nome: 'HYUNDAI Veracruz', marca: HYUNDAI, modelo: /\bveracruz\b/i },
  { nome: 'HYUNDAI Veloster', marca: HYUNDAI, modelo: /\bveloster\b/i },
  { nome: 'HYUNDAI Azera', marca: HYUNDAI, modelo: /\bazera\b/i },

  // KIA. As grafias da lista ("Carniva I", "Margentis", "Serato") sao as do Power aqui.
  { nome: 'KIA Carnival', marca: KIA, modelo: /\bcarnival\b/i },
  { nome: 'KIA Stinger', marca: KIA, modelo: /\bstinger\b/i },
  { nome: 'KIA Quoris', marca: KIA, modelo: /\bquoris\b/i },
  { nome: 'KIA Picanto', marca: KIA, modelo: /\bpicanto\b/i },
  { nome: 'KIA Niro', marca: KIA, modelo: /\bniro\b/i },
  { nome: 'KIA Sorento', marca: KIA, modelo: /\bsorento\b/i },
  { nome: 'KIA Stonic', marca: KIA, modelo: /\bstonic\b/i },
  { nome: 'KIA Cadenza', marca: KIA, modelo: /\bcadenza\b/i },
  { nome: 'KIA Optima', marca: KIA, modelo: /\boptima\b/i },
  { nome: 'KIA Carens', marca: KIA, modelo: /\bcarens\b/i },
  { nome: 'KIA Magentis', marca: KIA, modelo: /\bmagentis\b/i },
  { nome: 'KIA Mohave', marca: KIA, modelo: /\bmohave\b/i },
  { nome: 'KIA Cerato', marca: KIA, modelo: /\bcerato\b/i },

  // MITSUBISHI. "L200 Outdoor (GLS) (HPE)" — so a Outdoor; Triton, Savana e Sport nao estao
  // escritos na linha. O Power tambem cadastra como "L200 T.OUTDOOR".
  { nome: 'MITSUBISHI Lancer', marca: MITSUBISHI, modelo: /\blancer\b/i },
  { nome: 'MITSUBISHI L200 Outdoor', marca: MITSUBISHI, modelo: /\bl-?200\s+(t\.\s*)?outdoor\b/i },

  // NISSAN.
  { nome: 'NISSAN GT-R', marca: NISSAN, modelo: /\bgt-?r\b/i },
  { nome: 'NISSAN X-Terra', marca: NISSAN, modelo: /\bx-?\s?terra\b/i },
  { nome: 'NISSAN X-Trail', marca: NISSAN, modelo: /\bx-?\s?trail\b/i },
  { nome: 'NISSAN Tiida', marca: NISSAN, modelo: /\bti+da\b/i },

  // PEUGEOT. "Todos os conversiveis" = as versoes CC e Cabriolet.
  { nome: 'PEUGEOT 306', marca: PEUGEOT, modelo: /\b306\b/ },
  { nome: 'PEUGEOT 405', marca: PEUGEOT, modelo: /\b405\b/ },
  { nome: 'PEUGEOT 406', marca: PEUGEOT, modelo: /\b406\b/ },
  { nome: 'PEUGEOT 407', marca: PEUGEOT, modelo: /\b407\b/ },
  { nome: 'PEUGEOT 408', marca: PEUGEOT, modelo: /\b408\b/ },
  { nome: 'PEUGEOT 504', marca: PEUGEOT, modelo: /\b504\b/ },
  { nome: 'PEUGEOT 806', marca: PEUGEOT, modelo: /\b806\b/ },
  { nome: 'PEUGEOT 807', marca: PEUGEOT, modelo: /\b807\b/ },
  { nome: 'PEUGEOT RCZ', marca: PEUGEOT, modelo: /\brcz\b/i },
  { nome: 'PEUGEOT conversiveis', marca: PEUGEOT, modelo: /\bcc\b|cabrio|convers/i },

  // RENAULT.
  { nome: 'RENAULT Laguna', marca: RENAULT, modelo: /\blaguna\b/i },
  { nome: 'RENAULT Twingo', marca: RENAULT, modelo: /\btwingo\b/i },
  { nome: 'RENAULT Symbol', marca: RENAULT, modelo: /\bsymbol\b/i },
  { nome: 'RENAULT Fluence', marca: RENAULT, modelo: /\bfluence\b/i },
  { nome: 'RENAULT Zoe', marca: RENAULT, modelo: /\bzoe\b/i },

  // TOYOTA. 12/09/2026, com um Prius 1.8 Hibrido 2017 cotado pela Isa: "nao fazemos esse carro".
  { nome: 'TOYOTA Prius', marca: TOYOTA, modelo: /\bprius\b/i },

  // VOLKSWAGEN.
  { nome: 'VW Bora', marca: VW, modelo: /\bbora\b/i },
  { nome: 'VW Passat Variant', marca: VW, modelo: /\bpassat\s+variant\b/i },
  { nome: 'VW Eos', marca: VW, modelo: /\beos\b/i },
  { nome: 'VW SpaceFox', marca: VW, modelo: /\bspace\s*fox\b/i },
  { nome: 'VW Jetta', marca: VW, modelo: /\bjetta\b/i },

  // YAMAHA.
  { nome: 'YAMAHA XJ6', marca: YAMAHA, modelo: /\bxj-?6\b/i },
]

const LISTA: Excluido[] = [...MARCAS, ...MODELOS]

/**
 * O veiculo esta na lista? Vale acima da resposta do Power.
 *
 * `ano` e opcional porque nem todo chamador tem: a lista de modelos do formulario roda antes de
 * o cliente escolher o ano. Sem ano, as regras com corte de ano (Tracker, EcoSport) NAO barram
 * — esconder a familia inteira do formulario tiraria a geracao nova, que a 21Go faz.
 */
export function ehModeloExcluido(
  marca: string | null | undefined,
  modelo: string | null | undefined,
  ano?: number | null,
): boolean {
  const daMarca = (marca || '').trim()
  const daVersao = (modelo || '').trim()
  const texto = `${daMarca} ${daVersao}`.trim()
  if (!texto) return false

  return LISTA.some((r) => {
    // Sem campo de marca separado, a descricao inteira chega no modelo e a marca abre o texto.
    if (!r.marca.test(daMarca || texto)) return false
    if (r.exceto?.test(texto)) return false
    if (!r.modelo) return true
    if (!r.modelo.test(texto)) return false
    if (r.ate == null) return true
    return ano != null && Number.isFinite(ano) && ano <= r.ate
  })
}

export interface EntradaElegibilidade {
  /** Ano-modelo do veiculo. `null` quando nao deu pra resolver. */
  ano: number | null
  /** Resposta do `/api/plans/`: true da plano, false nao da, null nao deu pra perguntar. */
  powerAoVivo: boolean | null
  /** Allowlist extraida do painel: true/false, null quando nao ha id pra consultar. */
  allowlist: boolean | null
  /** Marca do veiculo, como o Power devolveu. So usada pra barrar BYD de leilao. */
  marca?: string | null
  /** Modelo/versao do veiculo. Idem. */
  modelo?: string | null
  /** Origem declarada pelo cliente: 'nao' | 'leilao' | 'remarcado'. */
  origem?: string | null
  /** E moto? Moto de leilao/remarcada a 21Go nao faz (dono, 12/09/2026). */
  moto?: boolean
}

export function decidirElegibilidade(e: EntradaElegibilidade): Elegibilidade {
  // Antes do Power de proposito: sao as tres regras do site que vencem a resposta dele.
  if (!aceitaAno(e.ano)) return { acao: 'nao_fazemos', motivo: 'ano' }
  if (ehModeloExcluido(e.marca, e.modelo, e.ano)) {
    return { acao: 'nao_fazemos', motivo: 'modelo_excluido' }
  }
  if (ehBydDeLeilao(e.marca, e.modelo, e.origem)) {
    return { acao: 'nao_fazemos', motivo: 'byd_leilao' }
  }
  // Moto de leilao, remarcada ou de sinistro: nao fazemos de jeito nenhum (dono, 12/09/2026).
  const origem = (e.origem || '').trim().toLowerCase()
  if (e.moto && origem !== '' && origem !== 'nao' && origem !== 'não') {
    return { acao: 'nao_fazemos', motivo: 'moto_leilao' }
  }

  if (e.powerAoVivo === true) return { acao: 'cotar' }
  if (e.powerAoVivo === false) return { acao: 'nao_fazemos', motivo: 'model' }

  // Power mudo: o site NAO cota por conta propria (ordem do dono, 31/08/2026 — "vc sempre vai
  // seguir o power"). Antes cotava pela tabela local quando nao havia suspeita na allowlist, e
  // era exatamente ai que ele mostrava plano que o Power nao da e preco que nao bate.
  //
  // Nao e recusa: o cliente vai pro consultor, com o lead parcial salvo. E raro por medicao —
  // em 47 versoes de 10 marcas o /api/plans/ respondeu 47 vezes.
  return { acao: 'consultor', motivo: 'elegibilidade_indisponivel' }
}
