import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { conferirSenha } from '@/lib/painel/senha'

/**
 * Login do painel da Isa (21go.site/painel) — so o dono e a Leticya.
 *
 * Usuarios em env: PAINEL_ISA_USUARIOS = "juliano:<scrypt>,leticya:<scrypt>" (hash do mesmo
 * scrypt do painel do parceiro, lib/painel/senha.ts). Sessao num cookie assinado com nome e
 * segredo PROPRIOS: um login nao abre o outro painel.
 */

export const COOKIE_ISA = 'isa_sess'
export const DURACAO_MS = 12 * 60 * 60 * 1000

export interface SessaoIsa {
  u: string
  exp: number
}

function segredo(): string {
  const base = process.env.PAINEL_SESSAO_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base) throw new Error('sem segredo de sessao')
  return `isa-painel:${base}`
}

function usuarios(): Map<string, string> {
  const m = new Map<string, string>()
  for (const par of (process.env.PAINEL_ISA_USUARIOS || '').split(',')) {
    const i = par.indexOf(':')
    if (i > 0) m.set(par.slice(0, i).trim().toLowerCase(), par.slice(i + 1).trim())
  }
  return m
}

export function conferirLogin(usuario: string, senha: string): string | null {
  const u = usuario.trim().toLowerCase()
  const hash = usuarios().get(u)
  return hash && conferirSenha(senha, hash) ? u : null
}

const assinar = (carga: string) => createHmac('sha256', segredo()).update(carga).digest('base64url')

export function criarSessao(u: string): string {
  const carga = Buffer.from(JSON.stringify({ u, exp: Date.now() + DURACAO_MS } satisfies SessaoIsa)).toString('base64url')
  return `${carga}.${assinar(carga)}`
}

export function lerSessao(token: string | undefined): SessaoIsa | null {
  try {
    if (!token) return null
    const [carga, ass] = token.split('.')
    if (!carga || !ass) return null
    const a = Buffer.from(assinar(carga))
    const b = Buffer.from(ass)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const s = JSON.parse(Buffer.from(carga, 'base64url').toString()) as SessaoIsa
    if (!s?.u || typeof s.exp !== 'number' || s.exp <= Date.now()) return null
    // Usuario removido do env perde o acesso no request seguinte.
    return usuarios().has(s.u) ? s : null
  } catch {
    return null
  }
}

export function sessaoDoRequest(req: NextRequest): SessaoIsa | null {
  return lerSessao(req.cookies.get(COOKIE_ISA)?.value)
}

// Tentativas de login por IP: 5 a cada 15 min. Em memoria de proposito — so 2 usuarios.
const tentativas = new Map<string, number[]>()
export function loginBloqueado(ip: string): boolean {
  const agora = Date.now()
  const recentes = (tentativas.get(ip) || []).filter((t) => agora - t < 15 * 60 * 1000)
  recentes.push(agora)
  tentativas.set(ip, recentes)
  if (tentativas.size > 2000) tentativas.clear()
  return recentes.length > 5
}
