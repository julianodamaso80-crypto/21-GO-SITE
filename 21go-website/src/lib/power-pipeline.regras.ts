/**
 * Regras puras da criacao PELA PIPELINE no Power (o botao "Nova Negociacao" do painel).
 *
 * Regra do dono (21/09/2026): card da Leticya nasce como se ELA tivesse criado — o historico
 * do Power diz "Leticya criou a negociacao pela pipeline", e nao "Negociacao criada pelo
 * powerlink". So o painel, com a sessao dela, escreve isso; a PowerAPI sempre escreve
 * "powerlink". O PowerLink continua de reserva: se a pipeline falhar, o cliente entra por
 * ele — o associado NUNCA fica sem cadastro no Power.
 *
 * Tudo aqui foi medido contra o painel em 21/09/2026 (pipeline.js, handler #nwQttnSaveBttn).
 */

/** PowerLink da Leticya — o default do site e da Isa. So ela nasce pela pipeline. */
export const POWERLINK_LETICYA = 'WDVMKnkq'

export function criaPelaPipeline(powerlink: string | null | undefined): boolean {
  return powerlink === POWERLINK_LETICYA
}

function digitos(tel: string | number | null | undefined): string {
  let d = String(tel ?? '').replace(/\D/g, '')
  // O Power guarda sem o 55; o reformatPhone do painel cortaria em 11 digitos e gravaria
  // "(55) 21969-..." no lugar do numero.
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d
}

/** Mascara do painel: "(21) 96409-1921". Numero que nao fecha vira vazio (o e-mail segura). */
export function telefoneDoPainel(tel: string | number | null | undefined): string {
  const d = digitos(tel)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return ''
}

/**
 * Capital de cada estado, com o id do catalogo de cidades do Power (`/api/quotation/ct`),
 * lido em 21/09/2026. O site nao pergunta a cidade (1.659 leads, todos sem cidade), e sem
 * cidade de circulacao o card nasce SEM PLANOS. Decisao do dono: vale a capital do estado
 * do DDD do celular.
 */
const CAPITAIS: Record<string, { cidadeId: number; cidade: string; ddds: number[] }> = {
  SP: { cidadeId: 5270, cidade: 'São Paulo', ddds: [11, 12, 13, 14, 15, 16, 17, 18, 19] },
  RJ: { cidadeId: 3658, cidade: 'Rio de Janeiro', ddds: [21, 22, 24] },
  ES: { cidadeId: 78, cidade: 'Vitória', ddds: [27, 28] },
  MG: { cidadeId: 1630, cidade: 'Belo Horizonte', ddds: [31, 32, 33, 34, 35, 37, 38] },
  PR: { cidadeId: 2878, cidade: 'Curitiba', ddds: [41, 42, 43, 44, 45, 46] },
  SC: { cidadeId: 4500, cidade: 'Florianópolis', ddds: [47, 48, 49] },
  RS: { cidadeId: 4174, cidade: 'Porto Alegre', ddds: [51, 53, 54, 55] },
  DF: { cidadeId: 882, cidade: 'Brasília', ddds: [61] },
  GO: { cidadeId: 977, cidade: 'Goiânia', ddds: [62, 64] },
  TO: { cidadeId: 5514, cidade: 'Palmas', ddds: [63] },
  MT: { cidadeId: 1383, cidade: 'Cuiabá', ddds: [65, 66] },
  MS: { cidadeId: 1506, cidade: 'Campo Grande', ddds: [67] },
  AC: { cidadeId: 94, cidade: 'Rio Branco', ddds: [68] },
  RO: { cidadeId: 4382, cidade: 'Porto Velho', ddds: [69] },
  BA: { cidadeId: 616, cidade: 'Salvador', ddds: [71, 73, 74, 75, 77] },
  SE: { cidadeId: 5353, cidade: 'Aracaju', ddds: [79] },
  PE: { cidadeId: 3315, cidade: 'Recife', ddds: [81, 87] },
  AL: { cidadeId: 147, cidade: 'Maceió', ddds: [82] },
  PB: { cidadeId: 2655, cidade: 'João Pessoa', ddds: [83] },
  RN: { cidadeId: 3770, cidade: 'Natal', ddds: [84] },
  CE: { cidadeId: 756, cidade: 'Fortaleza', ddds: [85, 88] },
  PI: { cidadeId: 3582, cidade: 'Teresina', ddds: [86, 89] },
  PA: { cidadeId: 2436, cidade: 'Belém', ddds: [91, 93, 94] },
  AM: { cidadeId: 256, cidade: 'Manaus', ddds: [92, 97] },
  RR: { cidadeId: 4400, cidade: 'Boa Vista', ddds: [95] },
  AP: { cidadeId: 209, cidade: 'Macapá', ddds: [96] },
  MA: { cidadeId: 1314, cidade: 'São Luís', ddds: [98, 99] },
}

export function cidadeDoDdd(
  tel: string | number | null | undefined,
): { uf: string; cidadeId: number; cidade: string } | null {
  const ddd = Number(digitos(tel).slice(0, 2))
  for (const [uf, c] of Object.entries(CAPITAIS)) {
    if (c.ddds.includes(ddd)) return { uf, cidadeId: c.cidadeId, cidade: c.cidade }
  }
  return null
}

