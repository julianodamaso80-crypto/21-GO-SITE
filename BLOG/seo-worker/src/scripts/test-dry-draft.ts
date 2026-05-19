/**
 * Smoke test E2E — gera 1 rascunho MDX em _drafts/.
 *
 * Modos:
 *   - default (stub): nao chama LLM/DB. Usa briefing/body hardcoded.
 *     Util pra validar mdx.ts + filesystem + slug + scope-guard.
 *
 *   - --real: roda pipeline completo (02 -> 04 -> 05 -> 06 -> 07 -> 08).
 *     Precisa de SUPABASE_URL/KEY + ANTHROPIC_API_KEY + ANTHROPIC_MODEL_MAIN + ANTHROPIC_MODEL_LIGHT
 *     e uma keyword pendente em seo.keywords (ou passa --seed-keyword).
 *
 * Uso:
 *   tsx src/scripts/test-dry-draft.ts                        # stub mode
 *   tsx src/scripts/test-dry-draft.ts --real                 # real mode
 *   tsx src/scripts/test-dry-draft.ts --real --seed-keyword="protecao moto entregador"
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMdx, slugify } from '../lib/mdx.js';
import { checkScope } from '../lib/scope-guard.js';
import { logger } from '../lib/logger.js';

const args = new Set(process.argv.slice(2));
const REAL = args.has('--real');
const seedKwArg = process.argv.find((a) => a.startsWith('--seed-keyword='))?.split('=')[1];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findRepoRoot(): Promise<string> {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    try { await fs.access(path.join(dir, '.git')); return dir; } catch { /* sobe */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function stubMode(): Promise<void> {
  logger.info('=== STUB MODE — sem LLM/DB ===');

  const title = 'Protecao veicular para moto de entregador: o que avaliar antes';
  const slug = slugify(title);

  // Scope check (sanidade)
  const violation = checkScope(title);
  if (violation) {
    logger.error({ violation }, 'titulo viola escopo — bug no scope-guard');
    process.exit(1);
  }

  const body = `Trabalhar com entrega de moto significa rodar 8 a 12 horas por dia em areas de risco. A protecao patrimonial veicular pode ajudar a reduzir o prejuizo em caso de roubo, mas funciona diferente do seguro tradicional — e isso muda o que voce precisa observar antes de contratar.

## O que muda para quem entrega de moto

Motociclistas que trabalham com entregas tem perfil de risco mais alto. Algumas pontos importantes:

- A quilometragem rodada e maior — o desgaste do veiculo aumenta
- Areas de operacao podem incluir bairros com indices de roubo mais altos
- O tempo medio com a moto fora de casa e maior, ampliando exposicao

## Diferencas entre seguro e protecao patrimonial veicular

Sao produtos distintos. O seguro tradicional e regulado pela SUSEP e tem regras especificas de cobertura. A protecao patrimonial veicular funciona por mutualismo: associados contribuem mensalmente para um fundo comum, que cobre eventos previstos no regulamento.

### Pontos para um motoboy observar

- Como funciona a vistoria inicial
- Quais sao as carencias
- Existe assistencia 24h?
- Como funciona o rateio mensal

## Exemplo pratico

Um motoboy que roda em Niteroi e fecha uma protecao basica paga, em media, R$ 60 a R$ 120 por mes, dependendo do valor de tabela FIPE da moto. Em caso de roubo, o regulamento da associacao define o que e coberto e qual a franquia/participacao.

## Perguntas frequentes

**1. Moto usada pode entrar na protecao?**
Sim, geralmente com vistoria previa.

**2. Trabalhar como entregador exclui da protecao?**
Depende da associacao — algumas tem produtos especificos para uso profissional.

**3. Quanto demora pra ativar?**
Apos vistoria aprovada, costuma ser rapido. Fale com um consultor para ver o prazo atual.

---

Quer entender se sua moto se enquadra na protecao da 21Go? [Faca uma simulacao gratuita](/cotacao) ou [fale com um consultor](https://wa.me/5521969454824).`;

  const repoRoot = await findRepoRoot();
  const driftsDir = path.join(repoRoot, '21go-website/content/blog/_drafts');
  await fs.mkdir(driftsDir, { recursive: true });
  const filePath = path.join(driftsDir, `${slug}.mdx`);

  const mdx = buildMdx({
    title,
    description: 'Quem entrega de moto tem perfil de risco maior — entenda o que avaliar na protecao patrimonial veicular antes de contratar.',
    date: new Date().toISOString().slice(0, 10),
    author: '21Go',
    category: 'Motos',
    keywords: ['protecao moto entregador', 'protecao moto motoboy', 'protecao patrimonial veicular moto'],
    image: '/blog/default.jpg',
  }, body);

  await fs.writeFile(filePath, mdx, 'utf8');
  logger.info({ filePath, bytes: Buffer.byteLength(mdx, 'utf8'), slug, word_count: body.split(/\s+/).filter(Boolean).length }, 'rascunho gerado (stub)');

  // valida com parseMdx
  const { parseMdx } = await import('../lib/mdx.js');
  const reread = await fs.readFile(filePath, 'utf8');
  const parsed = parseMdx(reread);
  logger.info({
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    keywords: parsed.data.keywords,
    word_count: parsed.word_count,
    read_time: parsed.read_time_min,
  }, 'parseMdx ok');

  logger.info('=== STUB MODE: SUCESSO ===');
  logger.info(`abra o arquivo: ${filePath}`);
}

