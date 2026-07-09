import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check completo dos subsistemas críticos.
 *
 * Retorna 200 só se TUDO ok. 503 se qualquer um falhar.
 *
 * Uso:
 *   GET /api/health/full
 *   GET /api/health/full?slow=1   → roda também o teste de PDF (pesado, ~2s)
 *
 * Subsistemas validados:
 *   - chromium       → lança browser e fecha (só com ?slow=1, custoso)
 *   - supabase       → SELECT 1 row em leads
 *   - powercrm       → GET /api/quotation/cb (lista marcas)
 *   - evolution      → GET /instance/connectionState/{instance}
 *
 * Use em cron pra alertar quando quebrar.
 */

interface CheckResult {
  ok: boolean
  ms: number
  detail?: string
  error?: string
}

const POWERCRM_BASE_URL = process.env.POWERCRM_BASE_URL || 'https://api.powercrm.com.br'
const POWERAPI_TOKEN = process.env.POWERAPI_TOKEN
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '21 go 0741'
const PUPPETEER_PATH = process.env.PUPPETEER_EXECUTABLE_PATH

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; ms: number; error?: string }> {
  const t0 = Date.now()
  try {
    const result = await fn()
    return { result, ms: Date.now() - t0 }
  } catch (err) {
    return { result: null, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) }
  }
}

async function checkChromium(): Promise<CheckResult> {
  const { ms, error } = await timed(async () => {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: PUPPETEER_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    await browser.close()
    return true
  })
  return { ok: !error, ms, detail: PUPPETEER_PATH || '(default)', error }
}

async function checkSupabase(): Promise<CheckResult> {
  const { ms, error } = await timed(async () => {
    const supa = supabaseAdmin()
    const { error: err } = await supa.from('leads').select('id').limit(1)
    if (err) throw err
    return true
  })
  return { ok: !error, ms, error }
}

async function checkPowerCRM(): Promise<CheckResult> {
  if (!POWERAPI_TOKEN) return { ok: false, ms: 0, error: 'POWERAPI_TOKEN ausente' }
  const { ms, error, result } = await timed(async () => {
    const res = await fetch(`${POWERCRM_BASE_URL}/api/quotation/cb?type=1`, {
      headers: { Authorization: `Bearer ${POWERAPI_TOKEN}`, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const list = (await res.json()) as unknown[]
    if (!Array.isArray(list) || list.length === 0) throw new Error('lista vazia')
    return list.length
  })
  return { ok: !error, ms, detail: result ? `${result} marcas` : undefined, error }
}

async function checkEvolution(): Promise<CheckResult> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, ms: 0, error: 'EVOLUTION_API_URL/KEY ausentes' }
  }
  const { ms, error, result } = await timed(async () => {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`,
      { headers: { apikey: EVOLUTION_API_KEY } },
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = (await res.json()) as { instance?: { state?: string } } | { state?: string }
    const state =
      (data as { instance?: { state?: string } }).instance?.state ||
      (data as { state?: string }).state ||
      'unknown'
    if (state !== 'open') throw new Error(`state=${state}`)
    return state
  })
  return { ok: !error, ms, detail: result ?? undefined, error }
}

export async function GET(req: NextRequest) {
  const slow = req.nextUrl.searchParams.get('slow') === '1'

  const checks: Record<string, CheckResult> = {}
  const t0 = Date.now()

  // Roda em paralelo (não-Chromium são leves)
  const [supa, pc, evo] = await Promise.all([
    checkSupabase(),
    checkPowerCRM(),
    checkEvolution(),
  ])
  checks.supabase = supa
  checks.powercrm = pc
  checks.evolution = evo

  if (slow) {
    checks.chromium = await checkChromium()
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const totalMs = Date.now() - t0

  return NextResponse.json(
    {
      ok: allOk,
      timestamp: new Date().toISOString(),
      total_ms: totalMs,
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}
