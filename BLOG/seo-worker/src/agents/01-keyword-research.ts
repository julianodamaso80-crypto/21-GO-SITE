/**
 * Agente 01 — Keyword Research
 *
 * Fontes (em ordem):
 *   1. Seeds manuais (lista curta de termos centrais da 21Go)
 *   2. Google Search Console — top queries dos ultimos 28 dias (se credencial disponivel)
 *   3. DataForSEO — keyword_suggestions + keyword_overview (se credencial e budget OK)
 *
 * Saida: upsert em seo.keywords (idempotente por keyword_normalized).
 * Cada keyword e filtrada por scope-guard antes de entrar (bane caminhao etc).
 * Pre-classifica em carros/motos/frotas/educativo via heuristica simples.
 *
 * NUNCA preenche search_volume/difficulty/cpc inventando.
 */
import type { Agent } from './_types.js';
import type { KeywordCategory, KeywordRow } from '../db/repositories/keywords.js';
import { upsertKeyword } from '../db/repositories/keywords.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';
import { checkScope } from '../lib/scope-guard.js';
import * as dfs from '../integrations/dataforseo.js';
import * as gsc from '../integrations/gsc.js';

const log = child('agent:01-keyword-research');

/** Seeds em PT-BR — temas centrais da 21Go (carros/motos/frotas/educativo). */
const SEEDS: Array<{ seed: string; category: KeywordCategory }> = [
  // carros
  { seed: 'protecao veicular para carro', category: 'carros' },
  { seed: 'protecao para carro de aplicativo', category: 'carros' },
  { seed: 'protecao carro financiado', category: 'carros' },
  { seed: 'protecao carro usado', category: 'carros' },
  // motos
  { seed: 'protecao veicular para moto', category: 'motos' },
  { seed: 'protecao moto entregador', category: 'motos' },
  { seed: 'protecao moto financiada', category: 'motos' },
  // frotas (carros e/ou motos — NUNCA caminhao)
  { seed: 'protecao frota delivery', category: 'frotas' },
  { seed: 'protecao frota empresa pequena', category: 'frotas' },
  // educativo
  { seed: 'diferenca seguro e protecao veicular', category: 'educativo' },
  { seed: 'como funciona protecao veicular', category: 'educativo' },
  { seed: 'vistoria protecao veicular', category: 'educativo' },
  { seed: 'assistencia 24h protecao veicular', category: 'educativo' },
];

interface Input {
  limit?: number;        // teto de keywords novas a inserir
  use_dataforseo?: boolean;
  use_gsc?: boolean;
}

interface Output {
  inserted: number;
  skipped_out_of_scope: number;
  sources: { manual: number; gsc: number; dataforseo: number };
  errors: string[];
}

function classify(keyword: string, fallback: KeywordCategory = 'educativo'): KeywordCategory {
  const k = keyword.toLowerCase();
  if (/\b(moto|motos|motociclista|motoboy|motoqueiro)\b/.test(k)) return 'motos';
  if (/\b(frota|frotas|delivery|aplicativo|uber|99|ifood)\b/.test(k)) return 'frotas';
  if (/\b(carro|carros|automovel|automoveis|veiculo|veiculos|sedan|suv|hatch)\b/.test(k)) return 'carros';
  return fallback;
}

