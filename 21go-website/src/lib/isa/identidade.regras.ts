/**
 * Identidade do robo de atendimento: tudo o que muda da Isa (casa, 98004-0964, Leticya) pra
 * Mariana (Gabriel Juliano, 96653-0011). Spec: docs/superpowers/specs/2026-10-01-mariana-isa-do-gabriel-design.md.
 *
 * Logica pura, sem `process.env`: o painel no navegador tambem importa este arquivo e la o env do
 * servidor nao chega. O servidor monta a identidade em `identidade.ts`.
 *
 * Regra-mae (dono, 01/10/2026): sem env nenhum, cada valor e o de hoje da Isa, byte a byte.
 */

export type GeneroHumano = 'm' | 'f'

/** Quem assume a conversa quando o bot transfere (Leticya na Isa, Gabriel na Mariana). */
export interface HumanoDoBot {
  /** id da etiqueta e da coluna "Falando com ..." (e pra onde vai quem escolheu plano) */
  id: string
  nome: string
  nomeCompleto: string
  genero: GeneroHumano
  /** 55 + DDD + numero */
  telefone: string
  /** "+55 21 96945-4824": o que vai pro cliente, clicavel no WhatsApp */
  telefoneBonito: string
  /** "21 96945-4824": a resposta pronta do "posso te ligar?" */
  telefoneCurto: string
  /** Como o painel e os alertas chamam a transferencia ("4824" na Isa) */
  apelido: string
}

export interface FonteDeLeads {
  /** null = qualquer origem */
  origens: readonly string[] | null
  dominios: readonly string[]
}

export interface IdentidadeBot {
  nome: string
  /** numero do bot, 55 + DDD + numero */
  numero: string
  /** "98004-0964" */
  numeroBonito: string
  humano: HumanoDoBot
  /** rotulo `por` dos eventos quando o dono responde pelo WhatsApp de alertas */
  donoPor: string
  powerlink: string
  waba: string
  /** conversations/messages.evolution_instance */
  instancia: string
  /** schema das tabelas por-bot (isa_contatos, isa_eventos, isa_config, isa_promocoes, consultor_recrutamento) */
  schema: string
  /** base dos links de PDF que o bot manda */
  siteUrl: string
  painelUrl: string
  /** leads.origem do que a IA cria */
  leadOrigem: string
  trkPrefixo: string
  /** de onde vem quem recebe a mensagem dos 5 min */
  fonte5min: FonteDeLeads
  /** etiquetas da Isa que este bot nao usa */
  semEtiquetas: readonly string[]
  /** so a Isa, na instancia da casa: promocao 40%, vigia-BYD */
  daCasa: boolean
}

export const INSTANCIA_DA_CASA = 'cloud_isa'
export const WABA_DA_CASA = '932143313296745'
export const POWERLINK_DA_CASA = 'WDVMKnkq'
const NUMERO_DA_CASA = '5521980040964'
const TELEFONE_DA_LETICYA = '5521969454824'
const ORIGEM_DA_ISA = 'isa_whatsapp'
const TRK_DA_ISA = 'isa'
const SITE_DA_CASA = 'https://21go.site'
const mesmaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])
// Origens que o formulario do site grava (deriveOrigem). Fica de fora o que o CRM espelha
// (power_crm, manual, seja_consultor) e o que a propria Isa cria (isa_whatsapp).
const ORIGENS_DO_SITE = ['site_organico', 'google_ads', 'meta_ads', 'instagram', 'whatsapp', 'outro']
// Os .site da casa (o mesmo DOMINIOS_DA_CASA de popup.regras.ts).
const DOMINIOS_DA_CASA = ['21go.site', '21goconsultoraleticya.site']

/**
 * Marcas dos leads de bot de parceiro (hoje so a Mariana): a Isa nunca usa esses leads como
 * simulacao do cliente. Os valores sao os do env da Mariana (testes/isa/_mariana.ts confere).
 */
export const LEADS_DE_PARCEIRO: { origens: readonly string[]; dominios: readonly string[] } = {
  origens: ['mariana_whatsapp'],
  dominios: ['21go.app'],
}

type Ambiente = Record<string, string | undefined>

const separar = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const partesDoTelefone = (t: string) => t.match(/^55(\d{2})(\d{4,5})(\d{4})$/)

/** 5521969454824 -> "+55 21 96945-4824" */
export function telefoneBonitoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : t
}

/** 5521969454824 -> "21 96945-4824" */
export function telefoneCurtoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `${m[1]} ${m[2]}-${m[3]}` : t
}

/** 5521980040964 -> "98004-0964" (como o numero do bot aparece nos textos de hoje) */
export function numeroBonitoDe(t: string): string {
  const m = partesDoTelefone(t)
  return m ? `${m[2]}-${m[3]}` : t
}

