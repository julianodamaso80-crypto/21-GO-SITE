import 'server-only'
import {
  etapaPadrao,
  lerCriacao,
  montarNovaNegociacao,
  type Criacao,
  type NovaNegociacao,
} from './power-pipeline.regras'

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

/** Chamada ao painel com um novo login se a sessao caiu (401 ou corpo vazio). */
export async function painel(caminho: string, init: RequestInit = {}): Promise<unknown> {
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
    try {
      return JSON.parse(texto)
    } catch {
      throw new Error(`painel respondeu fora de JSON (HTTP ${r.status})`)
    }
  }
  throw new Error('sessao da Leticya no painel nao se sustentou')
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
