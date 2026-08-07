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
// Medido em 07/08: de 45 keywords vindas de seeds de MODELO ("byd yuan plus") e de
// PRODUTO ("motoboy", "scooter"), 41 foram rejeitadas pelo estrategista — e com razao:
// vinham "byd yuan plus preco", "ficha tecnica", "bag de motoboy", "bau de motoboy".
// Quem busca isso quer comprar o carro ou o acessorio, nao proteger o que ja tem.
// O pool passa a privilegiar seeds de DOR, que foi o que sempre rendeu pauta boa
// ("bateria byd" 5.400/mes dif 0, "seguro de carro eletrico e mais caro").
const BASE_SEEDS: Array<{ seed: string; category: KeywordCategory }> = [
  // ---- carros ----
  { seed: 'protecao veicular', category: 'carros' },
  { seed: 'protecao veicular carro', category: 'carros' },
  { seed: 'carro financiado', category: 'carros' },
  { seed: 'carro de aplicativo', category: 'carros' },
  { seed: 'carro roubado', category: 'carros' },
  { seed: 'furto de carro', category: 'carros' },
  { seed: 'perda total do veiculo', category: 'carros' },
  { seed: 'batida de carro', category: 'carros' },
  { seed: 'carro alagado', category: 'carros' },
  { seed: 'granizo carro', category: 'carros' },
  // ---- decisao de compra (07/08/2026) ----
  // Medido com DataForSEO: o site ranqueava 11 palavras e 10 eram o proprio nome da empresa.
  // O dinheiro do nicho esta em quem ainda esta ESCOLHENDO — "associacao de protecao veicular"
  // (1.000/mes, dificuldade 11), "melhor protecao veicular" (480/mes), "diferenca entre seguro
  // e protecao veicular" (880/mes, dificuldade ZERO). Sao buscas de quem vai contratar e ainda
  // nao sabe de quem, que e exatamente onde a 21Go tem 20 anos de argumento e nao aparecia.
  //
  // Seed de marca concorrente ("star protecao veicular", 12.100/mes) fica de FORA de proposito:
  // o volume e alto, mas quem digita isso quer o telefone da Star, nao trocar de associacao.
  { seed: 'associacao de protecao veicular', category: 'carros' },
  { seed: 'melhor protecao veicular', category: 'carros' },
  { seed: 'protecao veicular ou seguro', category: 'carros' },
  { seed: 'protecao veicular vale a pena', category: 'carros' },
  // ---- motos ----
  { seed: 'protecao veicular moto', category: 'motos' },
  { seed: 'seguro moto', category: 'motos' },
  { seed: 'moto delivery', category: 'motos' },
  { seed: 'moto financiada', category: 'motos' },
  { seed: 'roubo de moto', category: 'motos' },
  { seed: 'moto roubada', category: 'motos' },
  { seed: 'queda de moto', category: 'motos' },
  // ---- frotas (nunca caminhao) — 1 frota/dia obrigatoria ----
  { seed: 'protecao de frota', category: 'frotas' },
  { seed: 'frota de veiculos', category: 'frotas' },
  { seed: 'gestao de frota', category: 'frotas' },
  { seed: 'seguro de frota', category: 'frotas' },
  { seed: 'custo de frota', category: 'frotas' },
  { seed: 'frota de motos', category: 'frotas' },
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
  // ---- BYD / eletrico (2 artigos/dia, decisao do dono em 2026-08-03) ----
  // Medido na API: o volume esta na DOR, nao no nome do carro. "byd dolphin preco"
  // e intent de quem vai COMPRAR o carro (dificuldade alta, nao vira lead nosso);
  // ja "bateria byd" tem 5.400/mes com dificuldade 0, e "seguro de carro eletrico e
  // mais caro" e exatamente a dor que a protecao patrimonial resolve.
  // Seeds de DOR rendem; seeds de MODELO ("byd dolphin", "byd seal", "byd yuan plus")
  // rendiam so "preco/ficha tecnica/usado" e eram rejeitadas em bloco. Saíram do pool.
  { seed: 'bateria byd', category: 'byd' },
  { seed: 'seguro byd', category: 'byd' },
  { seed: 'seguro carro eletrico', category: 'byd' },
  { seed: 'manutencao carro eletrico', category: 'byd' },
  { seed: 'revisao byd', category: 'byd' },
  { seed: 'garantia byd', category: 'byd' },
  { seed: 'conserto carro eletrico', category: 'byd' },
  { seed: 'oficina carro eletrico', category: 'byd' },
  { seed: 'roubo carro eletrico', category: 'byd' },
  { seed: 'bateria carro eletrico', category: 'byd' },
  { seed: 'recarga carro eletrico', category: 'byd' },
  { seed: 'desvalorizacao carro eletrico', category: 'byd' },
  { seed: 'perda total carro eletrico', category: 'byd' },
  { seed: 'carro hibrido manutencao', category: 'byd' },
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
 * Geografia de FORA da area de conteudo. Enriquecer essas com " no rio de janeiro"
 * gera aberracao tipo "roubo de carro em sp no rio de janeiro" — que chegou a ser
 * enviada pro estrategista. Melhor descartar.
 */
const OUTRAS_GEOGRAFIAS = [
  'sp', 'sao paulo', 'são paulo', 'campinas', 'santos', 'guarulhos', 'osasco',
  'bh', 'belo horizonte', 'minas gerais', 'mg', 'contagem', 'uberlandia',
  'curitiba', 'parana', 'paraná', 'pr', 'londrina',
  'porto alegre', 'rs', 'rio grande do sul', 'canoas',
  'salvador', 'bahia', 'ba', 'recife', 'pernambuco', 'pe', 'fortaleza', 'ceara', 'ceará',
  'brasilia', 'brasília', 'df', 'goiania', 'goiânia', 'goias', 'goiás',
  'manaus', 'belem', 'belém', 'vitoria', 'vitória', 'espirito santo', 'espírito santo',
  'florianopolis', 'florianópolis', 'santa catarina', 'sc', 'joinville', 'blumenau',
  'natal', 'joao pessoa', 'joão pessoa', 'maceio', 'maceió', 'aracaju', 'teresina',
  'campo grande ms', 'cuiaba', 'cuiabá', 'mato grosso',
];

function temOutraGeografia(keyword: string): boolean {
  const norm = normalize(keyword);
  return OUTRAS_GEOGRAFIAS.some((g) => new RegExp(`\\b${normalize(g).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(norm));
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

/**
 * Cluster BYD (decisao do dono em 2026-08-03): 2 artigos/dia mirando dono de BYD.
 *
 * O criterio e a MARCA/eletrificacao, entao vem antes das outras regras — senao
 * "byd dolphin" cairia em 'carros' e disputaria o slot do conteudo tradicional.
 */
function isByd(keyword: string): boolean {
  const k = normalize(keyword);
  if (/\bbyd\b/.test(k)) return true;
  if (/\b(dolphin|seal|song plus|song pro|yuan plus|yuan pro|han|tan|king|shark|blade)\b/.test(k)) return true;
  if (/\bcarro[s]? eletrico[s]?\b|\beletrico[s]?\b|\bhibrido[s]?\b|\bev\b/.test(k)) return true;
  return false;
}

function classify(keyword: string, fallback: KeywordCategory = 'educativo'): KeywordCategory {
  const k = keyword.toLowerCase();
  if (isByd(keyword)) return 'byd';
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
        const porMenosRecente = (a: { seed: string }, b: { seed: string }) =>
          (usadaEm.get(a.seed.toLowerCase().trim()) ?? 0) - (usadaEm.get(b.seed.toLowerCase().trim()) ?? 0);

        // BYD tem vagas RESERVADAS na rotacao: com 48 seeds e 6 por execucao, o cluster
        // passaria varias rodadas sem ser pesquisado — e ele precisa alimentar 2
        // artigos/dia. Sem reserva, o slot obrigatorio de BYD fica sem briefing.
        const SEEDS_BYD_RESERVADAS = 2;
        const seedsByd = BASE_SEEDS.filter((s) => s.category === 'byd').sort(porMenosRecente).slice(0, SEEDS_BYD_RESERVADAS);
        const seedsOutras = BASE_SEEDS.filter((s) => s.category !== 'byd').sort(porMenosRecente)
          .slice(0, Math.max(0, SEEDS_POR_EXECUCAO - seedsByd.length));
        const seedsDaVez = [...seedsByd, ...seedsOutras];

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
    //
    // Keywords que ja existem em estado terminal ('used'/'rejected') sao puladas SEM
    // consumir o limite. Antes, as ~39 queries do GSC (quase todas ja processadas)
    // vinham primeiro na lista e comiam a cota inteira, entao as sugestoes ineditas do
    // DataForSEO — que sao a unica fonte de pauta NOVA — nunca chegavam a ser inseridas.
    let jaConhecidas = new Set<string>();
    if (!ctx.dry_run) {
      try {
        const { query } = await import('../db/pg.js');
        const rows = await query<{ keyword_normalized: string }>(
          `SELECT keyword_normalized FROM seo.keywords
           WHERE company_id=$1 AND status IN ('used','rejected','out_of_scope')`,
          [config.COMPANY_ID],
        );
        jaConhecidas = new Set(rows.map((r) => r.keyword_normalized));
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'nao consegui carregar keywords ja processadas');
      }
    }

    // Intercala por categoria antes de aplicar o limite. Em FIFO puro, as primeiras
    // seeds da rotacao comiam a cota inteira: numa rodada de limit=40, "tabela fipe"
    // sozinha levou as 40 vagas e as seeds de BYD — que rodaram na mesma execucao —
    // nao inseriram NENHUMA keyword. BYD entra com peso 2 porque tem cota de 2
    // artigos/dia contra 1 das demais.
    const PESO: Partial<Record<KeywordCategory, number>> = { byd: 2 };
    const ordenado = intercalarPorCategoria(collected, PESO);

    let inserted = 0;
    let skipped = 0;
    let skippedNoRj = 0;
    let enriched = 0;
    let skippedConhecidas = 0;
    const seen = new Set<string>();
    for (const c of ordenado) {
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
      // Keyword de outra praca ("roubo de carro em sp") nao vira "... no rio de janeiro"
      if (!hasRjModifier(c.keyword) && temOutraGeografia(c.keyword)) {
        skipped++;
        log.debug({ kw: c.keyword }, 'geografia de fora — descartada');
        continue;
      }

      let finalKw = c.keyword;
      // BYD e a UNICA categoria sem trava geografica (decisao do dono em 2026-08-03).
      // Ninguem pesquisa "bateria byd rj": forcar o sufixo mataria os 5.400 buscas/mes
      // e o artigo nao ranquearia pra ninguem. BYD e nicho e a 21Go atende o Brasil
      // inteiro, entao dono de BYD em qualquer estado e lead valido.
      // Ver [[project_21go_atende_brasil_inteiro]].
      if (c.category === 'byd') {
        // segue nacional, sem enrich
      } else if (!hasRjModifier(finalKw)) {
        finalKw = enrichRj(finalKw);
        enriched++;
      }
      const norm = normalize(finalKw);
      if (seen.has(norm)) continue;
      seen.add(norm);
      // ja processada em rodada anterior — nao gasta cota
      if (jaConhecidas.has(norm)) {
        skippedConhecidas++;
        continue;
      }
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

    log.info({
      inserted, enriched_rj: enriched, skipped_brand: skippedNoRj,
      skipped_scope: skipped, skipped_ja_processadas: skippedConhecidas, sources,
    }, 'agente 01 concluido');
    return {
      output: { inserted, skipped_out_of_scope: skipped, skipped_no_rj: skippedNoRj, sources, errors },
    };
  },
};

/**
 * Round-robin por categoria: distribui as vagas do `limit` entre as categorias em vez
 * de entregar tudo pra quem chegou primeiro na lista. `peso` permite dar mais vagas a
 * uma categoria por volta (BYD usa 2, porque publica 2 artigos/dia).
 */
function intercalarPorCategoria<T extends { category: KeywordCategory }>(
  items: T[],
  peso: Partial<Record<KeywordCategory, number>> = {},
): T[] {
  const buckets = new Map<KeywordCategory, T[]>();
  for (const it of items) {
    const b = buckets.get(it.category);
    if (b) b.push(it);
    else buckets.set(it.category, [it]);
  }
  const out: T[] = [];
  let restante = items.length;
  while (restante > 0) {
    let mexeu = false;
    for (const [cat, arr] of buckets) {
      const n = peso[cat] ?? 1;
      for (let i = 0; i < n; i++) {
        const it = arr.shift();
        if (!it) break;
        out.push(it);
        restante--;
        mexeu = true;
      }
    }
    if (!mexeu) break;
  }
  return out;
}

function mapIntent(raw: string | null | undefined): 'informational' | 'navigational' | 'commercial' | 'transactional' | 'unknown' {
  if (!raw) return 'unknown';
  const v = raw.toLowerCase();
  if (v.includes('inform')) return 'informational';
  if (v.includes('navig')) return 'navigational';
  if (v.includes('commerc')) return 'commercial';
  if (v.includes('transact')) return 'transactional';
  return 'unknown';
}
