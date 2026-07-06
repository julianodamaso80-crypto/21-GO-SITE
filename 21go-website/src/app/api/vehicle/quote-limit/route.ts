import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rate-limit de simulações por pessoa. Objetivo: impedir que consultores
 * concorrentes usem o site pra "puxar" orçamentos em massa.
 *
 * Regra (decisão do dono, 2026-07):
 *   - Cada pessoa pode simular no máximo 3 VEÍCULOS DISTINTOS.
 *   - Janela deslizante de 7 dias (reseta depois disso).
 *   - Identificação por device_id (cookie persistente) OU IP — pega quem
 *     abre aba anônima na mesma rede.
 *   - Revisitar o MESMO veículo não consome cota (conta veículos distintos).
 *   - No 4º veículo novo → allowed:false → front abre pop-up com WhatsApp.
 *
 * Fail-open: se o Supabase falhar, libera (nunca bloquear venda por erro de infra).
 */

const LIMIT = 3
const WINDOW_DAYS = 7
const COOKIE = 'qdev'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Extrai o IP e SANITIZA — só aceita chars de IPv4/IPv6. Qualquer valor fora
 * disso vira '' (não entra no filtro), evitando injeção no filtro do PostgREST
 * e impedindo que um IP ausente ('unknown') agrupe usuários diferentes.
 */
function getIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const raw = (xff.split(',')[0] || '').trim() || (req.headers.get('x-real-ip') || '').trim()
  return /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw : ''
}

function vehicleKey(marca: string, modelo: string, ano: string): string {
  const anoDigits = (ano.match(/\d{4}/)?.[0]) || ano
  return `${marca}|${modelo}|${anoDigits}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  let body: { marca?: string; modelo?: string; ano?: string | number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ allowed: true }, { status: 200 })
  }

  const marca = String(body.marca || '').trim()
  const modelo = String(body.modelo || '').trim()
  const ano = String(body.ano || '').trim()
  if (!marca || !modelo) {
    // Sem dados de veículo não dá pra contar — libera (não é o caso de abuso)
    return NextResponse.json({ allowed: true }, { status: 200 })
  }

  // device_id: reusa o cookie SE for um UUID válido (evita cookie forjado
  // injetar no filtro do PostgREST); senão gera um novo.
  const cookieVal = req.cookies.get(COOKIE)?.value || ''
  const isNewDevice = !UUID_RE.test(cookieVal)
  const deviceId = isNewDevice ? randomUUID() : cookieVal

  const ip = getIp(req)
  const key = vehicleKey(marca, modelo, ano)

  let allowed = true
  let count = 0
  try {
    const supa = supabaseAdmin()
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Tudo que este device OU este IP simulou na janela (ip só entra se válido)
    const orClauses = [`device_id.eq.${deviceId}`]
    if (ip) orClauses.push(`ip.eq.${ip}`)
    const { data, error } = await supa
      .from('quote_limits')
      .select('vehicle_key')
      .gte('created_at', since)
      .or(orClauses.join(','))

    if (error) throw error

    const distinct = new Set((data || []).map((r) => r.vehicle_key as string))
    count = distinct.size

    if (distinct.has(key)) {
      // Mesmo veículo de novo — não consome cota
      allowed = true
    } else if (distinct.size >= LIMIT) {
      // Veículo novo e cota estourada → bloqueia
      allowed = false
    } else {
      // Veículo novo dentro da cota → registra e conta
      await supa.from('quote_limits').insert({ device_id: deviceId, ip: ip || null, vehicle_key: key })
      allowed = true
      count = distinct.size + 1
    }
  } catch (err) {
    console.error('[quote-limit] falhou (fail-open):', err instanceof Error ? err.message : err)
    return NextResponse.json({ allowed: true, count: 0, limit: LIMIT }, { status: 200 })
  }

  const res = NextResponse.json({ allowed, count, limit: LIMIT }, { status: 200 })
  if (isNewDevice) {
    res.cookies.set(COOKIE, deviceId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 400 * 24 * 60 * 60, // ~400 dias
    })
  }
  return res
}
