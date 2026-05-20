/**
 * Helper de autenticacao Google — OAuth refresh token.
 *
 * Modo oficial: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.
 * O refresh token pode ser gerado com `npm run google:auth`.
 *
 * Usado por gsc.ts e ga4.ts (assinam suas chamadas via Bearer access_token).
 *
 * Cache simples em memoria — token expira em ~3600s, renovamos com 60s de margem.
 */
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:google-auth');

type AccessToken = { token: string; expires_at_ms: number };
const cache: Record<string, AccessToken> = {};

async function refreshOAuth(scope: string): Promise<AccessToken> {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Pendente de credencial: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
      scope,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`google oauth refresh falhou: HTTP ${res.status} ${json.error ?? ''}`);
  }
  return { token: json.access_token, expires_at_ms: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 };
}

export async function getAccessToken(scope: string): Promise<string> {
  const cached = cache[scope];
  if (cached && cached.expires_at_ms > Date.now()) return cached.token;

  const fresh = await refreshOAuth(scope);
  cache[scope] = fresh;
  log.info({ scope, expires_in_s: Math.round((fresh.expires_at_ms - Date.now()) / 1000), mode: 'oauth' }, 'google token renovado');
  return fresh.token;
}
