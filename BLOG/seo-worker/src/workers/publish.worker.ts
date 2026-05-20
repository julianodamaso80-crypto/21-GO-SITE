/**
 * Worker: seo:publish
 *
 * 3 modos de invocacao:
 *   1) name='manual-publish' { article_id, skip_human_review? }
 *      -> Publisher (09) abre PR no GitHub. NAO mergea — humano aprova.
 *      Article fica em status='awaiting_pr_merge'.
 *
 *   2) name='recheck-pending-indexing' (cron de 15 em 15 minutos)
 *      -> Varre artigos em 'awaiting_pr_merge': se URL ja retorna 200,
 *         humano mergeou o PR + site rebuildou. Marca status='published'
 *         e enfileira Agentes 10-12.
 *      -> Tambem varre artigos 'published' recentes sem indexing_log
 *         completo e reenvia canais faltantes (Bing/IndexNow).
 *
 *   3) Disparado pelos jobs acima como sub-tarefas (10/11/12).
 *
 * Importante: cadeia 09 -> 10/11/12 NAO acontece sincrona apos abrir PR
 * (porque o PR pode demorar horas/dias pra mergear). 10/11/12 disparam
 * SO depois que o cron de recheck detecta URL live.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { supabase } from '../db/supabase.js';
import { updateArticle } from '../db/repositories/articles.js';
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
  mode: 'manual-publish' | 'recheck';
  prs_opened: number;
  newly_published: number;
  indexed: number;
  errors: string[];
}

export async function handlePublishJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'manual';
  const dry_run = !!job.data.dry_run;
  const ctx = { triggered_by, dry_run };

  if (job.name === 'recheck-pending-indexing') {
    return await recheckMode(ctx);
  }
  return await manualPublish(job.data, ctx);
}

/** Modo manual — abre PR pra 1 artigo. */
async function manualPublish(data: JobData, ctx: { triggered_by: string; dry_run: boolean }): Promise<WorkerResult> {
  if (!data.article_id) throw new Error('publish manual exige article_id');
  const sb = supabase();
  const { data: aRow, error } = await sb.from('articles').select('*').eq('id', data.article_id).single();
  if (error || !aRow) throw new Error(`article ${data.article_id} nao encontrado: ${error?.message}`);
  const article = aRow as ArticleRow;

  const r09 = await withRun(
    { agent_id: '09-publisher', triggered_by: ctx.triggered_by, input: { article_id: article.id } },
    async () => {
      const res = await agent09.run({ article, skip_human_review: data.skip_human_review }, ctx);
      return { result: res, finish: { output: res.output } };
    },
  );

  return {
    mode: 'manual-publish',
    prs_opened: r09.output.pr_opened ? 1 : 0,
    newly_published: 0,
    indexed: 0,
    errors: r09.output.pr_opened ? [] : [r09.output.reason ?? 'publisher pulou (motivo nao informado)'],
  };
}

/**
 * Modo recheck (cron de 15 em 15 minutos):
 *  A) artigos 'awaiting_pr_merge' — checar se URL ja esta live (PR mergeado + rebuild OK).
 *     Se sim, virar 'published' e enfileirar Agentes 10-12.
 *  B) artigos 'published' nas ultimas 24h sem indexing_log completo — reenviar canais faltantes.
 */
async function recheckMode(ctx: { triggered_by: string; dry_run: boolean }): Promise<WorkerResult> {
  const sb = supabase();
  const errors: string[] = [];
  let newlyPublished = 0;
  let indexed = 0;

  // === A) awaiting_pr_merge — verificar se URL ja esta live ===
  const { data: pending } = await sb
    .from('articles')
    .select('*')
    .eq('status', 'awaiting_pr_merge');

  for (const a of (pending ?? []) as ArticleRow[]) {
    try {
      const live = await fetch(a.url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' })
        .then((r) => r.status >= 200 && r.status < 300)
        .catch(() => false);

      if (!live) {
        log.debug({ articleId: a.id, url: a.url }, 'awaiting_pr_merge — ainda nao live');
        continue;
      }

      log.info({ articleId: a.id, url: a.url }, 'awaiting_pr_merge -> URL LIVE; marcando published');
      if (!ctx.dry_run) {
        await updateArticle(a.id, {
          status: 'published',
          published_at: new Date().toISOString(),
        });
      }
      newlyPublished++;

      // Re-fetch article com status atualizado
      const { data: refreshed } = await sb.from('articles').select('*').eq('id', a.id).single();
      const articleNow = refreshed as ArticleRow;

      // Dispara 10 + 11 + 12 sequencialmente
      await withRun({ agent_id: '10-sitemap', triggered_by: 'cron:recheck', input: { article_id: articleNow.id } }, async () => {
        const res = await agent10.run({ article: articleNow }, ctx);
        return { result: res, finish: { output: res.output } };
      }).catch((e) => errors.push(`10 ${articleNow.slug}: ${(e as Error).message}`));

      await withRun({ agent_id: '11-google-indexing', triggered_by: 'cron:recheck', input: { article_id: articleNow.id } }, async () => {
        const res = await agent11.run({ article: articleNow }, ctx);
        return { result: res, finish: { output: res.output } };
      }).catch((e) => errors.push(`11 ${articleNow.slug}: ${(e as Error).message}`));

      await withRun({ agent_id: '12-bing-indexnow', triggered_by: 'cron:recheck', input: { article_id: articleNow.id } }, async () => {
        const res = await agent12.run({ article: articleNow }, ctx);
        return { result: res, finish: { output: res.output } };
      }).catch((e) => errors.push(`12 ${articleNow.slug}: ${(e as Error).message}`));

      indexed++;
    } catch (e) {
      errors.push(`recheck awaiting ${a.slug}: ${(e as Error).message}`);
    }
  }

  // === B) published nas ultimas 24h sem indexing_log completo ===
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await sb
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .gte('published_at', yesterday);

  for (const a of (recent ?? []) as ArticleRow[]) {
    try {
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

      if (pendingChannels.includes('google_gsc')) {
        await withRun({ agent_id: '11-google-indexing', triggered_by: 'cron:recheck', input: { article_id: a.id } }, async () => {
          const res = await agent11.run({ article: a }, ctx);
          return { result: res, finish: { output: res.output } };
        }).catch((e) => errors.push(`recheck-2 11 ${a.slug}: ${(e as Error).message}`));
      }
      if (pendingChannels.includes('bing_wmt') || pendingChannels.includes('indexnow')) {
        await withRun({ agent_id: '12-bing-indexnow', triggered_by: 'cron:recheck', input: { article_id: a.id } }, async () => {
          const res = await agent12.run({ article: a }, ctx);
          return { result: res, finish: { output: res.output } };
        }).catch((e) => errors.push(`recheck-2 12 ${a.slug}: ${(e as Error).message}`));
      }
      indexed++;
    } catch (e) {
      errors.push(`recheck-2 ${a.slug}: ${(e as Error).message}`);
    }
  }

  return { mode: 'recheck', prs_opened: 0, newly_published: newlyPublished, indexed, errors };
}
