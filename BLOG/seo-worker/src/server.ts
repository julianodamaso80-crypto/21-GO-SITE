/**
 * Entry point do seo-worker.
 * - Sobe Fastify (HTTP) com /healthz, /readyz, /diag, /runs/*
 * - Inicia scheduler (cron)
 * - Inicia workers das filas (consumidores)
 * - Trata SIGTERM/SIGINT pra drain graceful
 */
import Fastify from 'fastify';
import { config, credentialsSnapshot } from './config.js';
import { logger } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';
import { runsRoutes } from './routes/runs.js';
import { startScheduler } from './scheduler.js';
import { closeQueues } from './queue.js';
import { startAllWorkers, stopAllWorkers } from './workers/index.js';

async function main(): Promise<void> {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
    bodyLimit: 1 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(healthRoutes);
  await app.register(runsRoutes);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'http listening');
  logger.info({ credentials: credentialsSnapshot() }, 'credentials snapshot');

  startAllWorkers();
  startScheduler();

  // graceful shutdown
  const shutdown = async (signal: string) => {
    logger.warn({ signal }, 'shutdown iniciado');
    try {
      await app.close();
      await stopAllWorkers();
      await closeQueues();
      logger.info('shutdown ok');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown com erro');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'falha no boot');
  process.exit(1);
});
