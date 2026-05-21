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
import { queuePublish } from '../queue.js';
import { config } from '../config.js';

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

  // ============================================================
  // SISTEMA DE SLOTS DIÁRIOS (decisao user 2026-05-20)
  // - 3 slots obrigatorios: 1 carros + 1 motos + 1 frotas
  // - Verifica artigos JA gerados hoje (TZ Sao Paulo)
  // - Pra cada slot vazio, pega briefing dessa categoria
  // - Apos 3 slots, processa bonus ate `limit` total
  // ============================================================
  type Slot = 'carros' | 'motos' | 'frotas';
  const SLOTS_OBRIGATORIOS: Slot[] = ['carros', 'motos', 'frotas'];

  // Conta artigos por categoria criados hoje
  const todayRows = await query<{ category: string; count: number }>(
    `SELECT category, count(*)::int AS count
     FROM seo.articles
     WHERE company_id='company-21go'
       AND created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
     GROUP BY category`,
  );
  const articlesHoje: Record<string, number> = {};
  for (const r of todayRows) articlesHoje[r.category] = r.count;
  log.info({ articles_hoje: articlesHoje }, 'check slots diarios');

  // Slots que ainda precisam ser preenchidos
  const slotsFaltando = SLOTS_OBRIGATORIOS.filter((s) => (articlesHoje[s] ?? 0) === 0);
  log.info({ slots_faltando: slotsFaltando }, 'slots obrigatorios pendentes');

  // Busca briefings disponiveis (sem artigo ainda) por categoria
  const briefs = await query<BriefingRow & { topic_json: TopicRow; topic_category: string }>(
    `SELECT b.*, row_to_json(t.*) AS topic_json, t.category AS topic_category
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL
     ORDER BY b.created_at ASC
     LIMIT 100`,
  );

  // Indexa por categoria
  const briefsByCategory: Record<string, Array<{ briefing: BriefingRow; topic: TopicRow }>> = {};
  for (const b of briefs) {
    const cat = b.topic_category;
    if (!briefsByCategory[cat]) briefsByCategory[cat] = [];
    briefsByCategory[cat]!.push({ briefing: b, topic: b.topic_json });
  }
  log.info(
    {
      briefings_por_cat: Object.fromEntries(
        Object.entries(briefsByCategory).map(([k, v]) => [k, v.length]),
      ),
    },
    'briefings disponiveis',
  );

  const briefingsToProcess: Array<{ briefing: BriefingRow; topic: TopicRow; slot: string }> = [];

  // 1. Preenche slots obrigatorios primeiro
  for (const slot of slotsFaltando) {
    const candidatos = briefsByCategory[slot];
    if (candidatos && candidatos.length > 0) {
      briefingsToProcess.push({ ...candidatos.shift()!, slot });
    } else {
      log.warn({ slot }, `ATENCAO: slot obrigatorio '${slot}' sem briefing disponivel — rodar /runs/weekly pra gerar`);
    }
  }

  // 2. Preenche bonus ate atingir `limit` total
  const remaining = Math.max(0, limit - briefingsToProcess.length);
  if (remaining > 0) {
    // Junta todos os briefings restantes (qualquer categoria) em FIFO
    const remainingBriefs: Array<{ briefing: BriefingRow; topic: TopicRow }> = [];
    for (const cat of Object.keys(briefsByCategory)) {
      remainingBriefs.push(...(briefsByCategory[cat] ?? []));
    }
    remainingBriefs.sort((a, b) =>
      new Date(a.briefing.created_at).getTime() - new Date(b.briefing.created_at).getTime(),
    );
    for (const r of remainingBriefs.slice(0, remaining)) {
      briefingsToProcess.push({ ...r, slot: 'bonus' });
    }
  }

  log.info(
    {
      total_to_process: briefingsToProcess.length,
      slots: briefingsToProcess.map((p) => `${p.slot}:${p.topic.category}`),
    },
    'plano de execucao',
  );

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

      // === 09 Publisher (auto — decisao user 2026-05-20: sempre publicar direto em prod) ===
      if (config.AUTO_PUBLISH_ENABLED && !dry_run) {
        const pubJob = await queuePublish.add('manual-publish', {
          article_id: article.id,
          skip_human_review: true,
          triggered_by: 'agent:08',
        });
        log.info({ articleId: article.id, pubJobId: pubJob.id }, 'publisher enfileirado (auto-publish)');
      }
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