export function identidadeDoAmbiente(env: Ambiente): IdentidadeBot {
  const v = (chave: string, padrao: string) => (env[chave] || '').trim() || padrao
  const numero = v('BOT_NUMERO', NUMERO_DA_CASA)
  const telefone = v('BOT_HUMANO_TELEFONE', TELEFONE_DA_LETICYA)
  const instancia = v('BOT_INSTANCIA', INSTANCIA_DA_CASA)
  const siteUrl = v('BOT_SITE_URL', SITE_DA_CASA).replace(/\/+$/, '')
  const origens5min = v('BOT_LEADS_5MIN_ORIGENS', ORIGENS_DO_SITE.join(','))
  const id: IdentidadeBot = {
    nome: v('BOT_NOME', 'Isa'),
    numero,
    numeroBonito: numeroBonitoDe(numero),
    humano: {
      id: v('BOT_HUMANO_ID', 'leticya'),
      nome: v('BOT_HUMANO_NOME', 'Leticya'),
      nomeCompleto: v('BOT_HUMANO_NOME_COMPLETO', 'Leticya Thayene'),
      genero: v('BOT_HUMANO_GENERO', 'f') === 'm' ? 'm' : 'f',
      telefone,
      telefoneBonito: telefoneBonitoDe(telefone),
      telefoneCurto: telefoneCurtoDe(telefone),
      apelido: v('BOT_HUMANO_APELIDO', '4824'),
    },
    donoPor: v('BOT_DONO_POR', 'juliano'),
    powerlink: v('POWERCRM_DEFAULT_SLSMN_NW_ID', POWERLINK_DA_CASA),
    waba: v('WA_WABA_ID', WABA_DA_CASA),
    instancia,
    schema: v('BOT_SCHEMA', 'public'),
    siteUrl,
    painelUrl: `${siteUrl}/painel`,
    leadOrigem: v('BOT_LEAD_ORIGEM', ORIGEM_DA_ISA),
    trkPrefixo: v('BOT_TRK_PREFIXO', TRK_DA_ISA),
    fonte5min: {
      origens: origens5min === '*' ? null : separar(origens5min),
      dominios: separar(v('BOT_LEADS_5MIN_DOMINIOS', DOMINIOS_DA_CASA.join(','))),
    },
    semEtiquetas: separar(env.BOT_SEM_ETIQUETAS || ''),
    daCasa: instancia === INSTANCIA_DA_CASA,
  }
  const erros = errosDaIdentidade(id)
  if (erros.length) throw new Error(`identidade do bot invalida: ${erros.join('; ')}`)
  return id
}

/**
 * O que nao pode: valor que vai pro SQL fora do formato, e bot que nao e a casa usando qualquer
 * coisa da casa (schema, WABA, Power, telefone da Leticya, marca de lead). Melhor o container nao
 * subir do que responder cliente do Gabriel no banco da Isa (dono: "banco diferente pra nao embolar").
 */
export function errosDaIdentidade(id: IdentidadeBot): string[] {
  const erros: string[] = []
  if (!/^[a-z_][a-z0-9_]*$/.test(id.schema)) erros.push(`schema invalido: ${id.schema}`)
  if (!/^[a-z0-9_]+$/.test(id.instancia)) erros.push(`instancia invalida: ${id.instancia}`)
  if (!/^[a-z]+$/.test(id.trkPrefixo)) erros.push(`prefixo de trk invalido: ${id.trkPrefixo}`)
  if (id.daCasa) {
    if (id.schema !== 'public') erros.push(`a instancia da casa (${INSTANCIA_DA_CASA}) usa o schema public`)
    return erros
  }
  if (id.schema === 'public') erros.push('schema public e da Isa (defina BOT_SCHEMA)')
  if (id.waba === WABA_DA_CASA) erros.push('WABA da Isa (defina WA_WABA_ID)')
  if (id.powerlink === POWERLINK_DA_CASA) erros.push(`Power da Leticya (${POWERLINK_DA_CASA}): defina POWERCRM_DEFAULT_SLSMN_NW_ID`)
  if (id.humano.telefone === TELEFONE_DA_LETICYA) erros.push('telefone do humano e o da Leticya (defina BOT_HUMANO_TELEFONE)')
  if (id.leadOrigem === ORIGEM_DA_ISA) erros.push('origem de lead da Isa (defina BOT_LEAD_ORIGEM)')
  if (id.trkPrefixo === TRK_DA_ISA) erros.push('prefixo de trk da Isa (defina BOT_TRK_PREFIXO)')
  if (id.numero === NUMERO_DA_CASA) erros.push('numero do bot e o da Isa (defina BOT_NUMERO)')
  if (id.siteUrl === SITE_DA_CASA) erros.push('siteUrl da casa (defina BOT_SITE_URL)')
  if (id.fonte5min.origens !== null && mesmaLista(id.fonte5min.origens, ORIGENS_DO_SITE))
    erros.push('fonte dos 5 min com as origens do site da casa (defina BOT_LEADS_5MIN_ORIGENS)')
  if (mesmaLista(id.fonte5min.dominios, DOMINIOS_DA_CASA))
    erros.push('fonte dos 5 min com os dominios da casa (defina BOT_LEADS_5MIN_DOMINIOS)')
  if (id.humano.id === 'leticya') erros.push('humano.id da Leticya (defina BOT_HUMANO_ID)')
  if (id.humano.nome === 'Leticya') erros.push('humano.nome da Leticya (defina BOT_HUMANO_NOME)')
  if (id.humano.nomeCompleto === 'Leticya Thayene') erros.push('humano.nomeCompleto da Leticya (defina BOT_HUMANO_NOME_COMPLETO)')
  if (id.humano.apelido === '4824') erros.push('humano.apelido da Leticya (defina BOT_HUMANO_APELIDO)')
  if (id.nome === 'Isa') erros.push('nome do bot e Isa (defina BOT_NOME)')
  if (id.donoPor === 'juliano') erros.push('donoPor da casa (defina BOT_DONO_POR)')
  return erros
}