async function realMode(): Promise<void> {
  logger.info('=== REAL MODE — precisa de SUPABASE + ANTHROPIC envs ===');

  // checagem barata
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL_MAIN', 'ANTHROPIC_MODEL_LIGHT'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error({ missing }, 'Pendente de credencial — preencha .env antes de --real');
    process.exit(1);
  }

  const { supabase } = await import('../db/supabase.js');
  const { agent02 } = await import('../agents/02-seo-strategist.js');
  const { agent04 } = await import('../agents/04-briefing.js');
  const { agent05 } = await import('../agents/05-writer.js');
  const { agent06 } = await import('../agents/06-legal-reviewer.js');
  const { agent07 } = await import('../agents/07-onpage-seo.js');
  const { agent08 } = await import('../agents/08-design-repurpose.js');
  const { upsertKeyword } = await import('../db/repositories/keywords.js');

  const ctx = { triggered_by: 'manual:test-dry-draft' };

  // 1) Insere ou pega keyword
  const seedKw = seedKwArg ?? 'protecao moto entregador';
  logger.info({ seedKw }, 'inserindo keyword');
  const kw = await upsertKeyword({
    keyword: seedKw,
    category: 'motos',
    source: 'manual',
  });

  // 2) Strategist (02)
  logger.info({ kwId: kw.id }, '> Agente 02 strategist');
  const r02 = await agent02.run({ keyword: kw }, ctx);
  logger.info({ decision: r02.output.decision, reason: r02.output.reason, cost: r02.output.llm_cost_usd }, '< Agente 02');
  if (!r02.output.topic_id || (r02.output.decision !== 'APROVAR_ARTIGO_NOVO' && r02.output.decision !== 'ATUALIZAR_ARTIGO_EXISTENTE')) {
    logger.error({ decision: r02.output.decision }, 'strategist nao aprovou');
    process.exit(2);
  }

  // 3) Fetch topic
  const { data: topic } = await supabase().from('topics').select('*').eq('id', r02.output.topic_id).single();

  // 4) Briefing (04)
  logger.info({ topicId: topic.id }, '> Agente 04 briefing');
  const r04 = await agent04.run({ topic }, ctx);
  logger.info({ briefingId: r04.output.briefing_id, cost: r04.output.llm_cost_usd }, '< Agente 04');
  if (!r04.output.briefing_id || !r04.output.briefing) {
    logger.error('briefing nao gerado');
    process.exit(3);
  }

  // 5) Writer (05)
  logger.info('> Agente 05 writer');
  const r05 = await agent05.run({ topic, briefing: r04.output.briefing }, ctx);
  logger.info({ articleId: r05.output.article_id, slug: r05.output.slug, wc: r05.output.word_count, cost: r05.output.llm_cost_usd }, '< Agente 05');
  if (!r05.output.article_id) { logger.error('writer falhou'); process.exit(4); }

  const { data: article } = await supabase().from('articles').select('*').eq('id', r05.output.article_id).single();

  // 6) Reviewer (06)
  logger.info('> Agente 06 reviewer');
  const r06 = await agent06.run({ article }, ctx);
  logger.info({ review: r06.output.review_status, cost: r06.output.llm_cost_usd }, '< Agente 06');

  // 7) OnPage (07)
  logger.info('> Agente 07 onpage');
  const r07 = await agent07.run({ article }, ctx);
  logger.info({ warnings: r07.output.warnings.length, fixes: r07.output.fixes_applied.length }, '< Agente 07');

  // 8) Repurpose (08)
  logger.info('> Agente 08 repurpose');
  const r08 = await agent08.run({ article }, ctx);
  logger.info({ has_image: !!r08.output.featured_image_brief, cost: r08.output.llm_cost_usd }, '< Agente 08');

  const totalCost = (r02.output.llm_cost_usd ?? 0) + (r04.output.llm_cost_usd ?? 0) + (r05.output.llm_cost_usd ?? 0) + (r06.output.llm_cost_usd ?? 0) + (r08.output.llm_cost_usd ?? 0);
  logger.info({
    article_id: article.id,
    slug: article.slug,
    mdx_path: article.mdx_path,
    review: r06.output.review_status,
    total_cost_usd: totalCost.toFixed(6),
  }, '=== REAL MODE: SUCESSO ===');
}

(async () => {
  try {
    if (REAL) await realMode();
    else await stubMode();
    process.exit(0);
  } catch (e) {
    logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'test-dry-draft falhou');
    process.exit(99);
  }
})();
