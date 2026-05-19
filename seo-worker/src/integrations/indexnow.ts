/**
 * IndexNow — protocolo aberto suportado por Bing, Yandex, Naver, etc.
 * Docs: https://www.indexnow.org/documentation
 *
 * Endpoint: POST https://api.indexnow.org/indexnow
 * Body:
 *   { host, key, keyLocation, urlList: [string,...] }
 *
 * Pre-requisito: arquivo /{key}.txt servido pelo site publico com a key como conteudo.
 */
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:indexnow');

export async function submit(urls: string[]): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!config.INDEXNOW_KEY || !config.INDEXNOW_KEY_LOCATION) {
    throw new Error('Pendente de credencial: INDEXNOW_KEY/INDEXNOW_KEY_LOCATION');
  }
  if (urls.length === 0) return { ok: true, status: 200 };

  const host = new URL(urls[0]!).host;
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key: config.INDEXNOW_KEY,
      keyLocation: config.INDEXNOW_KEY_LOCATION,
      urlList: urls,
    }),
  });

  // 200/202 = aceito; 422 = key invalida; 429 = throttle; 403 = key nao casa com keyLocation
  if (res.status >= 200 && res.status < 300) {
    log.info({ count: urls.length }, 'indexnow ok');
    return { ok: true, status: res.status };
  }
  const body = await res.text().catch(() => '');
  log.warn({ status: res.status, body: body.slice(0, 200) }, 'indexnow falhou');
  return { ok: false, status: res.status, body };
}
