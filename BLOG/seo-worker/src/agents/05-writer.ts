/**
 * Agente 05 — Writer
 *
 * Entrada: BriefingRow + TopicRow.
 * Saida:
 *   - MDX completo (frontmatter + body)
 *   - ArticleRow em seo.articles com status='draft'
 *   - Arquivo salvo em 21go-website/content/blog/_drafts/{slug}.mdx (no filesystem do worker)
 *
 * Regras de escrita (hard):
 *   - Portugues do Brasil
 *   - 900-2200 palavras
 *   - Sem prometer cobertura/indenizacao/garantia
 *   - Sem afirmar "igual seguro"
 *   - Sem caminhao/onibus/carga
 *   - Sempre CTA pra falar com consultor
 *   - Frontmatter compativel com src/lib/blog.ts atual do site
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import type { TopicRow } from '../db/repositories/topics.js';
import type { BriefingRow, ArticleRow } from '../db/repositories/articles.js';
import { insertArticle, updateArticle } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { buildMdx, slugify, type ArticleFrontmatter } from '../lib/mdx.js';
import { embedPassage } from '../lib/similarity.js';
import { SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:05-writer');

/** Diretorio do site relativo a raiz do repo (worker e site coabitam). */
const DRAFTS_DIR_FROM_REPO = '21go-website/content/blog/_drafts';

const SYSTEM_PROMPT = `Voce e o redator senior do blog da 21Go (associacao de protecao patrimonial veicular do Rio, 20+ anos de mercado).

${SCOPE_RULES_TEXT}

REGRAS HARD (qualquer violacao = artigo REPROVADO automaticamente):

[T] TAMANHO
- OBRIGATORIO: ${config.WORDS_PER_ARTICLE_MIN}-${config.WORDS_PER_ARTICLE_MAX} palavras no corpo.
- Mire 1400. Se passar de ${config.WORDS_PER_ARTICLE_MAX}, conclua o pensamento atual e PARE.
- Artigos longos demais perdem leitor mobile e sao penalizados pelo Google.

[C] CTAs OBRIGATORIOS (no MINIMO 3 ao longo do artigo)
- CTA 1 — no meio do artigo (apos o ~50% do conteudo, link pra /protecao-veicular ou /cotacao):
    "Quer entender se a protecao patrimonial veicular da 21Go cobre seu caso? [Conheca os planos](/protecao-veicular)."
- CTA 2 — antes do FAQ (link pra /cotacao):
    "Faca uma [cotacao gratuita em 30 segundos](/cotacao) e veja o valor pro seu veiculo."
- CTA 3 — no final (link pra /cotacao OU consultor):
    "Pra entender o que faz sentido pro seu caso, [fale com um consultor da 21Go](/cotacao) sem compromisso."

[L] LINKS INTERNOS OBRIGATORIOS (no MINIMO 3 dentro do corpo)
SEMPRE incluir pelo menos:
  - 1 link pra /protecao-veicular (pagina pilar)
  - 1 link pra /cotacao
  - 1 link pra /faq
Adicionais permitidos: /indique, /sobre.

[V] CONEXAO COM PROTECAO VEICULAR (regra de negocio)
Todo artigo precisa explicar — de forma natural, sem forcar — como o tema se conecta com o que a 21Go oferece. Nunca seja so educativo abstrato.

[X] NUNCA USAR
- "cobertura garantida" / "indenizacao garantida"
- "aprovacao automatica" (so em frases NEGADAS: "Nao existe aprovacao automatica" e OK)
- "cobre tudo" / "protege qualquer veiculo"
- "igual seguro" / "tipo seguro" / "e seguro" (afirmativo)
- "garantia" sem ressalva
- frases que prometam resultado sem analise

[E] SEMPRE
- Tratar o leitor como pessoa real, nao como persona generica
- Dar 1-2 exemplos praticos concretos (com nomes ficticios tipo "Maria" ou "Joao" e situacao realista)
- Reforcar: "protecao patrimonial veicular" e diferente de seguro tradicional (mas faca uma vez so — nao repita 5x)

[F] FORMATO
- Markdown puro (sem HTML, sem componentes React)
- H1 unico = o titulo do artigo. NAO comece com H1 — o H1 vai no frontmatter.
- H2/H3 conforme o briefing
- Listas com bullets reais (nao bullets vazios)
- Tabelas GFM \`| col | col |\` quando comparar planos/coberturas
- Paragrafos curtos (3-5 linhas), escaneaveis

[B] FAQ
- Secao "## Perguntas frequentes" no fim
- Inclui TODOS os FAQs do briefing
- Pode adicionar 1-2 perguntas se fizer sentido

SAIDA: APENAS o corpo do artigo em Markdown (sem frontmatter — eu adiciono depois).`;

