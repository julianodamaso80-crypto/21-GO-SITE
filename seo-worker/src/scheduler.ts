/**
 * Scheduler — cron jobs do worker.
 * Timezone vem de config.TZ (default America/Sao_Paulo).
 *
 * Crons:
 *   seg 06:00  -> seo:research  (semanal de planejamento)
 *   ter 07:00  -> seo:analyze   (analise GSC + recomendacoes)
 *   diario 09:00 -> seo:write   (produzir rascunhos)
 *   diario 03:00 -> seo:reporting (snapshot metricas)
 *   a cada 15 min -> seo:publish (varre indexacao pendente)
 */
import cron from 'node-cron';
import { config } from './config.js';
import { queueResearch, queueWrite, queuePublish, queueAnalyze, queueReporting } from './queue.js';
import { child } from './lib/logger.js';

const log = child('scheduler');

export function startScheduler(): void {
  log.info({ tz: config.TZ }, 'iniciando cron jobs');

  // ----- Semanal: pesquisa + estrategia (seg 06:00) -----
  cron.schedule('0 6 * * 1', async () => {
    log.info('cron:weekly disparado');
    await queueResearch.add(
      'weekly-keyword-research',
      { triggered_by: 'cron:weekly', limit: config.WEEKLY_KEYWORD_LIMIT },
      { jobId: `weekly-${new Date().toISOString().slice(0, 10)}` }, // idempotencia por dia
    );
  }, { timezone: config.TZ });

  // ----- Semanal: analise GSC + recomendacoes (ter 07:00) -----
  cron.schedule('0 7 * * 2', async () => {
    log.info('cron:analyze disparado');
    await queueAnalyze.add(
      'weekly-gsc-analysis',
      { triggered_by: 'cron:analyze' },
      { jobId: `analyze-${new Date().toISOString().slice(0, 10)}` },
    );
  }, { timezone: config.TZ });

  // ----- Diaria: producao de rascunhos (09:00) -----
  cron.schedule('0 9 * * *', async () => {
    log.info({ limit: config.DAILY_ARTICLE_LIMIT }, 'cron:daily-write disparado');
    await queueWrite.add(
      'daily-write-batch',
      { triggered_by: 'cron:daily', limit: config.DAILY_ARTICLE_LIMIT },
      { jobId: `daily-${new Date().toISOString().slice(0, 10)}` },
    );
  }, { timezone: config.TZ });

  // ----- Diaria: snapshot de metricas (03:00) -----
  cron.schedule('0 3 * * *', async () => {
    log.info('cron:metrics disparado');
    await queueReporting.add(
      'daily-metrics-snapshot',
      { triggered_by: 'cron:metrics' },
      { jobId: `metrics-${new Date().toISOString().slice(0, 10)}` },
    );
  }, { timezone: config.TZ });

  // ----- 15 min: varre indexacao pendente -----
  cron.schedule('*/15 * * * *', async () => {
    await queuePublish.add(
      'recheck-pending-indexing',
      { triggered_by: 'cron:recheck' },
      // sem jobId pra deixar enfileirar normalmente — varre pouco e e idempotente
    );
  }, { timezone: config.TZ });

  log.info('cron jobs registrados');
}
