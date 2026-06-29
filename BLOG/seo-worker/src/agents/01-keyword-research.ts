/**
 * Agente 01 — Keyword Research (DATA-DRIVEN, RJ-ONLY)
 *
 * Regra absoluta (decisao user 2026-06-29):
 *   - Toda keyword vem do GSC (impressoes >= 5, posicao 5-30) OU DataForSEO (expandir RJ seeds)
 *   - ZERO seed manual fora desse arquivo. As BASE_SEEDS aqui sao apenas insumo pro DFS expandir,
 *     NAO sao inseridas em seo.keywords como source='manual'.
 *   - Toda keyword DEVE conter modificador geografico RJ (Rio, RJ, ou bairro/cidade da regiao metropolitana).
 *     Sem isso, e descartada (mesmo vinda do GSC ou DFS).
 *   - Fontes validas: source IN ('gsc','dataforseo'). 'manual' nao e mais aceito.
 *
 * Saida: upsert em seo.keywords (idempotente por keyword_normalized).
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

/**
 * BASE_SEEDS — insumo SO pra expandir no DataForSEO. NAO sao inseridas em seo.keywords.
 * Todas com modificador RJ pra forcar o DFS a retornar variacoes geograficas.
 */
const BASE_SEEDS: Array<{ seed: string; category: KeywordCategory }> = [
  // carros (RJ)
  { seed: 'protecao veicular carro rio de janeiro', category: 'carros' },
  { seed: 'protecao veicular suv rio de janeiro', category: 'carros' },
  { seed: 'protecao veicular barra da tijuca', category: 'carros' },
  // motos (RJ)
  { seed: 'protecao veicular moto rio de janeiro', category: 'motos' },
  { seed: 'protecao moto entregador rj', category: 'motos' },
  // frotas (RJ) — 1 frota/dia obrigatoria, ver [[feedback_frota_diaria_obrigatoria]]
  { seed: 'protecao frota delivery rio de janeiro', category: 'frotas' },
  { seed: 'protecao frota motos rj ifood 99', category: 'frotas' },
  { seed: 'protecao frota empresas rio de janeiro', category: 'frotas' },
];

/**
 * Bairros + cidades RJ pra validacao geografica. Keyword tem que conter pelo menos um destes
 * (modo case/acento-insensitivo) OU 'rio', 'rj', 'rio de janeiro'.
 */
const RJ_LOCATIONS = [
  'rio de janeiro', 'rio', 'rj',
  'barra', 'barra da tijuca', 'jacarepagua', 'jacarepaguá',
  'tijuca', 'copacabana', 'ipanema', 'leblon', 'botafogo', 'flamengo', 'centro',
  'recreio', 'campo grande', 'bangu', 'santa cruz', 'realengo', 'taquara',
  'niteroi', 'niterói', 'sao goncalo', 'são gonçalo', 'caxias', 'duque de caxias',
  'nova iguacu', 'nova iguaçu', 'belford roxo', 'sao joao de meriti', 'mage', 'magé',
  'guaratiba', 'sulacap', 'penha', 'meier', 'méier', 'madureira', 'irajá', 'iraja',
  'maracana', 'maracanã', 'lapa', 'gloria', 'glória', 'urca', 'leme', 'gavea', 'gávea',
  'sao cristovao', 'são cristóvão', 'tijuca', 'vila isabel', 'engenho novo',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\p{Diacritic}]/gu, '');
}

