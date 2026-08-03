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
import { insertRecommendation } from '../db/repositories/indexing.js';
import { lexicalOverlap } from '../lib/similarity.js';
import { agent01 } from '../agents/01-keyword-research.js';
import { agent02 } from '../agents/02-seo-strategist.js';
import { agent04 } from '../agents/04-briefing.js';
import type { TopicRow } from '../db/repositories/topics.js';

const log = child('worker:research');

interface JobData {
  triggered_by?: string;
  limit?: number;
  dry_run?: boolean;
  /** Sprint 6: refill focado em uma categoria especifica (carros/motos/frotas) */
  focus_category?: 'carros' | 'motos' | 'frotas' | 'educativo';
}

interface WorkerResult {
  keywords_inserted: number;
  topics_approved: number;
  briefings_created: number;
  /** Pautas duplicadas roteadas pro Agente 14 (refresh) em vez de virar artigo canibal. */
  refresh_queued: number;
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
  // Se focus_category, filtra so dessa categoria
  const allPending = dry_run ? [] : await listPending(limit * 3);
  const pendingKws = job.data.focus_category
    ? allPending.filter((k) => k.category === job.data.focus_category).slice(0, limit)
    : allPending.slice(0, limit);
  log.info({ focus: job.data.focus_category, total_pending: allPending.length, will_process: pendingKws.length }, 'keywords pra strategist');
  const approvedTopicIds: string[] = [];
  const approvedTitles: string[] = [];
  let refreshQueued = 0;

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

      // ===== Roteamento por decisao (correcao 2026-08-03) =====
      // ANTES: APROVAR e ATUALIZAR caiam os dois no Agente 04 (briefing) -> Writer criava
      // artigo NOVO com slug "-2". Resultado: 105 dos 113 artigos nasceram de topics que o
      // proprio sistema marcou como duplicados (ex: 11 posts quase iguais sobre "remarcado").
      // AGORA: ATUALIZAR vira recomendacao no artigo que ja ranqueia; o Agente 14 absorve
      // o angulo novo como secao e republica. So APROVAR_ARTIGO_NOVO gera artigo novo.
      if (r.output.decision === 'APROVAR_ARTIGO_NOVO' && r.output.topic_id) {
        // Dedupe INTRA-LOTE: o Agente 03 so compara com artigos que ja existem em
        // seo.articles. Duas keywords irmas da mesma rodada ("o que e RM no documento"
        // e "RM no documento do carro") passavam as duas e viravam 2 posts gemeos.
        const titulo = r.output.proposed_title ?? kw.keyword;
        const colisao = approvedTitles.find((t) => lexicalOverlap(titulo, t) >= 0.5);
        if (colisao) {
          log.info({ kw: kw.keyword, titulo, colide_com: colisao }, 'pauta irma no mesmo lote — adiada');
          continue;
        }
        approvedTitles.push(titulo);
        approvedTopicIds.push(r.output.topic_id);
      } else if (r.output.decision === 'ATUALIZAR_ARTIGO_EXISTENTE' && r.output.target_article_id && !dry_run) {
        try {
          await insertRecommendation({
            type: 'expand_content',
            article_id: r.output.target_article_id,
            priority: 3,
            recommendation: r.output.proposed_title ?? kw.keyword,
            reason: `pauta duplicada absorvida em vez de virar artigo canibal — ${r.output.reason}`,
            data: {
              angle: r.output.proposed_title ?? kw.keyword,
              new_keyword: kw.keyword,
              topic_id: r.output.topic_id,
              source: 'agent:02',
            },
          });
          refreshQueued++;
          log.info({ kw: kw.keyword, target: r.output.target_article_id }, 'duplicada -> refresh do artigo existente');
        } catch (e) {
          errors.push(`02 rec kw=${kw.keyword}: ${(e as Error).message}`);
        }
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
    refresh_queued: refreshQueued,
    total_cost_usd: Number(total_cost.toFixed(6)),
    errors,
  };

  log.info(result, 'job concluido');
  return result;
}
