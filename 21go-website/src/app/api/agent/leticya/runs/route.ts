import { NextRequest, NextResponse } from 'next/server'
import { leticyaDb } from '@/lib/leticya/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/leticya/runs
 *
 * Audit trail da Leticya: últimas execuções com tudo que rolou.
 * Query params:
 *   - limit (default 20, max 100)
 *   - status (PENDING|SUCCESS|FAILED|BLOCKED_BY_SUPERVISOR|ESCALATED)
 *   - intent (filtra por classified_intent)
 *   - since (ISO timestamp)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') || '20', 10) || 20, 100)
  const status = sp.get('status')
  const intent = sp.get('intent')
  const since = sp.get('since')

  const db = leticyaDb()
  let query = db
    .from('agent_runs')
    .select(
      'id, agent_id, conversation_id, contact_id, generator_model, classifier_model, supervisor_model, classified_intent, classified_sentiment, classified_urgency, total_tokens_input, total_tokens_output, latency_ms, status, error, output_message, supervisor_verdict, supervisor_reason, created_at, finished_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (intent) query = query.eq('classified_intent', intent)
  if (since) query = query.gte('created_at', since)

  const { data: runs, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Pega tool calls de cada run
  const runIds = (runs ?? []).map((r) => r.id)
  let actionsByRun: Record<string, Array<{ tool: string; status: string; ms: number }>> = {}
  if (runIds.length > 0) {
    const { data: actions } = await db
      .from('agent_actions')
      .select('run_id, step, tool_name, status, latency_ms')
      .in('run_id', runIds)
      .order('step', { ascending: true })
    if (actions) {
      actionsByRun = actions.reduce<typeof actionsByRun>((acc, a) => {
        if (!acc[a.run_id]) acc[a.run_id] = []
        acc[a.run_id].push({ tool: a.tool_name, status: a.status, ms: a.latency_ms ?? 0 })
        return acc
      }, {})
    }
  }

  const enriched = (runs ?? []).map((r) => ({
    ...r,
    tool_calls: actionsByRun[r.id] ?? [],
  }))

  // Stats agregados (últimas 24h)
  const { data: aggData } = await db.rpc('agent_runs_24h_summary').then(
    (r) => r,
    () => ({ data: null }),
  )

  return NextResponse.json({
    count: enriched.length,
    runs: enriched,
    aggregate_24h: aggData,
  })
}
