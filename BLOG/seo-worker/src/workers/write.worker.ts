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
import { agent14 } from '../agents/14-content-updater.js';
import { queuePublish } from '../queue.js';
import { alertOps } from '../lib/alert.js';
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
  /** Artigos existentes enriquecidos pelo Agente 14 quando nao havia pauta nova. */
  refreshes_applied: number;
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
  type Slot = 'carros' | 'motos' | 'frotas' | 'byd';
  /**
   * Slots com QUANTIDADE. BYD tem 2 vagas proprias (decisao do dono em 2026-08-03):
   * o objetivo e captar dono de BYD, que e um publico com dor especifica (bateria cara,
   * seguradora que recusa ou cobra caro em eletrico chines) e ticket alto.
   * Os 3 slots tradicionais continuam intactos — BYD nao tira espaco deles.
   */
  const SLOTS_DIARIOS: Array<{ cat: Slot; qtd: number }> = [
    { cat: 'carros', qtd: 1 },
    { cat: 'motos', qtd: 1 },
    { cat: 'frotas', qtd: 1 },
    { cat: 'byd', qtd: 2 },
  ];
  const SLOTS_OBRIGATORIOS: Slot[] = SLOTS_DIARIOS.map((s) => s.cat);

  // Conta artigos por categoria criados hoje
  // Conta so o que REALMENTE vai ao ar. Nao basta excluir 'archived': artigo reprovado
  // pelo Reviewer fica em status='in_review' e um draft que morreu antes da revisao fica
  // em 'draft' — nenhum dos dois foi publicado, mas ambos ocupavam o slot do dia. O
  // efeito era a esteira "cumprir" a cota com texto que ninguem le: em 04/08 o slot de
  // BYD foi dado como fechado com 1 artigo publicado e 1 reprovado.
  const todayRows = await query<{ category: string; count: number }>(
    `SELECT category, count(*)::int AS count
     FROM seo.articles
     WHERE company_id='company-21go'
       AND created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
       AND status <> 'archived'
       AND (
         status IN ('awaiting_pr_merge', 'published')
         OR review_status IN ('APROVADO', 'APROVADO_COM_AJUSTES')
       )
     GROUP BY category`,
  );
  const articlesHoje: Record<string, number> = {};
  for (const r of todayRows) articlesHoje[r.category] = r.count;
  log.info({ articles_hoje: articlesHoje }, 'check slots diarios');

  // Quanto falta de cada categoria pra fechar a cota do dia
  const faltaPorSlot = new Map<Slot, number>();
  for (const s of SLOTS_DIARIOS) {
    const falta = Math.max(0, s.qtd - (articlesHoje[s.cat] ?? 0));
    if (falta > 0) faltaPorSlot.set(s.cat, falta);
  }
  const slotsFaltando = [...faltaPorSlot.keys()];
  log.info({ falta_por_slot: Object.fromEntries(faltaPorSlot) }, 'slots obrigatorios pendentes');

  // ============================================================
  // REFILL AUTOMATICO (Sprint 6 — decisao user 2026-05-25)
  // Antes de processar slots, garante que cada categoria tem >= 2
  // briefings disponiveis. Senao, enfileira research-worker focado.
  // ============================================================
  const stockByCategory = await query<{ category: string; n: number }>(
    `SELECT t.category, count(*)::int AS n
     FROM seo.briefings b
     JOIN seo.topics t ON t.id = b.topic_id
     LEFT JOIN seo.articles a ON a.briefing_id = b.id
     WHERE a.id IS NULL AND t.category IN ('carros','motos','frotas','byd')
     GROUP BY t.category`,
  );
  const stockMap: Record<string, number> = {};
  for (const r of stockByCategory) stockMap[r.category] = r.n;

  // Um unico refill por execucao (antes eram 3 — um por categoria — e os 3 rodavam
  // o Agente 01 inteiro pra devolver 0 keywords novas, 95 vezes em 30 dias).
  // O Agente 01 ja pesquisa as 3 categorias numa passada so.
  // Threshold proporcional a cota: BYD consome 2/dia, entao precisa de estoque maior
  // pra nao secar antes do proximo research semanal.
  const catsSemEstoque = SLOTS_DIARIOS
    .filter((s) => (stockMap[s.cat] ?? 0) < s.qtd * 2)
    .map((s) => s.cat);
  const REFILL_THRESHOLD = 2; // mantido no log pra referencia
  if (catsSemEstoque.length > 0) {
    log.warn({ categorias: catsSemEstoque, estoque: stockMap, threshold: REFILL_THRESHOLD }, 'estoque baixo — 1 refill consolidado');
    try {
      const { queueResearch } = await import('../queue.js');
      await queueResearch.add(
        'refill-consolidado',
        { limit: 20, triggered_by: `refill:${catsSemEstoque.join('+')}` },
        { jobId: `refill-${new Date().toISOString().slice(0, 10)}` }, // 1x por dia, idempotente
      );
    } catch (e) {
      log.error({ err: (e as Error).message }, 'refill enqueue falhou');
    }
  }

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

  // 1. Preenche slots obrigatorios primeiro (respeitando a cota de cada categoria)
  for (const [slot, falta] of faltaPorSlot) {
    const candidatos = briefsByCategory[slot] ?? [];
    for (let i = 0; i < falta; i++) {
      const c = candidatos.shift();
      if (!c) {
        log.warn(
          { slot, falta_ainda: falta - i },
          `ATENCAO: slot obrigatorio '${slot}' sem briefing disponivel — rodar /runs/weekly pra gerar`,
        );
        break;
      }
      briefingsToProcess.push({ ...c, slot });
    }
  }

  // 2. Preenche bonus ate atingir `limit` total, com TETO POR CATEGORIA.
  //
  // Sem o teto, o bonus ia todo pra categoria que por acaso tinha estoque: em 05/08 o
  // dia fechou com 7 artigos de BYD (cota 2) e ZERO de carros, e tres deles disputavam
  // a mesma pergunta ("onde carregar meu eletrico"). Um dia monotematico e justamente
  // a canibalizacao que a esteira deveria evitar.
  const remaining = Math.max(0, limit - briefingsToProcess.length);
  if (remaining > 0) {
    const cotaDe = new Map(SLOTS_DIARIOS.map((s) => [s.cat as string, s.qtd]));
    // teto = cota do dia + 1 (categoria sem cota propria, como 'educativo', pode 1)
    const tetoDe = (cat: string) => (cotaDe.get(cat) ?? 0) + 1;
    const jaPlanejado = new Map<string, number>();
    for (const p of briefingsToProcess) {
      jaPlanejado.set(p.topic.category, (jaPlanejado.get(p.topic.category) ?? 0) + (articlesHoje[p.topic.category] ?? 0) + 1);
    }

    const remainingBriefs: Array<{ briefing: BriefingRow; topic: TopicRow }> = [];
    for (const cat of Object.keys(briefsByCategory)) {
      remainingBriefs.push(...(briefsByCategory[cat] ?? []));
    }
    remainingBriefs.sort((a, b) =>
      new Date(a.briefing.created_at).getTime() - new Date(b.briefing.created_at).getTime(),
    );

    let adicionados = 0;
    for (const r of remainingBriefs) {
      if (adicionados >= remaining) break;
      const cat = r.topic.category;
      const totalCat = (jaPlanejado.get(cat) ?? articlesHoje[cat] ?? 0);
      if (totalCat >= tetoDe(cat)) {
        log.debug({ categoria: cat, total: totalCat, teto: tetoDe(cat) }, 'bonus recusado — teto da categoria');
        continue;
      }
      jaPlanejado.set(cat, totalCat + 1);
      briefingsToProcess.push({ ...r, slot: 'bonus' });
      adicionados++;
    }
    if (adicionados < remaining) {
      log.info({ pedido: remaining, adicionado: adicionados }, 'bonus limitado pelo teto por categoria');
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

      // ===== Reescrita dirigida quando o Reviewer reprova =====
      // Antes, REPROVADO = pauta no lixo. Como o Reviewer diz exatamente o que violou,
      // vale uma segunda tentativa com as violacoes no prompt: temas como "garantia de
      // bateria" puxam frase proibida ("cobre tudo") com naturalidade e o briefing era
      // queimado por uma frase, nao pelo assunto. Uma reescrita so — se falhar de novo,
      // e problema do tema e nao da redacao.
      if (r06.output.review_status === 'REPROVADO') {
        const violacoes = r06.output.hard_block_matches.length
          ? r06.output.hard_block_matches.map((m) => `${m.reason} (${m.pattern})`)
          : [r06.output.review_notes];
        log.warn({ articleId: article.id, violacoes }, 'reprovado — tentando reescrita dirigida');

        // Solta o briefing e arquiva a versao ruim antes de reescrever. Precisa ser SQL
        // direto: o patch dinamico do updateArticle ignora campos undefined, entao nao
        // consegue gravar briefing_id = NULL — e sem soltar o briefing o slug novo
        // colidiria com o antigo.
        await query(
          `UPDATE seo.articles SET briefing_id = NULL, status='archived', archived_at=now() WHERE id = $1`,
          [article.id],
        );

        const r05b = await withRun(
          { agent_id: '05-writer', triggered_by: 'retry:06', input: { briefing_id: item.briefing.id, retry: true } },
          async () => {
            const res = await agent05.run({ topic: item.topic, briefing: item.briefing, correcoes: violacoes }, ctx);
            total_cost += res.output.llm_cost_usd ?? 0;
            return { result: res, finish: { output: res.output, llm_cost_usd: res.output.llm_cost_usd ?? 0 } };
          },
        );
        if (!r05b.output.article_id) { rejected++; continue; }
        const article2 = await getArticleById(r05b.output.article_id);
        if (!article2) { rejected++; continue; }

        const r06b = await withRun(
          { agent_id: '06-legal-reviewer', triggered_by: 'retry:05', input: { article_id: article2.id } },
          async () => {
            const res = await agent06.run({ article: article2 }, ctx);
            total_cost += res.output.llm_cost_usd ?? 0;
            return { result: res, finish: { output: res.output, llm_cost_usd: res.output.llm_cost_usd ?? 0 } };
          },
        );
        if (r06b.output.review_status === 'REPROVADO') {
          rejected++;
          log.warn({ articleId: article2.id, notes: r06b.output.review_notes }, 'reprovado tambem na reescrita — pauta descartada');
          continue;
        }
        log.info({ articleId: article2.id, slug: article2.slug }, 'reescrita dirigida aprovada');
        article = article2;
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

  // ============================================================
  // SLOT DE REFRESH (correcao 2026-08-03)
  // Sobrou slot sem pauta NOVA? Em vez de ficar o dia inteiro sem produzir nada
  // (ou pior, gerar artigo canibal), o Agente 14 enriquece um artigo que ja
  // ranqueia e republica com last_updated. Volume mantido, zero canibalizacao.
  // ============================================================
  let refreshes = 0;
  const slotsVazios = Math.max(0, limit - briefingsToProcess.length);
  if (slotsVazios > 0 && !dry_run) {
    log.info({ slots_vazios: slotsVazios }, 'sem pauta nova — acionando refresh de artigos existentes');
    try {
      const r14 = await withRun(
        { agent_id: '14-content-updater', triggered_by: 'worker:write', input: { limit: slotsVazios } },
        async () => {
          const res = await agent14.run({ limit: slotsVazios }, ctx);
          total_cost += res.output.total_cost_usd ?? 0;
          return { result: res, finish: { output: res.output, llm_cost_usd: res.output.total_cost_usd ?? 0 } };
        },
      );
      refreshes = r14.output.applied;
      if (r14.output.errors.length) errors.push(...r14.output.errors.map((e) => `14: ${e}`));
    } catch (e) {
      errors.push(`14 refresh: ${(e as Error).message}`);
      log.error({ err: (e as Error).message }, 'slot de refresh falhou');
    }
  }

  const result: WorkerResult = {
    drafts_created: drafts,
    drafts_approved: approved,
    drafts_rejected: rejected,
    refreshes_applied: refreshes,
    total_cost_usd: Number(total_cost.toFixed(6)),
    errors,
  };

  // Producao zero = falha silenciosa. Alerta ativo (foi assim que passamos 30 dias parados).
  if (!dry_run && drafts === 0 && refreshes === 0) {
    await alertOps(
      'producao-zero',
      `nenhum conteudo produzido hoje (0 artigos novos, 0 refresh). Briefings disponiveis: ${briefs.length}. Slots pendentes: ${slotsFaltando.join(', ') || 'nenhum'}.`,
      { briefings_disponiveis: briefs.length, slots_faltando: slotsFaltando, errors },
    ).catch((e) => log.error({ err: (e as Error).message }, 'alerta falhou'));
  }

  log.info(result, 'job concluido');
  return result;
}
