/**
 * DataForSEO REST API — usada pelo Agente 01 (KeywordResearch).
 *
 * Endpoints utilizados (DataForSEO Labs):
 *   - /v3/dataforseo_labs/google/keyword_suggestions/live   (sugestoes a partir de uma semente)
 *   - /v3/dataforseo_labs/google/related_keywords/live      (relacionadas)
 *   - /v3/dataforseo_labs/google/keyword_overview/live      (volume, dificuldade, cpc)
 *
 * Localizacao: pt-BR (location_name = "Brazil", language_code = "pt").
 *
 * BUDGET GUARD: antes de cada chamada, calcula soma de cost_usd do dia.
 * Se passar de DATAFORSEO_DAILY_BUDGET_USD, ABORTA.
 */
import { config } from '../config.js';
import { child } from '../lib/logger.js';
import { getDataForSeoTodaySpend, logDataForSeoCall } from '../db/repositories/indexing.js';

const log = child('integrations:dataforseo');
const BASE = 'https://api.dataforseo.com';

function auth(): string {
  if (!config.DATAFORSEO_LOGIN || !config.DATAFORSEO_PASSWORD) {
    throw new Error('Pendente de credencial: DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD');
  }
  return 'Basic ' + Buffer.from(`${config.DATAFORSEO_LOGIN}:${config.DATAFORSEO_PASSWORD}`).toString('base64');
}

async function checkBudget(): Promise<void> {
  const spent = await getDataForSeoTodaySpend();
  if (spent >= config.DATAFORSEO_DAILY_BUDGET_USD) {
    throw new Error(
      `DataForSEO budget esgotado: gasto hoje USD ${spent.toFixed(4)} >= limite USD ${config.DATAFORSEO_DAILY_BUDGET_USD}`,
    );
  }
}

async function post<T>(path: string, body: unknown): Promise<{ data: T; cost: number | null; meta: unknown }> {
  await checkBudget();
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let json: { status_code?: number; status_message?: string; cost?: number; tasks?: unknown[] } = {};
  try { json = await res.json() as typeof json; } catch { /* corpo nao-JSON */ }

  const cost = typeof json.cost === 'number' ? json.cost : null;
  const meta = { status: res.status, status_code: json.status_code, status_message: json.status_message, cost };
  await logDataForSeoCall(path, body, meta, cost, false).catch((e: Error) =>
    log.warn({ err: e.message }, 'falha ao logar dataforseo_calls — ignorando'),
  );

  if (!res.ok || (json.status_code && json.status_code >= 40000)) {
    log.error({ path, status: res.status, status_code: json.status_code, message: json.status_message }, 'dataforseo erro');
    throw new Error(`dataforseo ${path} falhou: HTTP ${res.status} status_code=${json.status_code}`);
  }

  const tasks = (json.tasks ?? []) as Array<{ result?: T }>;
  const result = tasks[0]?.result;
  if (!result) throw new Error(`dataforseo ${path}: sem result em tasks[0]`);

  log.info({ path, cost, duration_ms: Date.now() - t0 }, 'dataforseo ok');
  return { data: result, cost, meta };
}

const LOCATION = 'Brazil';
const LANGUAGE = 'pt';

export interface KeywordSuggestion {
  keyword: string;
  search_volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  search_intent: string | null;
}

interface DfsKwOverviewItem {
  keyword?: string;
  keyword_data?: {
    keyword?: string;
    keyword_info?: { search_volume?: number; competition?: number; cpc?: number };
    keyword_properties?: { keyword_difficulty?: number };
    search_intent_info?: { main_intent?: string };
  };
  keyword_info?: { search_volume?: number; competition?: number; cpc?: number };
  keyword_properties?: { keyword_difficulty?: number };
  search_intent_info?: { main_intent?: string };
}

function flatten(item: DfsKwOverviewItem): KeywordSuggestion {
  const kw = item.keyword_data?.keyword ?? item.keyword ?? '';
  const info = item.keyword_data?.keyword_info ?? item.keyword_info ?? {};
  const props = item.keyword_data?.keyword_properties ?? item.keyword_properties ?? {};
  const intent = item.keyword_data?.search_intent_info?.main_intent ?? item.search_intent_info?.main_intent ?? null;
  return {
    keyword: kw,
    search_volume: info.search_volume ?? null,
    keyword_difficulty: props.keyword_difficulty ?? null,
    cpc: info.cpc ?? null,
    competition: info.competition ?? null,
    search_intent: intent,
  };
}

export async function keywordSuggestions(seed: string, limit = 30): Promise<KeywordSuggestion[]> {
  const { data } = await post<Array<{ items?: DfsKwOverviewItem[] }>>(
    '/v3/dataforseo_labs/google/keyword_suggestions/live',
    [{ keyword: seed, location_name: LOCATION, language_code: LANGUAGE, limit, include_seed_keyword: false }],
  );
  return (data[0]?.items ?? []).map(flatten).filter((k) => k.keyword);
}

export async function relatedKeywords(seed: string, limit = 30): Promise<KeywordSuggestion[]> {
  const { data } = await post<Array<{ items?: DfsKwOverviewItem[] }>>(
    '/v3/dataforseo_labs/google/related_keywords/live',
    [{ keyword: seed, location_name: LOCATION, language_code: LANGUAGE, limit, depth: 1 }],
  );
  return (data[0]?.items ?? []).map(flatten).filter((k) => k.keyword);
}

export async function keywordOverview(keywords: string[]): Promise<KeywordSuggestion[]> {
  if (keywords.length === 0) return [];
  // API aceita ate 700 por chamada
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 700) batches.push(keywords.slice(i, i + 700));
  const out: KeywordSuggestion[] = [];
  for (const batch of batches) {
    const { data } = await post<Array<{ items?: DfsKwOverviewItem[] }>>(
      '/v3/dataforseo_labs/google/keyword_overview/live',
      [{ keywords: batch, location_name: LOCATION, language_code: LANGUAGE }],
    );
    out.push(...(data[0]?.items ?? []).map(flatten));
  }
  return out;
}
