/**
 * Image generation pra cover dos artigos.
 *
 * Estrategia 2026: 3 aspect ratios obrigatorios pelo Article schema (1:1, 4:3, 16:9).
 *
 * Provedor primario: Google Gemini 2.5 Flash Image (acesso via OpenRouter ou Google AI direct).
 * Fallback: Unsplash API (gratis, 50/dia).
 *
 * Best-effort: se falhar, retorna null e o post mantem /blog/default.jpg.
 */
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:image-gen');

/**
 * Tenta gerar imagem via Unsplash (mais simples, sem API key — usa source.unsplash.com).
 * Retorna URL ja redimensionada pelo Unsplash CDN.
 *
 * Limit: nao tem API key, mas source.unsplash.com aceita ate ~50 req/h por IP.
 */
export async function unsplashImage(query: string, ratio: '1:1' | '4:3' | '16:9'): Promise<string | null> {
  const dims = ratio === '1:1' ? '800x800' : ratio === '4:3' ? '1200x900' : '1600x900';
  const url = `https://source.unsplash.com/${dims}/?${encodeURIComponent(query)}`;
  try {
    // Verifica se URL retorna 200 (Unsplash redireciona pra imagem real)
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (res.ok || res.status === 200) return res.url; // URL final apos redirect
    return null;
  } catch (e) {
    log.warn({ err: (e as Error).message, query, ratio }, 'unsplash falhou');
    return null;
  }
}

/**
 * Tenta gerar imagem via Gemini 2.5 Flash Image (OpenRouter ou Google AI Studio).
 * Requer GOOGLE_AI_API_KEY ou key OpenRouter que suporta o modelo.
 *
 * Retorna URL de Base64 ou null.
 */
export async function geminiImage(prompt: string, ratio: '1:1' | '4:3' | '16:9'): Promise<string | null> {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  if (!googleAiKey && !config.OPENROUTER_API_KEY) {
    return null;
  }
  // TODO: implementacao real depende da API do Gemini Image (modelo: gemini-2.5-flash-image).
  // Por ora retorna null — fallback Unsplash assume responsabilidade.
  log.debug({ prompt, ratio }, 'geminiImage nao implementado — usando fallback');
  return null;
}

/**
 * Pipeline: tenta Gemini -> Unsplash -> null.
 * Retorna ate 3 URLs (1 por ratio).
 */
export async function generateCoverImages(query: string): Promise<{ url_1x1: string | null; url_4x3: string | null; url_16x9: string | null }> {
  const [u1, u2, u3] = await Promise.all([
    geminiImage(query, '1:1').then((g) => g ?? unsplashImage(query, '1:1')),
    geminiImage(query, '4:3').then((g) => g ?? unsplashImage(query, '4:3')),
    geminiImage(query, '16:9').then((g) => g ?? unsplashImage(query, '16:9')),
  ]);
  return { url_1x1: u1, url_4x3: u2, url_16x9: u3 };
}
