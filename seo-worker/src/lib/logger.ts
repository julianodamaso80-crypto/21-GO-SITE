import pino from 'pino';
import { config } from '../config.js';

/**
 * Logger raiz. Em dev usa pino-pretty; em prod estrutura JSON pro stdout do EasyPanel.
 * NUNCA loga campos sensiveis (token, key, password) — passa por redact.
 */
const isDev = config.NODE_ENV === 'development';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'seo-worker', company: config.COMPANY_ID },
  redact: {
    paths: [
      '*.token', '*.password', '*.key', '*.secret',
      'token', 'password', 'key', 'secret',
      'headers.authorization',
      'request.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,company' },
      }
    : undefined,
});

export function child(name: string, extra?: Record<string, unknown>) {
  return logger.child({ module: name, ...extra });
}
