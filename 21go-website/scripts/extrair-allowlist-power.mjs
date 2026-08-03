#!/usr/bin/env node
/**
 * Regenera src/data/vehicle-allowlist.ts a partir das tabelas de preco do PowerCRM.
 *
 * A elegibilidade real mora no painel (Configuracoes > Cotacao FIPE > Tabelas de preco) e é
 * amarrada POR VERSAO (id do carModel). Versao que nao esta em nenhuma tabela de PROTECAO nao
 * gera plano nenhum na cotacao do Power — e por isso o site nao pode cotar.
 *
 * Tabelas de rastreador (Monitoramento, Roubo e Furto + Ass 24h) ficam de fora de proposito:
 * elas tem quase todas as marcas marcadas e nao significam "a 21Go faz esse veiculo" (criterio
 * confirmado pelo dono em 31/07/2026).
 *
 * Uso:
 *   node scripts/extrair-allowlist-power.mjs [--env caminho/.env] [--check]
 *
 * --check nao escreve nada: sai com codigo 1 se a allowlist do repo estiver diferente do Power
 * (é assim que o job semanal avisa que alguem mexeu na tabela).
 *
 * Credenciais (mesmas do CRM): POWER_APP_BASE_URL, POWER_LOGIN_USERNAME, POWER_LOGIN_PASSWORD,
 * POWER_COMPANY_ID. NUNCA logar token, senha ou cookie.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = path.join(RAIZ, 'src', 'data', 'vehicle-allowlist.ts')

const args = process.argv.slice(2)
const CHECK = args.includes('--check')
const envArg = args.indexOf('--env')
const ENV_FILES = envArg >= 0 ? [args[envArg + 1]] : [
  path.join(RAIZ, '.env.local'),
  path.join(RAIZ, '.env'),
  '/etc/21go/power.env',
]

/** Tabela de rastreador nao vale como regra de aceitacao — ver cabecalho. */
const E_RASTREADOR = /monitoramento|roubo\s*e\s*furto|rastread/i

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

function carregarEnv() {
  const acc = { ...process.env }
  for (const arquivo of ENV_FILES) {
    if (!arquivo || !fs.existsSync(arquivo)) continue
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      if (!linha || linha.startsWith('#') || !linha.includes('=')) continue
      const i = linha.indexOf('=')
      const chave = linha.slice(0, i).trim()
      if (acc[chave]) continue
      acc[chave] = linha.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return acc
}

const env = carregarEnv()
const APP = (env.POWER_APP_BASE_URL || 'https://app.powercrm.com.br').replace(/\/+$/, '')
const COMPANY_ID = env.POWER_COMPANY_ID
const USUARIO = env.POWER_LOGIN_USERNAME
const SENHA = env.POWER_LOGIN_PASSWORD

if (!USUARIO || !SENHA || !COMPANY_ID) {
  console.error(
    'faltam credenciais do painel (POWER_LOGIN_USERNAME, POWER_LOGIN_PASSWORD, POWER_COMPANY_ID)',
  )
  process.exit(2)
}

function juntarCookies(resp, acc) {
  const lista = typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : []
  for (const linha of lista.length ? lista : [resp.headers.get('set-cookie') ?? '']) {
    if (!linha) continue
    const par = linha.split(';')[0]
    const i = par.indexOf('=')
    if (i > 0) acc.set(par.slice(0, i).trim(), par.slice(i + 1).trim())
  }
}

/**
 * Login do painel: form do Spring Security e depois selectCompany, que devolve o Bearer.
 * Mesmo fluxo do CRM (backend/src/modules/power/session.ts) — se um quebrar, o outro quebra junto.
 */
async function login() {
  const cookies = new Map()
  const resp = await fetch(`${APP}/j_spring_security_check`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'pt-BR,pt;q=0.9',
    },
    body: new URLSearchParams({ j_username: USUARIO, j_password: SENHA }).toString(),
  })
  await resp.text().catch(() => '')
  juntarCookies(resp, cookies)
  if ((resp.headers.get('location') ?? '').includes('/login')) throw new Error('login recusado')
  if (!cookies.size) throw new Error('login nao devolveu cookie de sessao')

  const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const respToken = await fetch(`${APP}/internal/selectCompany`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
      cookie,
    },
    body: new URLSearchParams({ i: String(COMPANY_ID) }).toString(),
  })
  const corpo = await respToken.text()
  const token = JSON.parse(corpo).access_token
  if (!token) throw new Error(`selectCompany nao devolveu access_token (HTTP ${respToken.status})`)
  return { token, cookie }
}

