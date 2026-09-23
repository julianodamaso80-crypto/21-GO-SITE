import 'server-only'
import {
  etapaPadrao,
  telefoneDoPainel,
  lerCriacao,
  montarNovaNegociacao,
  type Criacao,
  type NovaNegociacao,
} from './power-pipeline.regras'
import { corpoDoVeiculo } from './power-veiculo.regras'

/**
 * Cria o card no Power PELA PIPELINE, com a sessao da Leticya no painel — o mesmo botao
 * "Nova Negociacao" que ela usa. Regras em `power-pipeline.regras.ts`.
 *
 * A sessao e a do painel (Spring + Keycloak): form de login -> cookies -> selectCompany ->
 * JWT de 10 h. Mesmo fluxo do CRM (backend/src/modules/power/session.ts). Guardada so em
 * memoria; um restart faz login de novo.
 *
 * NUNCA logar senha, cookie ou token.
 */

const APP = 'https://app.powercrm.com.br'
const EMPRESA = process.env.POWER_COMPANY_ID || '252'
const COOPERATIVA = Number(process.env.POWER_COOPERATIVA_ID || 3081)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
const MARGEM_MS = 10 * 60 * 1000

let sessao: { token: string; expira: number } | null = null
let loginEmAndamento: Promise<string> | null = null
let etapaCache: { valor: { stageId: string; stageIndex: number }; em: number } | null = null

function expiracao(jwt: string): number {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (p.exp) return p.exp * 1000
  } catch {
    // JWT estranho: trata como curto e renova antes
  }
  return Date.now() + 60 * 60 * 1000
}

async function login(): Promise<string> {
  const usuario = process.env.POWER_PAINEL_LETICYA_EMAIL
  const senha = process.env.POWER_PAINEL_LETICYA_SENHA
  if (!usuario || !senha) throw new Error('login da Leticya no painel nao configurado')

  const r1 = await fetch(`${APP}/j_spring_security_check`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'text/html' },
    body: new URLSearchParams({ j_username: usuario, j_password: senha }).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  // O Spring emite cookie mesmo recusando: quem diz se entrou e o redirect.
  if ((r1.headers.get('location') ?? '').includes('/login')) throw new Error('painel recusou o login da Leticya')
  const cookies = (r1.headers.getSetCookie?.() ?? []).map((l) => l.split(';')[0]).join('; ')
  if (!cookies) throw new Error(`login sem cookie (HTTP ${r1.status})`)

  const r2 = await fetch(`${APP}/internal/selectCompany`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
      cookie: cookies,
    },
    body: new URLSearchParams({ i: EMPRESA }).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await r2.json().catch(() => null)) as { access_token?: string } | null
  if (!j?.access_token) throw new Error(`selectCompany sem token (HTTP ${r2.status})`)
  sessao = { token: j.access_token, expira: expiracao(j.access_token) }
  return j.access_token
}

async function token(forcar = false): Promise<string> {
  if (!forcar && sessao && sessao.expira - MARGEM_MS > Date.now()) return sessao.token
  if (!loginEmAndamento) loginEmAndamento = login().finally(() => (loginEmAndamento = null))
  return loginEmAndamento
}

/** Chamada ao painel com um novo login se a sessao caiu (401 ou corpo vazio). Devolve o texto cru. */
export async function painelTexto(caminho: string, init: RequestInit = {}): Promise<string> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const t = await token(tentativa > 0)
    const r = await fetch(APP + caminho, {
      ...init,
      headers: {
        authorization: `Bearer ${t}`,
        accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': UA,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(25_000),
    })
    const texto = await r.text()
    if (r.status === 401 || r.status === 403 || texto.trim() === '') {
      sessao = null
      continue
    }
    return texto
  }
  throw new Error('sessao da Leticya no painel nao se sustentou')
}

/**
 * O mesmo, para as rotas que respondem JSON.
 *
 * ⚠️ Nem todas respondem: `updateQuotationClientData` e `moveQuotation` devolvem o TEXTO PURO
 * `ok` (CLAUDE.md 15.7). Nessas, `painelTexto` — medido em 23/09/2026, quando este JSON.parse
 * derrubou o ajuste do card inteiro.
 */
export async function painel(caminho: string, init: RequestInit = {}): Promise<unknown> {
  const texto = await painelTexto(caminho, init)
  try {
    return JSON.parse(texto)
  } catch {
    throw new Error('painel respondeu fora de JSON')
  }
}

