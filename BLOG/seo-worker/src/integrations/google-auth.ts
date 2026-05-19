/**
 * Helper de autenticacao Google — suporta 2 modos:
 *   A) OAuth refresh token  (GOOGLE_CLIENT_ID + SECRET + REFRESH_TOKEN)
 *   B) Service Account JSON (GOOGLE_APPLICATION_CREDENTIALS_JSON)
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
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      refresh_token: config.GOOGLE_REFRESH_TOKEN!,
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

async function fromServiceAccount(scope: string): Promise<AccessToken> {
  const raw = config.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error('Pendente de credencial: GOOGLE_APPLICATION_CREDENTIALS_JSON');
  type SA = { client_email: string; private_key: string; token_uri?: string };
  let sa: SA;
  try { sa = JSON.parse(raw); } catch { throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON nao e JSON valido'); }

  // JWT manual (RS256) — evita dependencia pesada
  const { createSign } = await import('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const claim = base64url({
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${header}.${claim}.${sig}`;

  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`google SA token falhou: HTTP ${res.status} ${json.error ?? ''}`);
  }
  return { token: json.access_token, expires_at_ms: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 };
}

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function getAccessToken(scope: string): Promise<string> {
  const cached = cache[scope];
  if (cached && cached.expires_at_ms > Date.now()) return cached.token;

  const useOAuth = !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN);
  const useSA = !!config.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!useOAuth && !useSA) throw new Error('Pendente de credencial: Google OAuth ou Service Account');

  const fresh = useSA ? await fromServiceAccount(scope) : await refreshOAuth(scope);
  cache[scope] = fresh;
  log.info({ scope, expires_in_s: Math.round((fresh.expires_at_ms - Date.now()) / 1000), mode: useSA ? 'service_account' : 'oauth' }, 'google token renovado');
  return fresh.token;
}