export const IDENTIDADE_ISA: IdentidadeBot = identidadeDoAmbiente({})

export interface TabelasDoBot {
  contatos: string
  eventos: string
  config: string
  promocoes: string
  recrutamento: string
}

/** As tabelas por-bot no schema do bot. O schema ja passou pelo formato em errosDaIdentidade. */
export function tabelasDoBot(schema: string): TabelasDoBot {
  return {
    contatos: `${schema}.isa_contatos`,
    eventos: `${schema}.isa_eventos`,
    config: `${schema}.isa_config`,
    promocoes: `${schema}.isa_promocoes`,
    recrutamento: `${schema}.consultor_recrutamento`,
  }
}

export interface FiltroDeLeads {
  /** null = sem filtro de inclusao (a Isa ve todo lead sem consultor) */
  incluirOrigens: string[] | null
  incluirDominios: string[]
  excluirOrigens: string[]
  excluirDominios: string[]
}

/**
 * Quais leads sao "do bot" quando ele procura a simulacao do cliente (leadDoCliente) e no PDF.
 * A Isa: todos os de sempre, menos os de bot de parceiro. A Mariana: so os que ela criou e os do
 * site do Gabriel (spec, secao 2: "leadDoCliente passa a olhar so os leads da fonte do bot").
 */
export function leadsDoBot(id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>): FiltroDeLeads {
  if (id.daCasa) {
    return {
      incluirOrigens: null,
      incluirDominios: [],
      excluirOrigens: [...LEADS_DE_PARCEIRO.origens],
      excluirDominios: [...LEADS_DE_PARCEIRO.dominios],
    }
  }
  return { incluirOrigens: [id.leadOrigem], incluirDominios: [...id.fonte5min.dominios], excluirOrigens: [], excluirDominios: [] }
}

/** O mesmo filtro de leadsDoBot, em JS (o SQL esta em fatos.ts). */
export function leadEhDoBot(
  lead: { origem?: string | null; dominio?: string | null },
  id: Pick<IdentidadeBot, 'daCasa' | 'leadOrigem' | 'fonte5min'>,
): boolean {
  const f = leadsDoBot(id)
  const origem = lead.origem ?? ''
  const dominio = lead.dominio ?? ''
  if (f.excluirOrigens.includes(origem) || f.excluirDominios.includes(dominio)) return false
  return f.incluirOrigens === null || f.incluirOrigens.includes(origem) || f.incluirDominios.includes(dominio)
}

/** Gabriel Juliano: igual ao que a identidade da Mariana produz (testes/isa/pdf-mariana-casa). */
const ATENDIMENTO_DO_PARCEIRO = { nome: 'Gabriel Juliano', whatsappUrl: 'https://wa.me/5521990954964' }

/**
 * O PDF de um lead da Mariana sai com o rodape e o botao do Gabriel, nunca os da casa (spec,
 * secao 3). Na Isa: sempre null, o PDF de sempre.
 */
export function atendimentoDoPdf(
  lead: { origem?: string | null; dominio?: string | null },
  id: IdentidadeBot,
): { nome: string; whatsappUrl: string } | null {
  if (id.daCasa) {
    // O PDF pode ser aberto pelo host da casa: lead de parceiro leva o Gabriel mesmo assim.
    const ehParceiro =
      LEADS_DE_PARCEIRO.origens.includes(lead.origem ?? '') || LEADS_DE_PARCEIRO.dominios.includes(lead.dominio ?? '')
    return ehParceiro ? { ...ATENDIMENTO_DO_PARCEIRO } : null
  }
  if (!leadEhDoBot(lead, id)) return null
  return { nome: id.humano.nomeCompleto, whatsappUrl: `https://wa.me/${id.humano.telefone}` }
}

/** "da consultora Leticya Thayene" / "do consultor Gabriel Juliano" — o "Quero ser consultor". */
export function indicacaoDoBot(id: { humano: Pick<HumanoDoBot, 'genero' | 'nomeCompleto'> }): string {
  return `${id.humano.genero === 'f' ? 'da consultora' : 'do consultor'} ${id.humano.nomeCompleto}`
}

/** Nomes que, sozinhos ou num "oi", sao so cumprimento ("oi isa", "leticya?"). */
export function nomesDoCumprimento(id: { nome: string; humano: { nome: string } }): string[] {
  return [id.nome, id.humano.nome].map((n) =>
    n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  )
}