export const agent01: Agent<Input, Output> = {
  id: '01-keyword-research',
  description: 'Pesquisa palavras-chave reais (DataForSEO + GSC + seeds) com filtro de escopo',
  async run(input, ctx) {
    const limit = input.limit ?? config.WEEKLY_KEYWORD_LIMIT;
    const useDfs = input.use_dataforseo !== false && !!(config.DATAFORSEO_LOGIN && config.DATAFORSEO_PASSWORD);
    const useGsc = input.use_gsc !== false && (!!config.GOOGLE_REFRESH_TOKEN || !!config.GOOGLE_APPLICATION_CREDENTIALS_JSON);

    log.info({ limit, useDfs, useGsc, dryRun: ctx.dry_run }, 'iniciando keyword research');

    const errors: string[] = [];
    const sources = { manual: 0, gsc: 0, dataforseo: 0 };
    const collected: Array<{ keyword: string; category: KeywordCategory; source: 'manual' | 'gsc' | 'dataforseo'; sv?: number | null; diff?: number | null; cpc?: number | null; intent?: string | null }> = [];

    // 1) Seeds manuais
    for (const s of SEEDS) {
      collected.push({ keyword: s.seed, category: s.category, source: 'manual' });
      sources.manual++;
    }

    // 2) GSC top queries (ultimos 28 dias) — fornece SO keywords reais que ja recebem impressao
    if (useGsc) {
      try {
        const end = new Date();
        const start = new Date(Date.now() - 28 * 86_400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const rows = await gsc.searchAnalytics({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ['query'],
          rowLimit: 200,
        });
        for (const r of rows) {
          if (!r.query) continue;
          if (r.impressions < 5) continue; // ruido
          collected.push({
            keyword: r.query,
            category: classify(r.query),
            source: 'gsc',
            // GSC nao da volume nem dificuldade — deixa null (sera preenchido por DFS depois se habilitado)
          });
          sources.gsc++;
        }
        log.info({ gsc_queries: sources.gsc }, 'GSC carregado');
      } catch (e) {
        errors.push(`gsc: ${(e as Error).message}`);
        log.warn({ err: (e as Error).message }, 'GSC falhou — seguindo sem');
      }
    } else {
      log.warn('Pendente de credencial: GSC desabilitado — usando so seeds + dataforseo se ok');
    }

    // 3) DataForSEO — expande cada seed em sugestoes + relacionadas
    if (useDfs) {
      try {
        const seedSubset = SEEDS.slice(0, Math.min(SEEDS.length, 6)); // limite pra controlar custo
        for (const s of seedSubset) {
          try {
            const sug = await dfs.keywordSuggestions(s.seed, 20);
            for (const k of sug) {
              if (!k.keyword) continue;
              collected.push({
                keyword: k.keyword,
                category: classify(k.keyword, s.category),
                source: 'dataforseo',
                sv: k.search_volume,
                diff: k.keyword_difficulty,
                cpc: k.cpc,
                intent: k.search_intent,
              });
              sources.dataforseo++;
            }
          } catch (e) {
            errors.push(`dfs seed "${s.seed}": ${(e as Error).message}`);
          }
        }
        log.info({ dataforseo_kws: sources.dataforseo }, 'DataForSEO carregado');
      } catch (e) {
        errors.push(`dataforseo: ${(e as Error).message}`);
      }
    } else {
      log.warn('Pendente de credencial ou desabilitado: DataForSEO pulado');
    }

    // 4) Filtro de escopo + upsert
    let inserted = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const c of collected) {
      if (inserted >= limit) break;
      const violation = checkScope(c.keyword);
      if (violation) {
        skipped++;
        log.debug({ kw: c.keyword, reason: violation.reason, matched: violation.matched }, 'fora de escopo');
        continue;
      }
      const norm = c.keyword.toLowerCase().normalize('NFD').replace(/[\p{Diacritic}]/gu, '');
      if (seen.has(norm)) continue;
      seen.add(norm);

      if (ctx.dry_run) {
        log.info({ kw: c.keyword, cat: c.category, src: c.source, sv: c.sv, diff: c.diff }, 'DRY-RUN — nao gravado');
        inserted++;
        continue;
      }

      try {
        const row: KeywordRow = await upsertKeyword({
          keyword: c.keyword,
          category: c.category,
          source: c.source,
          search_volume: c.sv ?? null,
          difficulty: c.diff ?? null,
          cpc_brl: c.cpc ?? null,
          intent: mapIntent(c.intent),
        });
        inserted++;
        log.debug({ id: row.id, kw: row.keyword }, 'upsert ok');
      } catch (e) {
        errors.push(`upsert "${c.keyword}": ${(e as Error).message}`);
      }
    }

    return {
      output: { inserted, skipped_out_of_scope: skipped, sources, errors },
    };
  },
};

function mapIntent(raw: string | null | undefined): 'informational' | 'navigational' | 'commercial' | 'transactional' | 'unknown' {
  if (!raw) return 'unknown';
  const v = raw.toLowerCase();
  if (v.includes('inform')) return 'informational';
  if (v.includes('navig')) return 'navigational';
  if (v.includes('commerc')) return 'commercial';
  if (v.includes('transact')) return 'transactional';
  return 'unknown';
}
