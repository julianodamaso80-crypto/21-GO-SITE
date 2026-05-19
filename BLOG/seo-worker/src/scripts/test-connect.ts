/**
 * Smoke-test: confere conexao com Redis e Supabase + lista credenciais presentes.
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:connect
 */
import { config, credentialsSnapshot } from '../config.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  logger.info({ company: config.COMPANY_ID, env: config.NODE_ENV }, 'iniciando smoke-test');

  // 1) Redis
  const ping = await redis.ping().catch((e: Error) => `ERRO: ${e.message}`);
  logger.info({ ping }, 'redis ping');

  // 2) Credenciais snapshot
  logger.info({ credentials: credentialsSnapshot() }, 'credenciais detectadas');

  // 3) Supabase (HEAD em uma tabela ja existente — leve)
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const url = new URL('/rest/v1/companies?select=id&limit=1', config.SUPABASE_URL).toString();
      const res = await fetch(url, {
        headers: {
          apikey: config.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: 'application/json',
          'Accept-Profile': 'core',
        },
      });
      logger.info({ status: res.status, ok: res.ok }, 'supabase HEAD core.companies');
      if (res.ok) {
        const data: unknown = await res.json();
        logger.info({ data }, 'supabase resposta');
      } else {
        const body = await res.text();
        logger.warn({ body: body.slice(0, 200) }, 'supabase respondeu nao-200');
      }
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'supabase falha');
    }
  } else {
    logger.warn('Pendente de credencial: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao definidos');
  }

  await redis.quit();
}

main().catch((e) => {
  logger.fatal({ err: (e as Error).message }, 'smoke-test fatal');
  process.exit(1);
});
