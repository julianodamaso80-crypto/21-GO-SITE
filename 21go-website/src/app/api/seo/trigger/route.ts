/**
 * POST /api/seo/trigger
 *
 * Proxy autenticado pro seo-worker (BLOG/seo-worker), rodando no mesmo
 * projeto EasyPanel (social-21go). O worker NAO tem dominio publico —
 * essa rota e o unico ponto de entrada externo.
 *
 * Body (JSON):
 *   { kind: 'weekly' | 'daily' | 'analyze' | 'reporting' | 'publish',
 *     limit?: number, dry_run?: boolean, article_id?: string, skip_human_review?: boolean }
 *
 * Headers:
 *   Authorization: Bearer <SEO_TRIGGER_SECRET>   (mesmo secret do worker — TRIGGER_SECRET)
 *
 * Envs necessarias (no site):
 *   SEO_TRIGGER_SECRET            mesmo valor do TRIGGER_SECRET do worker
 *   SEO_WORKER_URL                ex: http://seo-worker:8080 (rede interna EasyPanel)
 *
 * Sem essas envs configuradas, a rota retorna 503.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VALID_KINDS = ['weekly', 'daily', 'analyze', 'reporting', 'publish'] as const;
type Kind = (typeof VALID_KINDS)[number];

function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SEO_TRIGGER_SECRET;
  const workerUrl = process.env.SEO_WORKER_URL;

  if (!secret || !workerUrl) {
    return err('SEO trigger nao configurado (faltam SEO_TRIGGER_SECRET ou SEO_WORKER_URL)', 503);
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7).trim() !== secret) {
    return err('unauthorized', 401);
  }

  let body: { kind?: string; limit?: number; dry_run?: boolean; article_id?: string; skip_human_review?: boolean };
  try {
    body = await req.json();
  } catch {
    return err('JSON invalido no body');
  }

  const kind = body.kind as Kind | undefined;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return err(`kind invalido. Use: ${VALID_KINDS.join(', ')}`);
  }

  // Repassa pro worker
  try {
    const target = new URL(`/runs/${kind}`, workerUrl).toString();
    const payload: Record<string, unknown> = {};
    if (typeof body.limit === 'number') payload.limit = body.limit;
    if (typeof body.dry_run === 'boolean') payload.dry_run = body.dry_run;
    if (typeof body.article_id === 'string') payload.article_id = body.article_id;
    if (typeof body.skip_human_review === 'boolean') payload.skip_human_review = body.skip_human_review;

    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* mantem texto */ }
    return ok({ ok: res.ok, worker_status: res.status, worker_response: data }, res.ok ? 202 : res.status);
  } catch (e) {
    const msg = (e as Error).message;
    return err(`falha ao falar com worker: ${msg}`, 502);
  }
}

export async function GET() {
  return ok({
    endpoint: '/api/seo/trigger',
    method: 'POST',
    valid_kinds: VALID_KINDS,
    configured: !!(process.env.SEO_TRIGGER_SECRET && process.env.SEO_WORKER_URL),
  });
}
