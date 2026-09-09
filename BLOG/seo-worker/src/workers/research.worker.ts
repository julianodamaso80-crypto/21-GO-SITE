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
import { agent03 } from '../agents/03-anti-repetition.js';
import { agent04 } from '../agents/04-briefing.js';
import type { TopicRow } from '../db/repositories/topics.js';

const log = child('worker:research');

interface JobData {
  triggered_by?: string;
  limit?: number;
  dry_run?: boolean;
  /** Sprint 6: refill focado em uma categoria especifica (carros/motos/frotas) */
  focus_category?: 'carros' | 'motos' | 'frotas' | 'educativo';
  /** Categorias carentes que dispararam o refill — priorizam o reaproveitamento de pautas orfas. */
  categorias?: string[];
  /** Teto de pautas orfas briefadas nesta execucao (0 desliga). */
  orfas_limit?: number;
}

interface WorkerResult {
  keywords_inserted: number;
  topics_approved: number;
  briefings_created: number;
  /** Briefings gerados a partir de pautas aprovadas em lotes anteriores. */
  briefings_de_orfas: number;
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


  // ===== Pautas aprovadas que ficaram sem briefing =====
  // O Agente 04 acima so roda nos topics aprovados DESTE lote. Pauta aprovada num
  // lote anterior e nao briefada no mesmo dia ficava presa pra sempre: em 09/09/2026
  // eram 202 topics nessa situacao (56 deles BYD) enquanto o daily reclamava todo dia
  // "slot obrigatorio sem briefing disponivel" e o Agente 01 gastava DataForSEO pra
  // trazer keyword nova. Aqui o estoque ja pago volta pra esteira.
  //
  // Elas foram aprovadas ha semanas, entao o corpus mudou: cada uma passa de novo pelo
  // Agente 03 (embedder local, custo zero). Se hoje canibaliza um artigo que ja existe,
  // vira refresh do artigo em vez de briefing — mesmo roteamento das duplicadas do lote.
  const alvoOrfas = job.data.orfas_limit ?? 12;
  let orfas_briefadas = 0;
  let orfas_viraram_refresh = 0;
  if (!dry_run && alvoOrfas > 0) {
    const { listApprovedWithoutBriefing, updateDecision } = await import('../db/repositories/topics.js');
    const candidatas = await listApprovedWithoutBriefing(alvoOrfas * 5, job.data.categorias);
    const titulosDoLote = [...approvedTitles];

    for (const topic of candidatas) {
      if (orfas_briefadas >= alvoOrfas) break;
      try {
        const irma = titulosDoLote.find((t) => lexicalOverlap(topic.title, t) >= 0.5);
        if (irma) {
          log.info({ titulo: topic.title, colide_com: irma }, 'pauta orfa irma no mesmo lote — adiada');
          continue;
        }

        const antiRep = await agent03.run(
          {
            title: topic.title,
            main_keyword: topic.main_keyword_text ?? topic.title,
            category: topic.category,
            intent: topic.intent ?? undefined,
          },
          ctx,
        );
        const canibal = antiRep.output.cannibal_with;
        const colisaoSlug = antiRep.output.slug_collision;

        if (canibal || colisaoSlug) {
          const alvoArtigo = canibal?.article_id ?? colisaoSlug!.article_id;
          const motivo = canibal
            ? `canibal com "${canibal.title}" (similarity ${canibal.similarity.toFixed(3)})`
            : `slug ja existe: ${colisaoSlug!.slug}`;
          await updateDecision(topic.id, 'ATUALIZAR_ARTIGO_EXISTENTE', `revalidada no reaproveitamento: ${motivo}`, {
            anti_repetition_score: antiRep.output.anti_repetition_score,
            target_article_id: alvoArtigo,
          });
          await insertRecommendation({
            type: 'expand_content',
            article_id: alvoArtigo,
            priority: 3,
            recommendation: topic.title,
            reason: `pauta antiga sem briefing revalidada — ${motivo}`,
            data: { angle: topic.title, topic_id: topic.id, source: 'research:orfas' },
          });
          orfas_viraram_refresh++;
          refreshQueued++;
          log.info({ titulo: topic.title, motivo }, 'pauta orfa canibalizou — virou refresh');
          continue;
        }

        const r = await withRun(
          { agent_id: '04-briefing', triggered_by: 'research:orfas', input: { topic_id: topic.id } },
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
        if (r.output.briefing_id) {
          orfas_briefadas++;
          briefings++;
          titulosDoLote.push(topic.title);
        }
      } catch (e) {
        errors.push(`orfa topic=${topic.id}: ${(e as Error).message}`);
      }
    }

    log.info(
      { candidatas: candidatas.length, briefadas: orfas_briefadas, viraram_refresh: orfas_viraram_refresh },
      'reaproveitamento de pautas sem briefing',
    );
  }

  const result: WorkerResult = {
    keywords_inserted: keywordsResult.output.inserted,
    topics_approved: approvedTopicIds.length,
    briefings_created: briefings,
    briefings_de_orfas: orfas_briefadas,
    refresh_queued: refreshQueued,
    total_cost_usd: Number(total_cost.toFixed(6)),
    errors,
  };

  log.info(result, 'job concluido');
  return result;
}