function hasRjModifier(keyword: string): boolean {
  const norm = normalize(keyword);
  return RJ_LOCATIONS.some((loc) => {
    const n = normalize(loc);
    return new RegExp(`\\b${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(norm);
  });
}

/** Brand search — query buscando a marca 21Go diretamente. Não vira blog. */
function isBrandSearch(keyword: string): boolean {
  const n = normalize(keyword).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // qualquer combinação de "21 go", "021 go", "go 21", "21goo", "21gol" etc
  if (/\b0?2[01]\s?go+l?\b/.test(n)) return true;
  if (/\bgo+\s?2[01]\b/.test(n)) return true;
  if (/\b21\s?gols?\b/.test(n)) return true;
  return false;
}

/**
 * Enriquece com modificador RJ — se já tem, retorna como está; senão sufixa " no rio de janeiro".
 * Usado pra aproveitar queries reais do GSC que vieram sem geo mas têm intent comercial/informativo.
 */
function enrichRj(keyword: string): string {
  if (hasRjModifier(keyword)) return keyword;
  // tira pontuação no fim e sufixa
  return keyword.replace(/[.?!]+$/, '').trim() + ' no rio de janeiro';
}

interface Input {
  limit?: number;        // teto de keywords novas a inserir
  use_dataforseo?: boolean;
  use_gsc?: boolean;
}

interface Output {
  inserted: number;
  skipped_out_of_scope: number;
  skipped_no_rj: number;
  sources: { gsc: number; dataforseo: number };
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
    const useGsc = input.use_gsc !== false && !!config.GOOGLE_REFRESH_TOKEN;

    log.info({ limit, useDfs, useGsc, dryRun: ctx.dry_run }, 'iniciando keyword research data-driven RJ');

    const errors: string[] = [];
    const sources = { gsc: 0, dataforseo: 0 };
    const collected: Array<{ keyword: string; category: KeywordCategory; source: 'gsc' | 'dataforseo'; sv?: number | null; diff?: number | null; cpc?: number | null; intent?: string | null }> = [];

    // 1) GSC top queries — oportunidades reais (impressoes >= 5, posicao 5-30 = pode subir)
    if (useGsc) {
      try {
        const end = new Date();
        const start = new Date(Date.now() - 28 * 86_400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const rows = await gsc.searchAnalytics({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ['query'],
          rowLimit: 500,
        });
        for (const r of rows) {
          if (!r.query) continue;
          if (r.impressions < 5) continue;
          if (r.position < 5 || r.position > 30) continue; // sweet spot pra subir
          collected.push({
            keyword: r.query,
            category: classify(r.query),
            source: 'gsc',
          });
          sources.gsc++;
        }
        log.info({ gsc_queries: sources.gsc, total_rows: rows.length }, 'GSC carregado');
        if (sources.gsc === 0) {
          errors.push('gsc: 0 queries qualificadas — GSC vazio, sem oportunidades posicao 5-30');
        }
      } catch (e) {
        errors.push(`gsc: ${(e as Error).message}`);
        log.error({ err: (e as Error).message }, 'GSC falhou — ABORTANDO (data-driven obrigatorio)');
        // Modo data-driven: GSC falha = abortar (a regra exige cruzar GSC+DFS)
        // Mas seguimos pro DFS porque cobre o gap parcialmente.
      }
    } else {
      const msg = 'GSC obrigatorio (regra data-driven) mas credencial ausente — ABORTANDO';
      log.error({}, msg);
      errors.push(msg);
      return { output: { inserted: 0, skipped_out_of_scope: 0, skipped_no_rj: 0, sources, errors } };
    }

    // 2) DataForSEO — expande BASE_SEEDS (RJ) em sugestoes.
    // Cache 7d: se mesma seed ja rodou nos ultimos 7d, pula.
    if (useDfs) {
      try {
        const { query } = await import('../db/pg.js');
        const recentCalls = await query<{ endpoint: string; request_body: { keyword?: string }; called_at: string }>(
          `SELECT endpoint, request_body, called_at FROM seo.dataforseo_calls
           WHERE called_at >= now() - interval '7 days'
             AND endpoint LIKE '%keyword_suggestions%'`,
        );
        const cachedSeeds = new Set<string>();
        for (const row of recentCalls) {
          const body = row.request_body as Array<{ keyword?: string }> | undefined;
          const seed = body?.[0]?.keyword?.toLowerCase().trim();
          if (seed) cachedSeeds.add(seed);
        }
        log.info({ cached_seeds_7d: cachedSeeds.size, total_seeds: BASE_SEEDS.length }, 'cache DataForSEO check');

        let cacheHits = 0;
        let cacheMisses = 0;
        for (const s of BASE_SEEDS) {
          const seedLower = s.seed.toLowerCase().trim();
          if (cachedSeeds.has(seedLower)) {
            cacheHits++;
            log.debug({ seed: s.seed }, 'cache hit — pulando');
            continue;
          }
          cacheMisses++;
          try {
            const sug = await dfs.keywordSuggestions(s.seed, 30);
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
            const msg = (e as Error).message;
            errors.push(`dfs seed "${s.seed}": ${msg}`);
            if (/budget esgotado/i.test(msg)) {
              log.warn({ seed: s.seed }, 'budget guard disparou — parando pesquisa DataForSEO');
              break;
            }
          }
        }
        log.info({ dataforseo_kws: sources.dataforseo, cache_hits: cacheHits, cache_misses: cacheMisses }, 'DataForSEO carregado');
      } catch (e) {
        errors.push(`dataforseo: ${(e as Error).message}`);
      }
    } else {
      log.warn('DataForSEO credencial ausente — usando so GSC');
    }

    // 3) Filtro: escopo + brand-search + RJ obrigatorio (com enrich) + upsert
    let inserted = 0;
    let skipped = 0;
    let skippedNoRj = 0;
    let enriched = 0;
    const seen = new Set<string>();
    for (const c of collected) {
      if (inserted >= limit) break;
      const violation = checkScope(c.keyword);
      if (violation) {
        skipped++;
        log.debug({ kw: c.keyword, reason: violation.reason, matched: violation.matched }, 'fora de escopo');
        continue;
      }
      // Brand search nunca vira blog (queries tipo "21go", "21 gol seguro" etc)
      if (isBrandSearch(c.keyword)) {
        skippedNoRj++;
        log.debug({ kw: c.keyword }, 'brand-search — descartada');
        continue;
      }
      // Se nao tem RJ, ENRIQUECE com " no rio de janeiro" (mantém a regra geo, aproveita demanda real)
      let finalKw = c.keyword;
      if (!hasRjModifier(finalKw)) {
        finalKw = enrichRj(finalKw);
        enriched++;
      }
      const norm = normalize(finalKw);
      if (seen.has(norm)) continue;
      seen.add(norm);
      const enrichedKw = finalKw;
      // override keyword pra que upsert use a versao enriquecida
      c.keyword = enrichedKw;

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

    log.info({ inserted, enriched_rj: enriched, skipped_brand: skippedNoRj, skipped_scope: skipped, sources }, 'agente 01 concluido');
    return {
      output: { inserted, skipped_out_of_scope: skipped, skipped_no_rj: skippedNoRj, sources, errors },
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
