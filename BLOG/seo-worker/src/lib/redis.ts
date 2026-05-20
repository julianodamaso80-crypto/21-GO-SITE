import IORedis from 'ioredis';
import { config } from '../config.js';
import { child } from './logger.js';

const log = child('redis');

/**
 * Conexao Redis compartilhada (BullMQ + cache).
 * BullMQ exige maxRetriesPerRequest=null e enableReadyCheck=false (docs oficiais).
 */
export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

redis.on('connect', () => log.info({ url: maskUrl(config.REDIS_URL) }, 'redis conectado'));
redis.on('error', (err) => log.error({ err: err.message }, 'redis erro'));
redis.on('close', () => log.warn('redis fechado'));

function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '***';
  }
}