async function postar(sess, rota, corpo, comoJson = false) {
  const resp = await fetch(`${APP}${rota}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sess.token}`,
      'content-type': comoJson ? 'application/json' : 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
      cookie: sess.cookie,
    },
    body: comoJson ? JSON.stringify(corpo) : new URLSearchParams(corpo).toString(),
  })
  const texto = await resp.text()
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${rota}: ${texto.slice(0, 200)}`)
  return JSON.parse(texto)
}

function gerarArquivo({ ids, tabelas, marcas }) {
  const linhas = []
  for (let i = 0; i < ids.length; i += 20) linhas.push(`  ${ids.slice(i, i + 20).join(', ')},`)
  const hoje = new Date().toISOString().slice(0, 10)
  const listaTabelas = tabelas.map((t) => ` *   ${t.id} — ${t.name} (${t.modelos} versoes)`).join('\n')

  return `/* ─────────────────────────────────────────────────────────────────────────────
 * Versoes que a 21Go PODE cotar — geradas, nao escritas a mao.
 *
 * FONTE: PowerCRM > Configuracoes > Cotacao FIPE > Tabelas de preco. A elegibilidade la e por
 * VERSAO (id do carModel, o mesmo id que /api/quotation/cmby devolve pro site). Versao fora
 * destas tabelas nao faz aparecer plano nenhum na cotacao do Power — entao o site tambem nao
 * cota: mostra a tela que agradece e explica que nao fazemos esse veiculo.
 *
 * Comparar por ID e nao por nome foi o que consertou o furo de 03/08/2026: o grupo LINEA da
 * Fiat tem so a versao 1043 (ESSENCE 1.8 manual) vinculada, e a 1044 (ESSENCE Dualogic) saiu
 * cotada como Premium R$ 219,60 sem ter plano nenhum no Power. Regra por nome nao distingue
 * duas versoes do mesmo grupo; ID distingue.
 *
 * Tabelas de PROTECAO consideradas (as de Monitoramento / Roubo e Furto ficam fora de
 * proposito — sao rastreador e tem quase tudo marcado, nao servem de regra):
${listaTabelas}
 *
 * Extraido em ${hoje} — ${ids.length} versoes de ${marcas} marcas.
 * Pra atualizar: node scripts/extrair-allowlist-power.mjs
 * ───────────────────────────────────────────────────────────────────────────── */

/** Data da extracao, pra saber ha quanto tempo a lista nao e revalidada. */
export const ALLOWLIST_EXTRAIDA_EM = '${hoje}'

/** Maior id vinculado na extracao — util pra diagnosticar cadastro novo do Power. */
export const ALLOWLIST_MAIOR_ID = ${ids[ids.length - 1]}

const IDS_ACEITOS: number[] = [
${linhas.join('\n')}
]

const ACEITOS = new Set(IDS_ACEITOS)

/**
 * O Power tem plano de protecao pra essa versao?
 *
 * Sem id (fluxo que nao passou pelo PowerCRM) devolve null: quem chama decide com as outras
 * camadas em vez de bloquear no escuro.
 */
export function planoNoPowerCrm(modelId: number | string | null | undefined): boolean | null {
  if (modelId === null || modelId === undefined || modelId === '') return null
  const id = Number(modelId)
  if (!Number.isFinite(id) || id <= 0) return null
  return ACEITOS.has(id)
}

/** Quantas versoes a lista cobre — usado no /api/health da cotacao. */
export const ALLOWLIST_TAMANHO = IDS_ACEITOS.length
`
}

const sess = await login()

const respostaTabelas = await postar(
  sess,
  '/company/priceTablesForList',
  { viewInactive: 1, offset: 0, limit: 300, limitToBranches: [], plans: [], status: 0, types: [], name: '' },
  true,
)
const todas = Array.isArray(respostaTabelas) ? respostaTabelas : respostaTabelas.content || []
const protecao = todas.filter((t) => !E_RASTREADOR.test(t.name || ''))
const rastreador = todas.filter((t) => E_RASTREADOR.test(t.name || ''))

if (!protecao.length) {
  console.error('nenhuma tabela de protecao encontrada — abortando pra nao gerar lista vazia')
  process.exit(2)
}

console.log(`tabelas de protecao (${protecao.length}): ${protecao.map((t) => t.name).join(' | ')}`)
console.log(`ignoradas por serem rastreador (${rastreador.length}): ${rastreador.map((t) => t.name).join(' | ')}`)

const aceitos = new Set()
const marcasComPlano = new Set()
const resumoTabelas = []

for (const tabela of protecao) {
  const marcas = await postar(sess, '/company/fetchPriceTableBrandsWithYears', { i: String(tabela.id) })
  const lista = Array.isArray(marcas) ? marcas : marcas.content || []
  let modelos = 0
  for (const marca of lista) {
    for (const id of marca.selectedModels || []) {
      aceitos.add(id)
      modelos++
      marcasComPlano.add(marca.id)
    }
  }
  resumoTabelas.push({ id: tabela.id, name: tabela.name, modelos })
  console.log(`  ${tabela.id} ${tabela.name}: ${modelos} versoes`)
}

const ids = [...aceitos].sort((a, b) => a - b)
if (ids.length < 3000) {
  console.error(`extracao devolveu so ${ids.length} versoes — suspeito demais, abortando`)
  process.exit(2)
}

const conteudo = gerarArquivo({ ids, tabelas: resumoTabelas, marcas: marcasComPlano.size })
const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : ''

/** Compara so os ids: a data da extracao muda todo dia e nao e diferenca de verdade. */
const soIds = (texto) => (texto.match(/const IDS_ACEITOS: number\[\] = \[([\s\S]*?)\]/)?.[1] || '').replace(/\s+/g, '')

if (soIds(atual) === soIds(conteudo)) {
  console.log(`\nsem mudanca: ${ids.length} versoes, igual ao que ja esta no repo`)
  process.exit(0)
}

const antes = new Set((soIds(atual).match(/\d+/g) || []).map(Number))
const entraram = ids.filter((id) => !antes.has(id))
const sairam = [...antes].filter((id) => !aceitos.has(id))
console.log(`\nMUDOU: +${entraram.length} versoes, -${sairam.length} (total ${ids.length})`)

if (CHECK) {
  console.error('rode sem --check pra regenerar o arquivo')
  process.exit(1)
}

fs.writeFileSync(DESTINO, conteudo)
console.log(`escrito ${path.relative(RAIZ, DESTINO)}`)