interface Input {
  topic: TopicRow;
  briefing: BriefingRow;
}

interface Output {
  article_id: string | null;
  slug: string;
  mdx_path: string;
  word_count: number;
  read_time_min: number;
  llm_cost_usd: number | null;
}

export const agent05: Agent<Input, Output> = {
  id: '05-writer',
  description: 'Gera artigo MDX em rascunho (content/blog/_drafts/) a partir de briefing',
  async run(input, ctx) {
    const { topic, briefing } = input;
    const slug = slugify(briefing.seo_title);

    // ===== Monta prompt =====
    const outlineText = (briefing.outline as Array<{ h2: string; h3?: string[]; notes?: string }> | undefined ?? [])
      .map((s, i) => {
        const h3s = (s.h3 ?? []).map((h) => `      - H3: ${h}`).join('\n');
        return `  ${i + 1}. H2: ${s.h2}${s.notes ? `\n     Notas: ${s.notes}` : ''}${h3s ? `\n${h3s}` : ''}`;
      })
      .join('\n');

    const faqsText = (briefing.faqs as Array<{ q: string; a: string }> | undefined ?? [])
      .map((f, i) => `  ${i + 1}. P: ${f.q}\n     R esperada (curta): ${f.a}`)
      .join('\n');

    const linksText = (briefing.internal_links as Array<{ anchor: string; url: string }> | undefined ?? [])
      .map((l, i) => `  ${i + 1}. [${l.anchor}](${l.url})`)
      .join('\n');

    const userMsg = `Topico: "${topic.title}"
Categoria: ${topic.category}
Audiencia: ${topic.audience ?? '(nao informada)'}
Dor: ${topic.pain_point ?? '(nao informada)'}

Title SEO definitivo: "${briefing.seo_title}"
H1: "${briefing.h1}"

Outline a seguir RIGOROSAMENTE:
${outlineText || '  (vazio)'}

FAQs a incluir no final:
${faqsText || '  (vazio)'}

Links internos a usar (EXATAMENTE estes anchors/urls):
${linksText || '  (vazio)'}

Notas comerciais/juridicas (cumprir):
${briefing.legal_notes ?? '(nenhuma)'}

Exemplos sugeridos:
${briefing.example_suggestions ?? '(nenhum)'}

Pagina pilar relacionada: ${topic.pillar_page ?? '/protecao-veicular'}

ESCREVA o corpo do artigo em Markdown puro (${config.WORDS_PER_ARTICLE_MIN}-${config.WORDS_PER_ARTICLE_MAX} palavras), seguindo TODAS as regras do system prompt.
NAO inclua frontmatter YAML. NAO inclua H1 no inicio (sera renderizado a partir do title).
Termine com uma secao "## Perguntas frequentes" e depois um CTA final.`;

    log.info({ topic: topic.id, briefing: briefing.id, slug }, 'gerando artigo');

    const r = await complete({
      tier: 'main',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 2800,
      temperature: 0.6,
      timeout_ms: 180_000,
    });

    const body = stripFrontmatterIfAny(r.text);
    const word_count = body.split(/\s+/).filter(Boolean).length;
    const read_time_min = Math.max(1, Math.ceil(word_count / 220));

    // Pega categoria capitalizada pra frontmatter
    const categoryDisplay = {
      carros: 'Carros',
      motos: 'Motos',
      frotas: 'Frotas',
      educativo: 'Educativo',
    }[topic.category] ?? 'Geral';

    // Keywords frontmatter: termos curtos (NAO duplica o titulo completo).
    // Prioriza: main_keyword da topic + secondary_keywords + slug tokens.
    // Filtro: cada keyword tem 1-6 palavras, sem pontuacao final, em lowercase.
    const slugTokens = slug.replace(/-/g, ' ');
    const rawCandidates = [
      ...(topic.secondary_keywords ?? []),
      slugTokens,
      topic.category, // ex: 'frotas'
      'protecao patrimonial veicular',
      'protecao veicular',
    ];
    const seen = new Set<string>();
    const keywords: string[] = [];
    for (const c of rawCandidates) {
      if (!c) continue;
      const clean = c.toLowerCase().replace(/[.!?]+$/, '').trim();
      const wordCount = clean.split(/\s+/).length;
      if (wordCount < 1 || wordCount > 6) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      keywords.push(clean);
      if (keywords.length >= 6) break;
    }

    const frontmatter: ArticleFrontmatter = {
      title: briefing.seo_title,
      description: truncate(briefing.h1, 160),
      date: new Date().toISOString().slice(0, 10),
      author: '21Go',
      category: categoryDisplay,
      keywords,
      image: '/blog/default.jpg',
    };

    const mdx = buildMdx(frontmatter, body);

    if (ctx.dry_run) {
      log.info({ slug, word_count, read_time_min, cost: r.cost_usd }, 'DRY-RUN — nao salva no disco/DB');
      return {
        output: { article_id: null, slug, mdx_path: `(dry-run)/${slug}.mdx`, word_count, read_time_min, llm_cost_usd: r.cost_usd },
      };
    }

    // ===== Salva no disco =====
    const repoRoot = await findRepoRoot();
    const driftsDir = path.join(repoRoot, DRAFTS_DIR_FROM_REPO);
    await fs.mkdir(driftsDir, { recursive: true });
    const mdxPath = path.join(driftsDir, `${slug}.mdx`);
    await fs.writeFile(mdxPath, mdx, 'utf8');
    log.info({ mdxPath }, 'rascunho salvo no disco');

    // ===== Insere ArticleRow =====
    const article: ArticleRow = await insertArticle({
      topic_id: topic.id,
      briefing_id: briefing.id,
      title: briefing.seo_title,
      slug,
      meta_title: briefing.seo_title,
      meta_description: frontmatter.description,
      category: topic.category,
      main_keyword: topic.title,
      secondary_keywords: topic.secondary_keywords,
      mdx_path: path.relative(repoRoot, mdxPath).replace(/\\/g, '/'),
      word_count,
      read_time_min,
      status: 'draft',
    });

    // ===== Embedding (best-effort) =====
    try {
      const emb = await embedPassage(`${frontmatter.title}. ${body.slice(0, 2000)}`);
      // Supabase JS nao tem helper direto pra escrever vector — usa rpc/postgrest com tipagem livre
      await updateArticle(article.id, { embedding: emb as unknown as number[] });
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'embedding falhou — seguindo sem');
    }

    return {
      output: {
        article_id: article.id,
        slug,
        mdx_path: article.mdx_path ?? '',
        word_count,
        read_time_min,
        llm_cost_usd: r.cost_usd,
      },
    };
  },
};

function stripFrontmatterIfAny(text: string): string {
  // Se o LLM inserir frontmatter por engano, removemos
  if (text.trim().startsWith('---')) {
    const m = /^---[\s\S]+?---\n+/m.exec(text);
    if (m) return text.slice(m[0].length).trim();
  }
  return text.trim();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trim() + '…';
}

/** Encontra raiz do repo subindo ate achar .git */
async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      await fs.access(path.join(dir, '.git'));
      return dir;
    } catch { /* segue subindo */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: CWD
  return process.cwd();
}
