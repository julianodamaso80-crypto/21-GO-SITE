/**
 * Worker: seo:publish
 *
 * 2 modos de invocacao:
 *   1) manual: { article_id, skip_human_review? } — publica artigo especifico
 *   2) recheck: { name: 'recheck-pending-indexing' } — varre artigos publicados
 *      nas ultimas 24h sem registro completo de indexacao e reenviapra Bing/IndexNow
 *
 * Cadeia normal: 09 (Publisher) -> 10 (Sitemap) -> 11 (Google) -> 12 (Bing+IndexNow).
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { supabase } from '../db/supabase.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { agent09 } from '../agents/09-publisher.js';
import { agent10 } from '../agents/10-sitemap.js';
import { agent11 } from '../agents/11-google-indexing.js';
import { agent12 } from '../agents/12-bing-indexnow.js';

const log = child('worker:publish');

interface JobData {
  triggered_by?: string;
  article_id?: string;
  skip_human_review?: boolean;
  dry_run?: boolean;
}

interface WorkerResult {
  mode: 'manual' | 'recheck';
  published_count: number;
  indexed_count: number;
  errors: string[];
}

export async function handlePublishJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'manual';
  const dry_run = !!job.data.dry_run;
  const ctx = { triggered_by, dry_run };

  if (job.name === 'recheck-pending-indexing') {
    return await recheckPending(ctx);
  }
  return await publishOne(job.data, ctx);
}

async function publishOne(data: JobData, ctx: { triggered_by: string; dry_run: boolean }): Promise<WorkerResult> {
  if (!data.article_id) throw new Error('publish manual exige article_id');
  const sb = supabase();
  const { data: aRow, error } = await sb.from('articles').select('*').eq('id', data.article_id).single();
  if (error || !aRow) throw new Error(`article ${data.article_id} nao encontrado: ${error?.message}`);
  let article = aRow as ArticleRow;
  const errors: string[] = [];

  // 09 Publisher
  const r09 = await withRun(
    { agent_id: '09-publisher', triggered_by: ctx.triggered_by, input: { article_id: article.id } },
    async () => {
      const res = await agent09.run({ article, skip_human_review: data.skip_human_review }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  );

  if (!r09.output.published) {
    return {
      mode: 'manual',
      published_count: 0,
      indexed_count: 0,
      errors: [r09.output.reason ?? 'publisher pulou (motivo nao informado)'],
    };
  }

  // Re-fetch com novo mdx_path
  const { data: refreshed } = await sb.from('articles').select('*').eq('id', article.id).single();
  article = refreshed as ArticleRow;

  // 10 Sitemap (aguarda alguns segundos pro EasyPanel rebuildar — best-effort)
  await sleep(20_000);
  await withRun(
    { agent_id: '10-sitemap', triggered_by: 'agent:09', input: { article_id: article.id } },
    async () => {
      const res = await agent10.run({ article }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  ).catch((e) => errors.push(`10: ${(e as Error).message}`));

  // 11 Google
  await withRun(
    { agent_id: '11-google-indexing', triggered_by: 'agent:09', input: { article_id: article.id } },
    async () => {
      const res = await agent11.run({ article }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  ).catch((e) => errors.push(`11: ${(e as Error).message}`));

  // 12 Bing + IndexNow
  await withRun(
    { agent_id: '12-bing-indexnow', triggered_by: 'agent:09', input: { article_id: article.id } },
    async () => {
      const res = await agent12.run({ article }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  ).catch((e) => errors.push(`12: ${(e as Error).message}`));

  return { mode: 'manual', published_count: 1, indexed_count: 1, errors };
}

/**
 * Recheck: artigos publicados nas ultimas 24h sem indexing_log completo
 * (sitemap + google_gsc + bing_wmt + indexnow). Reenviar canais faltantes.
 */
async function recheckPending(ctx: { triggered_by: string; dry_run: boolean }): Promise<WorkerResult> {
  const sb = supabase();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent, error } = await sb
    .from('articles')
    .select('id, title, slug, url, status, published_at')
    .eq('status', 'published')
    .gte('published_at', yesterday);
  if (error) throw new Error(`recheck select falhou: ${error.message}`);

  const errors: string[] = [];
  let indexed = 0;
  for (const a of (recent ?? []) as ArticleRow[]) {
    // Verifica quais canais ja foram OK
    const { data: logs } = await sb
      .from('indexing_log')
      .select('channel, response_status')
      .eq('article_id', a.id);

    const okChannels = new Set<string>();
    for (const l of (logs ?? []) as Array<{ channel: string; response_status: number | null }>) {
      if (l.response_status && l.response_status >= 200 && l.response_status < 300) okChannels.add(l.channel);
    }

    const pendingChannels: string[] = [];
    if (!okChannels.has('google_gsc')) pendingChannels.push('google_gsc');
    if (!okChannels.has('bing_wmt')) pendingChannels.push('bing_wmt');
    if (!okChannels.has('indexnow')) pendingChannels.push('indexnow');

    if (pendingChannels.length === 0) continue;

    log.info({ articleId: a.id, pending: pendingChannels }, 'recheck indexacao');

    if (pendingChannels.includes('google_gsc')) {
      await withRun({ agent_id: '11-google-indexing', triggered_by: 'cron:recheck', input: { article_id: a.id } }, async () => {
        const res = await agent11.run({ article: a as ArticleRow }, ctx);
        return { result: res, finish: { output: res.output } };
      }).catch((e) => errors.push(`recheck 11 ${a.slug}: ${(e as Error).message}`));
    }
    if (pendingChannels.includes('bing_wmt') || pendingChannels.includes('indexnow')) {
      await withRun({ agent_id: '12-bing-indexnow', triggered_by: 'cron:recheck', input: { article_id: a.id } }, async () => {
        const res = await agent12.run({ article: a as ArticleRow }, ctx);
        return { result: res, finish: { output: res.output } };
      }).catch((e) => errors.push(`recheck 12 ${a.slug}: ${(e as Error).message}`));
    }
    indexed++;
  }

  return { mode: 'recheck', published_count: 0, indexed_count: indexed, errors };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