async function etapa(): Promise<{ stageId: string; stageIndex: number }> {
  if (etapaCache && Date.now() - etapaCache.em < 60 * 60 * 1000) return etapaCache.valor
  const funis = (await painel('/api/funnels/detailed')) as Parameters<typeof etapaPadrao>[0]
  const e = etapaPadrao(Array.isArray(funis) ? funis : [])
  if (!e) throw new Error('funil sem etapa padrao')
  etapaCache = { valor: e, em: Date.now() }
  return e
}

/**
 * Procura no funil do painel (a lupa do topo). Seletores do HTML deles: 11 placa, 24 nome,
 * 25 e-mail, 26 telefone. O telefone casa pelo texto gravado — cru nos cards antigos,
 * com mascara nos regravados —, entao quem chama manda os dois formatos.
 * Devolve o codigo da primeira negociacao achada, em qualquer coluna.
 */
export async function acharNoFunil(buscas: { texto: string; seletor: 11 | 24 | 25 | 26 }[]): Promise<string | null> {
  for (const b of buscas) {
    if (!b.texto.trim()) continue
    for (let coluna = 1; coluna <= 5; coluna++) {
      const r = (await painel('/internal/pipeline/fetchNegotiations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: coluna, blocks: 1, text: b.texto, textSelector: b.seletor }),
      })) as { itens?: { code?: string }[] } | null
      const code = r?.itens?.find((i) => i.code)?.code
      if (code) return code
    }
  }
  return null
}

/**
 * Preenche o veiculo da cotacao e SALVA, como a Leticya faz na tela: placa, modelo, ano modelo
 * e ano fabricacao (ordem do dono, 22/09/2026). E o mesmo handler do botao Salvar do painel.
 *
 * Existe porque a PowerAPI nao grava o ano modelo: o `mdlYr` do /cmy vira "0l" na cotacao, e o
 * `/api/quotation/update` responde 200 e ignora o campo. So o painel grava.
 *
 * Nao lanca. `id: 0` do painel e recusa — quase sempre a placa ja estar em outro card.
 */
export async function salvarVeiculoDaCotacao(
  negotiationCode: string,
  dados: Omit<Parameters<typeof corpoDoVeiculo>[0], 'quotationId'>,
): Promise<{ ok: boolean; motivo?: string }> {
  try {
    // O card recem-criado demora a aparecer na listagem: sem espera, 6 dos 26 leads de
    // 22/09/2026 acharam "0 cotacoes" e ficaram sem ano modelo.
    let ativas: { quotationId?: number }[] = []
    for (const espera of [0, 1500, 3000, 5000]) {
      if (espera) await new Promise((r) => setTimeout(r, espera))
      const neg = (await painel(`/company/fetchNegotiationCard?code=${encodeURIComponent(negotiationCode)}`)) as {
        quotations?: { quotationId?: number; active?: boolean; shelved?: boolean }[]
      } | null
      ativas = (neg?.quotations ?? []).filter((q) => q.active !== false && q.shelved !== true && q.quotationId)
      if (ativas.length >= 1) break
    }
    // Frota (mais de um veiculo no mesmo card) fica pra mao de quem atende: nao da pra saber
    // qual cotacao e a deste lead sem chutar.
    if (ativas.length !== 1) return { ok: false, motivo: `negociacao com ${ativas.length} cotacoes ativas` }

    const r = (await painel('/company/updateQuotationVehicleData', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpoDoVeiculo({ ...dados, quotationId: ativas[0].quotationId! })),
    })) as { id?: number; plates?: string | null } | null
    if (Number(r?.id) === 1) return { ok: true }
    return { ok: false, motivo: `painel recusou o salvar${r?.plates ? ` (placa ${r.plates} em outro card)` : ''}` }
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cria pela pipeline. Nao lanca: devolve `ok: false` com o motivo, e quem chama cai no
 * PowerLink — a pipeline e a preferencia, nunca a condicao para o cliente existir no Power.
 */
export async function criarPelaPipeline(
  dados: Omit<NovaNegociacao, 'etapa' | 'cooperativa'>,
): Promise<Criacao> {
  try {
    const corpo = montarNovaNegociacao({ ...dados, cooperativa: COOPERATIVA, etapa: await etapa() })
    const r = await painel('/company/newQuotationAttempt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    return lerCriacao(r as Record<string, unknown>)
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) }
  }
}

