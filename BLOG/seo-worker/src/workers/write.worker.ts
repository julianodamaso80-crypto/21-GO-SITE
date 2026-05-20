/**
 * Worker: seo-write
 * Pega briefings ainda nao usados, encadeia 05 (Writer) -> 06 (Reviewer) -> 07 (OnPage) -> 08 (Repurpose).
 *
 * Articles sempre saem com status='in_review' (apos Reviewer).
 * Publisher (Fase 8) e que move pra 'published' depois (so se AUTO_PUBLISH ou aprovacao manual).
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { query, queryOne } from '../db/pg.js';
import { getById as getArticleById } from '../db/repositories/articles.js';
import type { TopicRow } from '../db/repositories/topics.js';
import type { BriefingRow, ArticleRow } from '../db/repositories/articles.js';
import { agent05 } from '../agents/05-writer.js';
import { agent06 } from '../agents/06-legal-reviewer.js';
import { agent07 } from '../agents/07-onpage-seo.js';
import { agent08 } from '../agents/08-design-repurpose.js';

const log = child('worker:write');

interface JobData {
  triggered_by?: string;
  limit?: number;
  dry_run?: boolean;
}

interface WorkerResult {
  drafts_created: number;
  drafts_approved: number;
  drafts_rejected: number;
  total_cost_usd: number;
  errors: string[];
}

export async function handleWriteJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'cron:daily';
  const dry_run = !!job.data.dry_run;
  const limit = job.data.limit ?? 1;
  const ctx = { triggered_by, dry_run };

  log.info({ jobId: job.id, triggered_by, dry_run, limit }, 'iniciando job');

  // Pega briefings ordenados (FIFO). Filtra os que ja tem artigo correspondente.
  // JOIN com seo.topics pra trazer o topic completo de uma vez.
  const briefs = await query<BriefingRow & { topic_json: TopicRow }>(
    `SELECT b.*, row_to_json(t.*) AS topic_json
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     ORDER BY b.created_at ASC LIMIT 50`,
  );

  const briefingsToProcess: Array<{ briefing: BriefingRow; topic: TopicRow }> = [];
  for (const b of briefs) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM seo.articles WHERE briefing_id=$1 LIMIT 1`,
      [b.id],
    );
    if (existing) continue;
    briefingsToProcess.push({ briefing: b, topic: b.topic_json });
    if (briefingsToProcess.length >= limit) break;
  }
  log.info({ found: briefingsToProcess.length, limit }, 'briefings pra processar');

  const errors: string[] = [];
  let total_cost = 0;
  let approved = 0;
  let rejected = 0;
  let drafts = 0;

  for (const item of briefingsToProcess) {
    let article: ArticleRow | null = null;
    try {
      // === 05 Writer ===
      const r05 = await withRun(
        { agent_id: '05-writer', triggered_by, input: { topic_id: item.topic.id, briefing_id: item.briefing.id } },
        async () => {
          const res = await agent05.run({ topic: item.topic, briefing: item.briefing }, ctx);
          total_cost += res.output.llm_cost_usd ?? 0;
          return {
            result: res,
            finish: { output: res.output, llm_provider: 'anthropic', llm_cost_usd: res.output.llm_cost_usd ?? 0 },
          };
        },
      );
      drafts++;
      if (!r05.output.article_id || dry_run) continue;

      article = await getArticleById(r05.output.article_id);
      if (!article) throw new Error('article nao encontrado apos writer');

      // === 06 Legal Reviewer ===
      const r06 = await withRun(
        { agent_id: '06-legal-reviewer', triggered_by: 'agent:05', input: { article_id: article.id } },
        async () => {
          const res = await agent06.run({ article: article! }, ctx);
          total_cost += res.output.llm_cost_usd ?? 0;
          return {
            result: res,
            finish: { output: res.output, llm_provider: 'anthropic', llm_cost_usd: res.output.llm_cost_usd ?? 0 },
          };
        },
      );

      if (r06.output.review_status === 'REPROVADO') {
        rejected++;
        log.warn({ articleId: article.id, notes: r06.output.review_notes }, 'reprovado pelo reviewer');
        continue;
      }
      approved++;

      // === 07 OnPage SEO ===
      await withRun(
        { agent_id: '07-onpage-seo', triggered_by: 'agent:06', input: { article_id: article.id } },
        async () => {
          const res = await agent07.run({ article: article! }, ctx);
          return { result: res, finish: { output: res.output } };
        },
      );

      // === 08 Design Repurpose ===
      await withRun(
        { agent_id: '08-design-repurpose', triggered_by: 'agent:07', input: { article_id: article.id } },
        async () => {
          const res = await agent08.run({ article: article! }, ctx);
          total_cost += res.output.llm_cost_usd ?? 0;
          return {
            result: res,
            finish: { output: res.output, llm_provider: 'anthropic', llm_cost_usd: res.output.llm_cost_usd ?? 0 },
          };
        },
      );
    } catch (e) {
      errors.push(`briefing=${item.briefing.id}: ${(e as Error).message}`);
      log.error({ err: (e as Error).message, briefingId: item.briefing.id }, 'falha no encadeamento');
    }
  }

  const result: WorkerResult = {
    drafts_created: drafts,
    drafts_approved: approved,
    drafts_rejected: rejected,
    total_cost_usd: Number(total_cost.toFixed(6)),
    errors,
  };
  log.info(result, 'job concluido');
  return result;
}
