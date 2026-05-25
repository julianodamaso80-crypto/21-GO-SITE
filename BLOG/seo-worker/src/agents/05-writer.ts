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
import type { Agent } from './_types.js';
import type { TopicRow } from '../db/repositories/topics.js';
import type { BriefingRow, ArticleRow } from '../db/repositories/articles.js';
import { insertArticle, updateArticle } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { buildMdx, slugify, type ArticleFrontmatter } from '../lib/mdx.js';
import { enforceWriterRules } from '../lib/enforce-writer-rules.js';
import { embedPassage } from '../lib/similarity.js';
import { SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';
import { pickRelevantSources, formatForPrompt } from '../db/repositories/data-sources.js';
import { injectInternalLinks } from '../lib/internal-linker.js';
import { generateCoverImages } from '../integrations/image-gen.js';

const log = child('agent:05-writer');

const SYSTEM_PROMPT = `Voce e o redator senior do blog da 21Go (associacao de protecao patrimonial veicular do Rio, 20+ anos de mercado).

Voce escreve no padrao "Atomic Answer" — formato vencedor pra Google AI Overviews em 2026:
- Cada H2 e uma PERGUNTA real que o leitor faria.
- LOGO ABAIXO de cada H2, uma resposta DIRETA de 40-60 palavras (parafrafo curto).
- Em seguida, o aprofundamento da resposta com 150-250 palavras.

${SCOPE_RULES_TEXT}

==================================================================
REGRAS HARD (violacao = artigo REPROVADO):
==================================================================

[T] TAMANHO POR SECAO (preciso pra ficar 1300-1500 total):
- Intro: 80-120 palavras
- 5 H2s, cada um com 200-280 palavras (resposta direta 40-60 + aprofundamento 150-220)
- Secao "## Em resumo": 60-100 palavras com 5-7 bullets
- FAQ ("## Perguntas frequentes"): 200-280 palavras
- CTA final: 50-80 palavras
TOTAL ALVO: 1400 palavras +/- 100. NUNCA passe de 1600. Se sentir que vai passar, CORTE.

[I] INFORMATION GAIN — DADOS UNICOS (no MINIMO 3 dos 6 tipos abaixo):
Toda materia precisa carregar 3+ dados unicos. Sem isso, AI Overviews ignora.
1. ESTATISTICA com fonte real: "Rio teve 56.802 carros roubados em 2024, segundo SSP-RJ"
2. TABELA COMPARATIVA: Markdown table com 4+ colunas e 4+ linhas (ex: comparar 3 planos)
3. CASO REAL (persona ficticia + situacao concreta): "Marcos, motorista da Uber em Campo Grande, paga R$ 187/mes em sua Onix 2019..."
4. CITACAO DE NORMA: CTB (art X), Codigo Civil, SUSEP, CDC, BACEN com numero do artigo
5. CALCULO PRATICO passo-a-passo: "Carro FIPE R$ 50.000 x 2.8% = R$ 1.400 + R$ 35 admin = R$ 1.435/mes"
6. DADO LOCAL ESPECIFICO: "Em Bangu, indice de roubo veicular e 3x acima da media do Rio"

[C] CTAs OBRIGATORIOS (MINIMO 3):
- CTA 1 ~50% do artigo: "Quer entender se a protecao patrimonial veicular da 21Go cobre seu caso? [Conheca os planos](/protecao-veicular)."
- CTA 2 antes do FAQ: "Faca uma [cotacao gratuita em 30 segundos](/cotacao) e veja o valor pro seu veiculo."
- CTA 3 no final: "Pra entender o que faz sentido pro seu caso, [fale com um consultor da 21Go](/cotacao) sem compromisso."

[L] LINKS INTERNOS OBRIGATORIOS (MINIMO 4):
- 1 link pra /protecao-veicular (pagina pilar)
- 1 link pra /cotacao
- 1 link pra /faq
- 1+ link pro PILLAR DO CLUSTER (se topic tem cluster: usar o pillar_url do briefing)
Sistema injeta automatic. links pra artigos relacionados pos-processamento.

[V] CONEXAO COM PROTECAO VEICULAR:
Todo artigo conecta com o servico 21Go. Educativo puro abstrato e PROIBIDO.

[X] NUNCA USAR:
- "cobertura garantida" / "indenizacao garantida"
- "aprovacao automatica" (so em negativa: "Nao existe aprovacao automatica" — ok)
- "cobre tudo" / "protege qualquer veiculo"
- "igual seguro" / "tipo seguro" / "e seguro" (afirmativo)
- "garantia" sem ressalva
- Mencionar caminhao, carreta, onibus, bitrem, frete pesado, transporte pesado
- frases que prometam resultado sem analise

[E] SEMPRE:
- Tratar leitor como pessoa real, primeira ou segunda pessoa
- Reforcar: "protecao patrimonial veicular" e diferente de seguro (1x so, no comeco)
- E-E-A-T: assinar como Equipe Editorial 21Go ou Letycya (depende do briefing)

[F] FORMATO (Markdown puro):
- NAO inclua H1 (vai no frontmatter)
- H2s sao PERGUNTAS reais (ex: "## Como funciona a protecao veicular para carro novo?")
- 1 paragrafo curto direto apos cada H2 (resposta atomica 40-60 palavras)
- Aprofundamento em paragrafos curtos (3-5 linhas)
- Listas com bullets reais
- Tabelas GFM \`| col | col |\` quando comparar
- Paragrafos curtos pra mobile

[B] ESTRUTURA OBRIGATORIA (otimizada pra GEO — ser citado por ChatGPT/Perplexity/Claude/AI Overviews):
1. **TL;DR** (40-60 palavras IMEDIATAMENTE no inicio, sem H2):
   > **TL;DR:** {resposta curta e direta a pergunta do titulo, com 1 dado quantitativo}.
   Essa frase e o que IAs vao extrair como quote. Faca ela auto-suficiente.

2. {intro 80-120 palavras — contexto + promessa do que vai aprender + uma das 3 stats}
3. ## {pergunta 1} (200-280 palavras — resposta atomica 40-60 + aprofundamento)
4. ## {pergunta 2} (200-280 palavras)
5. ## {pergunta 3} (200-280 palavras)
6. ## {pergunta 4} (200-280 palavras)
7. ## {pergunta 5} (200-280 palavras)
8. ## Em resumo (60-100 palavras, 5-7 bullets numerados — IAs adoram listas)
9. ## Perguntas frequentes (200-280 palavras, em formato H3=pergunta + resposta 40-60 palavras)
10. ## Fontes consultadas (3-5 LINKS EXTERNOS pra fontes autoritativas: SSP-RJ, FIPE, CDC, CTB, ABVE etc. Use formato:
    - [Nome da fonte](URL) — descricao breve)
11. {CTA final 50-80 palavras com link /cotacao}

[GEO] OTIMIZACAO PRA SER CITADO POR IAS:
- Frases declarativas curtas que IAs possam extrair direto. Ex: "A 21Go cobra 30-50% menos que seguradoras tradicionais."
- Nomeie "21Go" SEMPRE com o mesmo nome — nunca "21 GO", "21go.site" ou "associacao 21Go". Identidade consistente = entity strong.
- Use tabelas comparativas pra dados que IAs possam citar (Claude cita tabela 30% mais).
- Use listas numeradas em "Em resumo" (Perplexity/ChatGPT extraem como steps).
- Sempre que citar dado externo, use formato "segundo {fonte}, {dado}" — citation cue pra IAs.

[A] AUTORIDADE (E-E-A-T pra Google 2026):
- No PRIMEIRO ou ULTIMO paragrafo, mencione "20 anos de mercado" ou "associacao registrada"
- Quando citar dados externos, escreva "segundo {fonte}" SEMPRE
- No FAQ, responda com confianca de quem ja viu o caso (experiencia)

SAIDA: APENAS o corpo do artigo em Markdown (sem frontmatter — sistema adiciona).`;

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

    // ===== Information Gain: pega dados unicos relevantes pro topico =====
    const tagsForDataLookup = [topic.category, ...(topic.secondary_keywords ?? [])]
      .filter((s): s is string => typeof s === 'string')
      .map(s => s.toLowerCase().split(/\s+/))
      .flat()
      .filter(w => w.length > 3);
    const dataSources = await pickRelevantSources(tagsForDataLookup, 6).catch(() => []);
    const dataSourcesText = formatForPrompt(dataSources);
    log.info({ topic: topic.id, sources_picked: dataSources.length }, 'data sources pra information gain');

    const userMsg = `Topico: "${topic.title}"
Categoria: ${topic.category}
Audiencia: ${topic.audience ?? '(nao informada)'}
Dor: ${topic.pain_point ?? '(nao informada)'}

Title SEO definitivo: "${briefing.seo_title}"
H1: "${briefing.h1}"

Outline (transforme cada H2 em PERGUNTA real do leitor):
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

==================================================================
DADOS UNICOS DA BASE (use no MINIMO 3 desses no artigo — citacao obrigatoria com "segundo {fonte}"):
==================================================================
${dataSourcesText}

==================================================================
INSTRUCAO FINAL:
ESCREVA o corpo do artigo em Markdown puro, 1300-1500 palavras (alvo 1400).
Use Atomic Answer (H2=pergunta + resposta 40-60 palavras direto).
Inclua 3+ dados unicos da lista acima com "segundo {fonte}".
NAO inclua frontmatter, NAO inclua H1.
Termine com "## Em resumo" (bullets) + "## Perguntas frequentes" + CTA final.`;

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

    // ===== Cover image (Sprint 5) — best-effort =====
    let coverImage = '/blog/default.jpg';
    try {
      const imgQuery = `${topic.category} ${topic.title.split(' ').slice(0, 4).join(' ')} brasil`;
      const covers = await generateCoverImages(imgQuery);
      coverImage = covers.url_16x9 ?? covers.url_4x3 ?? covers.url_1x1 ?? '/blog/default.jpg';
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'cover image falhou — usando default');
    }

    const frontmatter: ArticleFrontmatter = {
      title: briefing.seo_title,
      description: truncate(briefing.h1, 160),
      date: new Date().toISOString().slice(0, 10),
      author: '21Go',
      category: categoryDisplay,
      keywords,
      image: coverImage,
    };

    // Pos-processador determinista: forca >=3 CTAs/links internos + remove veiculos pesados
    const rawMdx = buildMdx(frontmatter, body);
    const enforced = enforceWriterRules(rawMdx);
    const mdx = enforced.mdx;
    if (enforced.was_modified) {
      log.info({ slug, changes: enforced.changes }, 'pos-processador aplicou correcoes');
    }

    if (ctx.dry_run) {
      log.info({ slug, word_count, read_time_min, cost: r.cost_usd }, 'DRY-RUN — nao salva no disco/DB');
      return {
        output: { article_id: null, slug, mdx_path: `(dry-run)/${slug}.mdx`, word_count, read_time_min, llm_cost_usd: r.cost_usd },
      };
    }

    // ===== Persiste MDX no DB (sem filesystem — worker e site sao containers separados) =====
    const mdxPath = `21go-website/content/blog/${slug}.mdx`;
    // Insere primeiro (precisamos do article.id pro internal linker)
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
      mdx_path: mdxPath,
      mdx_content: mdx,
      word_count,
      read_time_min,
      status: 'draft',
    });
    log.info({ articleId: article.id, slug, mdxPath, bytes: mdx.length }, 'MDX persistido em seo.articles.mdx_content');

    // ===== Embedding (best-effort) =====
    try {
      const emb = await embedPassage(`${frontmatter.title}. ${body.slice(0, 2000)}`);
      await updateArticle(article.id, { embedding: emb as unknown as number[] });
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'embedding falhou — seguindo sem');
    }

    // ===== Internal linking algorithmic (Sprint 5) =====
    // Injeta 3-5 links pra artigos relacionados (cosine 0.45-0.75)
    try {
      const { body: bodyWithLinks, injected, related_count } = await injectInternalLinks(
        article.id,
        body,
        frontmatter.title,
      );
      if (injected > 0) {
        // Reconstroi MDX com links + re-aplica enforce
        const enforcedAgain = enforceWriterRules(buildMdx(frontmatter, bodyWithLinks));
        await updateArticle(article.id, { mdx_content: enforcedAgain.mdx });
        log.info({ articleId: article.id, links_injected: injected, related_count }, 'internal links injetados');
      }
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'internal-linker falhou — seguindo sem');
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