/**
 * Ano do MODELO, que e o que o campo "Ano modelo" do painel quer (catalogo /bmy, id == ano).
 * O DENATRAN manda "fabricacao/modelo"; sem ele, vale o ano que o cliente escolheu no site.
 */
export function anoDoModelo(
  anoDenatran: string | null | undefined,
  anoDoSite: string | number | null | undefined,
): number | null {
  const m = String(anoDenatran ?? '').match(/^\d{4}\/(\d{4})$/)
  if (m) return Number(m[1])
  const site = String(anoDoSite ?? '')
  if (/zero/i.test(site)) return 32000
  const a = site.match(/(\d{4})/)
  return a ? Number(a[1]) : null
}

interface EtapaDoFunil {
  id?: string
  order?: number
  isFunnelDefault?: boolean
}
interface FunilDetalhado {
  phases?: { stages?: EtapaDoFunil[] }[]
}

/**
 * A etapa onde o proprio painel cria o card (syncCurrentFunnelGlobals). Sem `stageId` o
 * Power responde "Versao incorreta. Por favor, atualize sua pagina" e nao cria nada.
 */
export function etapaPadrao(funis: FunilDetalhado[]): { stageId: string; stageIndex: number } | null {
  const etapas = (funis?.[0]?.phases ?? []).flatMap((p) => p.stages ?? []).filter((s) => s?.id)
  const e = etapas.find((s) => s.isFunnelDefault) ?? etapas[0]
  return e?.id ? { stageId: e.id, stageIndex: Number(e.order ?? 0) } : null
}

export type Criacao =
  | { ok: true; quotationId: number; quotationCode: string; negotiationCode: string }
  | { ok: false; motivo: string; duplicada?: { placa: string; cardId: string } }

export function lerCriacao(r: Record<string, unknown> | null | undefined): Criacao {
  if (!r) return { ok: false, motivo: 'resposta vazia do Power' }
  const id = Number(r.id ?? 0)
  if (id > 0 && r.text && r.back) {
    return { ok: true, quotationId: id, quotationCode: String(r.text), negotiationCode: String(r.back) }
  }
  // `text: null` e a trava de 7 dias do Power: a placa (ou o chassi) ja esta em outro card.
  // Vale para a EMPRESA inteira, nao so para ela — medido em 23/09/2026 com a placa KOY6D00,
  // que estava no card de outro consultor desde 21/09.
  if (r.text === null) {
    return {
      ok: false,
      motivo: `placa/chassi ${r.plates ?? ''} ja esta no card ${r.cardId ?? ''}`,
      duplicada: { placa: String(r.plates ?? ''), cardId: String(r.cardId ?? '') },
    }
  }
  return { ok: false, motivo: String(r.text ?? 'recusa sem motivo') }
}

/**
 * O que fazer quando o Power recusa por placa repetida — decisao do dono, 23/09/2026.
 *
 * A busca do funil roda com a sessao DELA e so enxerga os cards DELA (provado no mesmo dia: o
 * card do outro consultor nem responde ao `fetchNegotiationCard` dela). Entao:
 *
 * - achou  -> e o MESMO cliente preenchendo de novo. Nao se cria um segundo card: usa-se o que
 *   existe. Em 23/09 foram 3 cards do mesmo Romario em 1h35, e o cliente ja estava cadastrado.
 * - nao achou -> a placa esta presa no card de outro consultor. O cliente entrou pelo site DELA,
 *   entao nasce o card dela pelo PowerLink — o unico caminho que o Power aceita nesse caso — e
 *   ninguem e avisado ("cria pelo power link e nao me avisa no tel").
 */
export function decidirDuplicata(cardDaPlaca: string | null | undefined): 'usar_o_que_existe' | 'powerlink' {
  return cardDaPlaca ? 'usar_o_que_existe' : 'powerlink'
}

export interface NovaNegociacao {
  nome: string
  telefone?: string | null
  email?: string | null
  placa?: string | null
  tipoVeiculo: number
  modeloId?: number | null
  anoModelo?: number | null
  cidadeId?: number | null
  origem: number
  cooperativa: number
  etapa: { stageId: string; stageIndex: number }
  chassi?: string | null
  motor?: string | null
  veiculoDeTrabalho?: boolean
}

/** O corpo que o painel monta no clique de "Adicionar Negociacao" — mesmos campos, mesmos tipos. */
export function montarNovaNegociacao(n: NovaNegociacao): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    name: n.nome.trim(),
    coop: String(n.cooperativa),
    phone: telefoneDoPainel(n.telefone),
    email: (n.email ?? '').trim(),
    city: n.cidadeId ? String(n.cidadeId) : '',
    sendToClient: false,
    workVehicle: Boolean(n.veiculoDeTrabalho),
    vhclModel: n.modeloId ? String(n.modeloId) : '',
    vhclYear: n.anoModelo ? String(n.anoModelo) : '',
    vhclIsCab: false,
    leadOrigem: String(n.origem),
    leadOrigemSub: null,
    plates: (n.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    vhclType: String(n.tipoVeiculo),
    stageId: n.etapa.stageId,
    stageIndex: n.etapa.stageIndex,
  }
  if (n.chassi?.trim()) corpo.chassi = n.chassi.trim()
  if (n.motor?.trim()) corpo.engineNumber = n.motor.trim()
  return corpo
}
