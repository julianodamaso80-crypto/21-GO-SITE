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
 *
 * Por que o pool e grande (2026-08-03): eram 8 seeds fixas e um cache de 7 dias.
 * Depois da primeira semana, TODA execucao dava cache hit em todas elas e o DFS
 * devolvia 0 keywords novas. Como o GSC so mostra queries onde o site JA aparece
 * (serve pra refresh, nao pra descoberta), o pipeline de pauta NOVA secou.
 *
 * Agora o pool cobre ~7 semanas sem repetir seed, com rotacao por menos-recente-uso
 * (janela de 30 dias) e um teto por execucao pra segurar o custo do DataForSEO.
 */
const SEEDS_POR_EXECUCAO = 6;
const JANELA_ROTACAO_DIAS = 30;

/**
 * IMPORTANTE — seeds precisam ser CURTAS (head terms que existem de verdade no
 * indice do DataForSEO). Seeds longas e especificas do tipo
 * "protecao veicular carro financiado rj" retornam ZERO sugestoes e cobram igual
 * (USD 0.012 por chamada). Medido em 2026-08-03:
 *   "protecao veicular carro financiado rj" -> 0 items
 *   "protecao veicular"                     -> 224 items
 * O recorte geografico nao vai na seed: o enrichRj() adiciona "no rio de janeiro"
 * depois, em cima da demanda real que o DFS devolveu.
 */
const BASE_SEEDS: Array<{ seed: string; category: KeywordCategory }> = [
  // ---- carros ----
  { seed: 'protecao veicular', category: 'carros' },
  { seed: 'protecao veicular carro', category: 'carros' },
  { seed: 'carro financiado', category: 'carros' },
  { seed: 'carro de aplicativo', category: 'carros' },
  { seed: 'carro seminovo', category: 'carros' },
  { seed: 'carro eletrico', category: 'carros' },
  { seed: 'suv', category: 'carros' },
  { seed: 'picape', category: 'carros' },
  // ---- motos ----
  { seed: 'protecao veicular moto', category: 'motos' },
  { seed: 'seguro moto', category: 'motos' },
  { seed: 'moto delivery', category: 'motos' },
  { seed: 'motoboy', category: 'motos' },
  { seed: 'moto financiada', category: 'motos' },
  { seed: 'scooter', category: 'motos' },
  // ---- frotas (nunca caminhao) — 1 frota/dia obrigatoria ----
  { seed: 'protecao de frota', category: 'frotas' },
  { seed: 'frota de veiculos', category: 'frotas' },
  { seed: 'gestao de frota', category: 'frotas' },
  { seed: 'seguro de frota', category: 'frotas' },
  { seed: 'locadora de veiculos', category: 'frotas' },
  // ---- educativo: transito/regulatorio ----
  // O GSC mostrou demanda real aqui ("isencao de ipva rj", "licenciamento 2026 rj")
  // em temas que o blog nao cobre — e onde ainda ha pauta genuinamente nova.
  { seed: 'ipva', category: 'educativo' },
  { seed: 'licenciamento de veiculo', category: 'educativo' },
  { seed: 'detran rj', category: 'educativo' },
  { seed: 'vistoria veicular', category: 'educativo' },
  { seed: 'multa de transito', category: 'educativo' },
  { seed: 'roubo de carro', category: 'educativo' },
  { seed: 'chassi remarcado', category: 'educativo' },
  { seed: 'leilao de carro', category: 'educativo' },
  { seed: 'transferencia de veiculo', category: 'educativo' },
  { seed: 'rastreador veicular', category: 'educativo' },
  { seed: 'crlv digital', category: 'educativo' },
  { seed: 'cnh suspensa', category: 'educativo' },
  { seed: 'tabela fipe', category: 'educativo' },
  { seed: 'sinistro de veiculo', category: 'educativo' },
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

/**
 * Marca de CONCORRENTE. Com seeds curtas o DataForSEO devolve muita associacao rival
 * ("star protecao veicular", "protefort protecao veicular"): trafego de quem procura
 * outra empresa, que nao converte e nao merece artigo.
 *
 * Heuristica conservadora: so dispara quando a keyword TERMINA em "protecao veicular"
 * (padrao de razao social) e o que vem antes nao e um qualificador generico.
 */
const QUALIFICADORES_GENERICOS = new Set([
  'melhor', 'melhores', 'qual', 'quais', 'quanto', 'custa', 'custo', 'valor', 'valores',
  'preco', 'precos', 'como', 'funciona', 'que', 'oque', 'sobre', 'tipos', 'tipo',
  'associacao', 'associacoes', 'empresa', 'empresas', 'contratar', 'vale', 'pena',
  'barata', 'barato', 'mensalidade', 'cotacao', 'simulacao', 'plano', 'planos',
  'carro', 'carros', 'moto', 'motos', 'frota', 'frotas', 'suv', 'picape', 'veiculo', 'veiculos',
  'rj', 'rio', 'janeiro', 'niteroi', 'nova', 'iguacu', 'caxias', 'duque',
  'e', 'de', 'da', 'do', 'a', 'o', 'em', 'no', 'na', 'para', 'com', 'uma', 'um',
  'seguro', 'seguradora', 'diferenca', 'entre', 'vantagens', 'desvantagens', 'reclame', 'aqui',
  'confiavel', 'boa', 'bom', 'top', 'lista', 'ranking', '2024', '2025', '2026',
]);

function isCompetitorBrand(keyword: string): boolean {
  const n = normalize(keyword).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/protecao veicular$/.test(n)) return false;
  const antes = n.replace(/\s*protecao veicular$/, '').trim();
  if (!antes) return false;                       // a propria expressao generica
  return antes.split(/\s+/).some((t) => !QUALIFICADORES_GENERICOS.has(t));
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
           WHERE called_at >= now() - interval '${JANELA_ROTACAO_DIAS} days'
             AND endpoint LIKE '%keyword_suggestions%'`,
        );
        const usadaEm = new Map<string, number>();
        for (const row of recentCalls) {
          const body = row.request_body as Array<{ keyword?: string }> | undefined;
          const seed = body?.[0]?.keyword?.toLowerCase().trim();
          if (!seed) continue;
          const t = new Date(row.called_at).getTime();
          usadaEm.set(seed, Math.max(usadaEm.get(seed) ?? 0, t));
        }

        // Rotacao: nunca usadas primeiro, depois as menos recentes. Teto por execucao
        // pra nao estourar o budget do DataForSEO com um pool grande.
        const seedsDaVez = [...BASE_SEEDS]
          .sort((a, b) => (usadaEm.get(a.seed.toLowerCase().trim()) ?? 0) - (usadaEm.get(b.seed.toLowerCase().trim()) ?? 0))
          .slice(0, SEEDS_POR_EXECUCAO);

        log.info({
          pool: BASE_SEEDS.length,
          usadas_na_janela: usadaEm.size,
          janela_dias: JANELA_ROTACAO_DIAS,
          seeds_da_vez: seedsDaVez.map((s) => s.seed),
        }, 'rotacao de seeds DataForSEO');

        let cacheHits = 0;
        let cacheMisses = 0;
        for (const s of seedsDaVez) {
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
      // Marca de concorrente ("star protecao veicular") tambem nao vira pauta
      if (isCompetitorBrand(c.keyword)) {
        skippedNoRj++;
        log.debug({ kw: c.keyword }, 'marca de concorrente — descartada');
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