/** O card DELA que ja tem essa placa (a busca do funil so enxerga os dela). */
export async function cardDaPlaca(placa: string | null | undefined): Promise<string | null> {
  const p = (placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (p.length !== 7) return null
  try {
    return await acharNoFunil([{ texto: p, seletor: 11 }])
  } catch {
    return null
  }
}

interface CardAjustado {
  quotationCode: string
  negotiationCode: string
}

/**
 * Deixa o card como ela o deixaria: telefone com a mascara do painel e, se ainda estiver em
 * "Cotacoes recebidas", movido para "Em negociacao". Serve para os dois caminhos do dono
 * (23/09/2026) — o card dela que ja existia e o que nasceu pelo PowerLink.
 *
 * Nao sobrescreve dado do card: so preenche telefone e e-mail que estiverem vazios. Reescrever
 * o que ja esta igual dispara webhook do Power a toa (a camada 1 do laco, CLAUDE.md 15.5).
 */
export async function ajustarCardComoEla(
  negotiationCode: string,
  contato?: { telefone?: string | null; email?: string | null },
): Promise<CardAjustado | null> {
  try {
    const n = (await painel(`/company/fetchNegotiationCard?code=${encodeURIComponent(negotiationCode)}`)) as {
      code?: string
      pipelineColumn?: number
      client?: Record<string, unknown>
      quotations?: { quotationId?: number; active?: boolean; shelved?: boolean }[]
    }
    const ativas = (n?.quotations ?? []).filter((q) => q.active !== false && q.shelved !== true && q.quotationId)
    // Frota (mais de uma cotacao) fica para a mao de quem atende.
    if (ativas.length !== 1) return null
    const quotationId = ativas[0].quotationId!
    const cot = (await painel(`/company/fetchQuotationCard?cardId=${quotationId}`)) as { code?: string }
    const c = (n.client ?? {}) as Record<string, unknown>
    const v = (x: unknown) => (x == null ? '' : x)

    const corpo: Record<string, unknown> = {
      fullName: v(c.fullName),
      birthdate: v(c.birthdate),
      gender: v(c.gender),
      registration: v(c.registration),
      rg: v(c.rg),
      rgExpeditor: v(c.expeditor),
      expeditionDate: v(c.expeditionDate),
      cnh: v(c.cnh),
      firstQualification: v(c.firstQualification),
      cnhExpiration: v(c.cnhExpiration),
      phoneHome: telefoneDoPainel(c.phoneHome as string),
      phoneWork: telefoneDoPainel(c.phoneCommercial as string),
      phoneMobile1: telefoneDoPainel((c.phoneMobile1 as string) || contato?.telefone),
      phoneMobile2: telefoneDoPainel(c.phoneMobile2 as string),
      email: v(c.email) || (contato?.email ?? ''),
      addressZipcode: v(c.addressZipcode),
      addressAddress: v(c.addressStreet),
      addressNumber: v(c.addressNumber),
      addressComplement: v(c.addressComplement),
      addressNeighborhood: v(c.addressNeighborhood),
      city: v(c.cityId),
      category: (c.categories as unknown[]) ?? [],
      quotationId,
      negotiationCode: n.code ?? negotiationCode,
    }
    // Com mais de uma negociacao no contato o painel exige a decisao; `true` criaria um contato
    // novo e quebraria a identidade CPF<->cliente (CLAUDE.md 15.5).
    if (((c.haveNegotiations as unknown[]) ?? []).length > 1) corpo.createNewClient = false
    const okContato = await painelTexto('/company/updateQuotationClientData', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    if (okContato.trim() !== 'ok') console.warn('[power] contato do card', negotiationCode, 'recusado:', okContato.slice(0, 120))

    if (n.pipelineColumn === 1) {
      const e = await etapa()
      const okMove = await painelTexto('/company/moveQuotation', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        // O painel manda a ordem da etapa + 1 neste endpoint.
        body: new URLSearchParams({
          id: String(quotationId),
          stageId: e.stageId,
          stageOrder: String(e.stageIndex + 1),
        }).toString(),
      })
      if (okMove.trim() !== 'ok') console.warn('[power] card', negotiationCode, 'nao moveu:', okMove.slice(0, 120))
    }

    return cot?.code ? { quotationCode: cot.code, negotiationCode: n.code ?? negotiationCode } : null
  } catch (err) {
    console.warn('[power] nao consegui ajustar o card', negotiationCode, err instanceof Error ? err.message : err)
    return null
  }
}
