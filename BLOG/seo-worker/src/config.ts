/**
 * Config centralizada — le envs uma unica vez e valida com Zod.
 * Modulos NUNCA leem process.env diretamente; importam de config.ts.
 *
 * Chaves opcionais retornam undefined; integracoes verificam e marcam
 * como "pendente de credencial" no log se faltar.
 */
import { z } from 'zod';

/**
 * Helper: string opcional que aceita vazio como undefined.
 * (Zod 4 com .optional() ainda valida "" e quebra .min(1). Esse preprocess limpa.)
 */
const optStr = () => z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

/**
 * Modelos LLM da esteira SEO.
 *
 * REGRA DURA (decisao do user em 2026-05-20): SEMPRE Gemini 2.5 Flash.
 * Sonnet/Opus/Haiku Claude estao PROIBIDOS aqui — custavam ~10x mais
 * e nao agregam qualidade pra blog de SEO local.
 *
 * Os 2 tiers (main/light) existem pra compatibilidade com a API interna
 * mas apontam pro MESMO modelo barato. Se AI_MODEL_GENERATOR/CLASSIFIER
 * vier do env, ainda e respeitado — mas o default e Flash em ambos.
 */
export const LLM_FALLBACK_MAIN = 'google/gemini-2.5-flash';
export const LLM_FALLBACK_LIGHT = 'google/gemini-2.5-flash';

const Schema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  COMPANY_ID: z.string().min(1).default('company-21go'),
  TZ: z.string().default('America/Sao_Paulo'),

  // Supabase (obrigatorio)
  SUPABASE_URL: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optStr(),

  // Redis (obrigatorio para filas/cron)
  REDIS_URL: z.string().min(1).default('redis://redis-social:6379'),

  // LLM via OpenRouter (mesmo provider do agente Leticya — supervisor.ts).
  // Modelos reusam a convencao AI_MODEL_* ja presente no .env do projeto.
  //   AI_MODEL_GENERATOR  -> tier=main  (Writer/Reviewer/Strategist/Briefing/Updater)
  //   AI_MODEL_CLASSIFIER -> tier=light (Repurpose, judge, classificacoes)
  // Sem env -> usa LLM_FALLBACK_MAIN / LLM_FALLBACK_LIGHT acima (com log.warn).
  OPENROUTER_API_KEY: optStr(),
  OPENROUTER_BASE_URL: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().url().optional()),
  AI_MODEL_GENERATOR: optStr(),
  AI_MODEL_CLASSIFIER: optStr(),

  // DataForSEO (opcional — sem isso Agente 01 vira somente GSC/manual)
  DATAFORSEO_LOGIN: optStr(),
  DATAFORSEO_PASSWORD: optStr(),
  DATAFORSEO_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(2),

  // Google (GSC + GA4) — OAuth refresh token (modo oficial)
  GOOGLE_CLIENT_ID: optStr(),
  GOOGLE_CLIENT_SECRET: optStr(),
  GOOGLE_REFRESH_TOKEN: optStr(),
  GSC_SITE_URL: z.string().url().default('https://21go.site/'),
  GA4_PROPERTY_ID: optStr(),

  // Bing + IndexNow
  BING_API_KEY: optStr(),
  BING_SITE_URL: z.string().url().default('https://21go.site/'),
  INDEXNOW_KEY: optStr(),
  INDEXNOW_KEY_LOCATION: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().url().optional()),

  // GitHub (Publisher — branch + PR, sem auto-merge)
  GITHUB_TOKEN: optStr(),
  GITHUB_REPO: z.string().min(1).default('julianodamaso80-crypto/21-GO-SITE'),
  GITHUB_BRANCH_BASE: z.string().default('master'),
  GITHUB_AUTHOR_NAME: z.string().default('21Go SEO Bot'),
  GITHUB_AUTHOR_EMAIL: z.string().email().default('seo-bot@21go.site'),

  // Webhooks
  TRIGGER_SECRET: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().min(16).optional()),

  // Comportamento
  AUTO_PUBLISH_ENABLED: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(true),
  // Slots diários obrigatórios: 1 carros + 1 motos + 1 frotas (mínimo 3).
  // Extras viram bônus se houver briefing disponível.
  DAILY_ARTICLE_LIMIT: z.coerce.number().int().positive().default(3),
  DAILY_ARTICLE_BONUS: z.coerce.number().int().nonnegative().default(1),
  // Pesquisa semanal pesada (1x/semana). 80 keywords cobrem ~2 semanas de briefings.
  WEEKLY_KEYWORD_LIMIT: z.coerce.number().int().positive().default(80),
  // Faixa OBRIGATÓRIA: 1.300-1.500 palavras (decisão user 2026-05-20).
  WORDS_PER_ARTICLE_MIN: z.coerce.number().int().positive().default(1300),
  WORDS_PER_ARTICLE_MAX: z.coerce.number().int().positive().default(1500),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Erro ao validar envs:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;

/** Resolve o modelo LLM para o tier informado, aplicando fallback se preciso. */
export function resolveLlmModel(tier: 'main' | 'light'): { model: string; from_fallback: boolean } {
  if (tier === 'main') {
    const m = config.AI_MODEL_GENERATOR;
    return m ? { model: m, from_fallback: false } : { model: LLM_FALLBACK_MAIN, from_fallback: true };
  }
  const m = config.AI_MODEL_CLASSIFIER;
  return m ? { model: m, from_fallback: false } : { model: LLM_FALLBACK_LIGHT, from_fallback: true };
}

/** Snapshot do estado das credenciais para o /healthz e logs de boot. */
export function credentialsSnapshot() {
  return {
    supabase: !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY),
    openrouter: !!config.OPENROUTER_API_KEY,
    llm_models: {
      main: config.AI_MODEL_GENERATOR ?? `${LLM_FALLBACK_MAIN} (fallback)`,
      light: config.AI_MODEL_CLASSIFIER ?? `${LLM_FALLBACK_LIGHT} (fallback)`,
    },
    dataforseo: !!(config.DATAFORSEO_LOGIN && config.DATAFORSEO_PASSWORD),
    gsc: !!config.GOOGLE_REFRESH_TOKEN,
    ga4: !!(config.GA4_PROPERTY_ID && config.GOOGLE_REFRESH_TOKEN),
    bing: !!config.BING_API_KEY,
    indexnow: !!(config.INDEXNOW_KEY && config.INDEXNOW_KEY_LOCATION),
    github: !!(config.GITHUB_TOKEN && config.GITHUB_REPO),
    trigger_secret: !!config.TRIGGER_SECRET,
  };
}
