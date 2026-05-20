/**
 * Worker: seo-research
 * Encadeia: Agente 01 (KeywordResearch) -> Agente 02 (Strategist + Anti-Repetition embutido) -> Agente 04 (Briefing).
 *
 * Cada execucao roda dentro de withRun() pra registrar em seo.agent_runs com custo/tokens.
 */
import type { Job } from 'bullmq';
import { child } from '../lib/logger.js';
import { withRun } from '../db/repositories/agent-runs.js';
import { listPending } from '../db/repositories/keywords.js';
import { agent01 } from '../agents/01-keyword-research.js';
import { agent02 } from '../agents/02-seo-strategist.js';
import { agent04 } from '../agents/04-briefing.js';
import type { TopicRow } from '../db/repositories/topics.js';

const log = child('worker:research');

interface JobData {
  triggered_by?: string;
  limit?: number;
  dry_run?: boolean;
}

interface WorkerResult {
  keywords_inserted: number;
  topics_approved: number;
  briefings_created: number;
  total_cost_usd: number;
  errors: string[];
}

export async function handleResearchJob(job: Job<JobData>): Promise<WorkerResult> {
  const triggered_by = job.data.triggered_by ?? 'cron:weekly';
  const dry_run = !!job.data.dry_run;
  const limit = job.data.limit ?? 20;
  const ctx = { triggered_by, dry_run };

  log.info({ jobId: job.id, triggered_by, dry_run, limit }, 'iniciando job');

  const errors: string[] = [];
  let total_cost = 0;

  // ===== Agente 01 — Keyword Research =====
  const keywordsResult = await withRun(
    { agent_id: '01-keyword-research', triggered_by, input: { limit, dry_run } },
    async () => {
      const r = await agent01.run({ limit }, ctx);
      return { result: r, finish: { output: r.output } };
    },
  );

  // ===== Agente 02 — para cada keyword pendente, decide pauta =====
  const pendingKws = dry_run ? [] : await listPending(limit);
  const approvedTopicIds: string[] = [];

  for (const kw of pendingKws) {
    try {
      const r = await withRun(
        { agent_id: '02-seo-strategist', triggered_by: 'agent:01', input: { keyword_id: kw.id } },
        async () => {
          const res = await agent02.run({ keyword: kw }, ctx);
          total_cost += res.output.llm_cost_usd ?? 0;
          return {
            result: res,
            finish: {
              output: res.output,
              llm_provider: 'anthropic',
              llm_cost_usd: res.output.llm_cost_usd ?? 0,
            },
          };
        },
      );
      if ((r.output.decision === 'APROVAR_ARTIGO_NOVO' || r.output.decision === 'ATUALIZAR_ARTIGO_EXISTENTE') && r.output.topic_id) {
        approvedTopicIds.push(r.output.topic_id);
      }
    } catch (e) {
      errors.push(`02 kw=${kw.keyword}: ${(e as Error).message}`);
    }
  }

  // ===== Agente 04 — Briefing pra cada topic aprovado =====
  let briefings = 0;
  const { getById: getTopicById } = await import('../db/repositories/topics.js');
  for (const topicId of approvedTopicIds) {
    try {
      const topic = await getTopicById(topicId);
      if (!topic) {
        errors.push(`04 fetch topic ${topicId}: nao encontrado`);
        continue;
      }

      const r = await withRun(
        { agent_id: '04-briefing', triggered_by: 'agent:02', input: { topic_id: topic.id } },
        async () => {
          const res = await agent04.run({ topic }, ctx);
          total_cost += res.output.llm_cost_usd ?? 0;
          return {
            result: res,
            finish: {
              output: { briefing_id: res.output.briefing_id },
              llm_provider: 'anthropic',
              llm_cost_usd: res.output.llm_cost_usd ?? 0,
            },
          };
        },
      );
      if (r.output.briefing_id) briefings++;
    } catch (e) {
      errors.push(`04 topic=${topicId}: ${(e as Error).message}`);
    }
  }

  const result: WorkerResult = {
    keywords_inserted: keywordsResult.output.inserted,
    topics_approved: approvedTopicIds.length,
    briefings_created: briefings,
    total_cost_usd: Number(total_cost.toFixed(6)),
    errors,
  };

  log.info(result, 'job concluido');
  return result;
}
