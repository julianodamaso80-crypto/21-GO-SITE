/**
 * Alerta operacional interno (nunca pro cliente final).
 *
 * Existe porque a esteira ficou 30 dias produzindo ZERO artigo com o container
 * healthy, os crons rodando e todos os jobs retornando "job ok". Sem um sinal
 * ativo, falha silenciosa = falha invisivel.
 *
 * Dois canais, independentes:
 *  1. seo.recommendations (type='deploy_failed') — rastro no banco, sempre gravado
 *  2. WhatsApp via Evolution — so se as envs estiverem setadas
 *
 * Envs (opcionais — sem elas o alerta so vai pro banco):
 *   EVOLUTION_API_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY, ALERT_WHATSAPP_TO
 */
import { child } from './logger.js';
import { exec } from '../db/pg.js';

const log = child('alert');

/** Evita repetir o mesmo alerta em execucoes seguidas do mesmo dia. */
async function alreadyAlertedToday(key: string): Promise<boolean> {
  try {
    const rows = await import('../db/pg.js').then((m) => m.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM seo.recommendations
       WHERE type='deploy_failed'
         AND created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
         AND data->>'alert_key' = $1`,
      [key],
    ));
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function alertOps(key: string, message: string, data: Record<string, unknown> = {}): Promise<void> {
  if (await alreadyAlertedToday(key)) {
    log.debug({ key }, 'alerta ja disparado hoje — silenciado');
    return;
  }

  // 1) Rastro no banco (sempre)
  try {
    await exec(
      `INSERT INTO seo.recommendations (type, priority, recommendation, reason, data)
       VALUES ('deploy_failed', 5, $1, $2, $3::jsonb)`,
      [message.slice(0, 500), 'alerta automatico da esteira SEO', JSON.stringify({ ...data, alert_key: key })],
    );
  } catch (e) {
    log.error({ err: (e as Error).message }, 'falha ao gravar alerta no banco');
  }

  // 2) WhatsApp (best-effort)
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const to = process.env.ALERT_WHATSAPP_TO;
  if (!url || !instance || !apiKey || !to) {
    log.warn({ key }, 'alerta so no banco — envs de WhatsApp ausentes');
    return;
  }

  try {
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: to, text: `[esteira SEO 21Go] ${message}` }),
      signal: AbortSignal.timeout(15_000),
    });
    log.info({ key, status: res.status }, 'alerta WhatsApp enviado');
  } catch (e) {
    log.error({ err: (e as Error).message, key }, 'alerta WhatsApp falhou');
  }
}
