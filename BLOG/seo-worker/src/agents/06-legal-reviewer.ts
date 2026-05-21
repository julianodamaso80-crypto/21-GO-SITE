/**
 * Agente 06 — Legal Commercial Reviewer
 *
 * 2 camadas:
 *   1) Regex hard-block — frases proibidas (cobertura garantida, igual seguro etc).
 *      Se detectar, retorna REPROVADO direto, sem chamar LLM.
 *   2) LLM judge (Sonnet) — avalia tom, escopo, CTA, honestidade, repeticao.
 *      Decide: APROVADO | APROVADO_COM_AJUSTES | REPROVADO + ajustes especificos.
 *
 * Atualiza seo.articles.review_status / review_notes.
 */
import type { Agent } from './_types.js';
import type { ArticleRow, ReviewStatus } from '../db/repositories/articles.js';
import { updateArticle } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { checkScope, SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:06-legal-reviewer');

// Hard-block: padroes inequivocamente proibidos (sem ambiguidade contextual).
// Patterns que dependem de contexto (ex: "aprovação automática", "sem análise"
// podem aparecer NEGADOS em frase honesta "NAO existe aprovacao automatica") sao
// deixados pro LLM judge avaliar — evitam falso-positivo.
const FORBIDDEN_PHRASES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bcobertura garantida\b/i, reason: 'promessa de cobertura sem analise' },
  { pattern: /\bindeniza[cç][ãa]o garantida\b/i, reason: 'promessa de indenizacao' },
  { pattern: /\bcobre tudo\b/i, reason: 'absoluto sem ressalva' },
  { pattern: /\bprotege qualquer ve[ií]culo\b/i, reason: 'absoluto sem ressalva' },
  { pattern: /\bigual (a |ao |o |um )?seguro\b/i, reason: 'confusao com seguro tradicional' },
  { pattern: /\btipo (um )?seguro\b/i, reason: 'confusao com seguro tradicional' },
  // /\b[ée] seguro\b/i pegava "associacao e seguro" como falso positivo — refinado pra "é seguro" so com acento.
  { pattern: /\bé seguro\b/i, reason: 'confusao com seguro tradicional' },
];

interface Input {
  article: ArticleRow;
}

interface Output {
  review_status: ReviewStatus;
  review_notes: string;
  hard_block_matches: Array<{ pattern: string; reason: string }>;
  llm_cost_usd: number | null;
}

const SYSTEM_PROMPT = `Voce e o revisor comercial e juridico da 21Go.

${SCOPE_RULES_TEXT}

Sua funcao: avaliar se um artigo do blog esta SEGURO para publicacao.

CRITERIOS:
1. NAO promete cobertura, indenizacao, aprovacao automatica.
2. NAO confunde protecao patrimonial veicular com seguro tradicional.
3. NAO inventa regras, valores ou prazos.
4. NAO menciona caminhao, carreta, onibus, transporte de carga.
5. NAO e repetitivo / "{tema} em {cidade}" sem dor especifica.
6. TEM CTA claro pra falar com consultor.
7. Tom: profissional, honesto, util — sem clickbait.

DECISAO POSSIVEL:
- APROVADO: pronto para publicar
- APROVADO_COM_AJUSTES: pode publicar mas sugere ajustes
- REPROVADO: nao publicar — explicar exatamente o que esta errado

Saida em JSON estrito (sem markdown, sem texto extra):
{
  "decision": "APROVADO" | "APROVADO_COM_AJUSTES" | "REPROVADO",
  "notes": "explicacao em 2-4 frases, citando trechos especificos quando aplicavel",
  "specific_fixes": ["array de ajustes pontuais (opcional)"]
}`;

export const agent06: Agent<Input, Output> = {
  id: '06-legal-reviewer',
  description: 'Revisa artigo gerado: hard-block regex + LLM judge',
  async run(input, ctx) {
    const a = input.article;
    if (!a.mdx_content) throw new Error('article sem mdx_content — nao tem o que revisar');
    const mdx = a.mdx_content;

    // ===== 1) Hard-block regex (frases proibidas + escopo) =====
    const hardMatches: Array<{ pattern: string; reason: string }> = [];
    for (const f of FORBIDDEN_PHRASES) {
      if (f.pattern.test(mdx)) hardMatches.push({ pattern: f.pattern.source, reason: f.reason });
    }

    // Escopo
    const scope = checkScope(mdx);
    if (scope) hardMatches.push({ pattern: scope.matched, reason: scope.reason });

    // ===== 2) Guards deterministicos de qualidade (decisao user 2026-05-20) =====
    // Separa body (sem frontmatter) pra contar so o conteudo
    const bodyOnly = mdx.replace(/^---[\s\S]+?---\n+/m, '');
    const wordCount = bodyOnly.split(/\s+/).filter(Boolean).length;

    // 2.1 — Tamanho: rejeita se fora da janela 1100-2200
    // (target 1300-1500 mas Gemini Flash consistentemente gera 1800-2000;
    //  rejeitar tudo gera loop infinito. Tolerancia ampla, qualidade fica
    //  com o LLM judge depois.)
    const HARD_MIN = 1100;
    const HARD_MAX = 2200;
    if (wordCount < HARD_MIN) {
      hardMatches.push({ pattern: `wordCount=${wordCount}<${HARD_MIN}`, reason: 'artigo curto demais (target 1300-1500)' });
    }
    if (wordCount > HARD_MAX) {
      hardMatches.push({ pattern: `wordCount=${wordCount}>${HARD_MAX}`, reason: 'artigo longo demais (target 1300-1500)' });
    }

    // 2.2 — 3+ CTAs: conta links pra /cotacao OU /protecao-veicular OU frase "fale com um consultor"
    const ctaLinks = (bodyOnly.match(/\]\((\/cotacao|\/protecao-veicular)\b/gi) ?? []).length;
    const ctaPhrases = (bodyOnly.match(/\b(fale com um consultor|faca uma cotacao|fa[çc]a uma cota[çc][ãa]o|conhe[çc]a os planos)\b/gi) ?? []).length;
    const totalCTAs = ctaLinks + Math.min(ctaPhrases, 2); // limita peso de frases pra nao dar match em qualquer menção
    if (totalCTAs < 3) {
      hardMatches.push({ pattern: `CTAs=${totalCTAs}`, reason: `artigo precisa de pelo menos 3 CTAs (achei ${totalCTAs})` });
    }

    // 2.3 — 3+ links internos (qualquer URL relativa do site)
    const internalLinks = Array.from(bodyOnly.matchAll(/\]\((\/[^)]+)\)/g)).map((m) => m[1]!);
    const hasProtecao = internalLinks.some((u) => u.startsWith('/protecao-veicular'));
    const hasCotacao = internalLinks.some((u) => u.startsWith('/cotacao'));
    const hasFaq = internalLinks.some((u) => u.startsWith('/faq'));
    if (internalLinks.length < 3) {
      hardMatches.push({ pattern: `internalLinks=${internalLinks.length}`, reason: `precisa de 3+ links internos (achei ${internalLinks.length})` });
    }
    if (!hasProtecao) {
      hardMatches.push({ pattern: 'missing-link-/protecao-veicular', reason: 'link obrigatorio pra /protecao-veicular ausente' });
    }
    if (!hasCotacao) {
      hardMatches.push({ pattern: 'missing-link-/cotacao', reason: 'link obrigatorio pra /cotacao ausente' });
    }
    // /faq e obrigatorio mas as vezes pode ficar fora (warn, nao block)
    if (!hasFaq) {
      log.warn({ articleId: a.id }, 'aviso: link pra /faq ausente (recomendado)');
    }

    // 2.4 — Keywords frontmatter NAO duplica o title
    const fmMatch = /^---\n([\s\S]+?)\n---/.exec(mdx);
    if (fmMatch) {
      const fm = fmMatch[1] ?? '';
      const titleMatch = /title:\s*['"]?(.+?)['"]?\s*$/m.exec(fm);
      const kwSection = /keywords:\s*([\s\S]+?)(?:\n[a-z]+:|$)/i.exec(fm);
      if (titleMatch && kwSection) {
        const title = titleMatch[1]!.trim().toLowerCase();
        const kwYaml = kwSection[1]!.toLowerCase();
        // Se as keywords contêm o título inteiro como item, fail
        if (kwYaml.includes(title.replace(/['"]/g, ''))) {
          hardMatches.push({
            pattern: 'keywords-equals-title',
            reason: 'campo keywords do frontmatter nao pode duplicar o title — use termos curtos separados',
          });
        }
      }
    }

    if (hardMatches.length > 0) {
      const notes = 'REPROVADO no hard-block + guards: ' + hardMatches.map((m) => `${m.reason} (${m.pattern})`).join('; ');
      log.warn({ articleId: a.id, matches: hardMatches, wordCount, totalCTAs, internalLinks: internalLinks.length }, 'hard-block disparou');
      if (!ctx.dry_run) {
        await updateArticle(a.id, { review_status: 'REPROVADO', review_notes: notes, status: 'in_review' });
      }
      return { output: { review_status: 'REPROVADO', review_notes: notes, hard_block_matches: hardMatches, llm_cost_usd: null } };
    }

    // ===== 2) LLM judge =====
    const userMsg = `Titulo: ${a.title}
Categoria: ${a.category ?? '?'}
URL futura: ${a.url}

Conteudo do artigo (Markdown):
"""
${mdx.slice(0, 12000)}
"""

Avalie e retorne JSON conforme as instrucoes do sistema.`;

    const r = await complete({
      tier: 'main',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 1500,
      temperature: 0.2,
      timeout_ms: 120_000,
    });

    interface LlmReview {
      decision: ReviewStatus;
      notes: string;
      specific_fixes?: string[];
    }
    let review: LlmReview;
    try {
      const cleaned = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      review = JSON.parse(cleaned);
    } catch (e) {
      log.error({ err: (e as Error).message, text: r.text.slice(0, 200) }, 'LLM retornou JSON invalido');
      throw new Error(`LegalReviewer JSON invalido: ${(e as Error).message}`);
    }
    if (!['APROVADO', 'APROVADO_COM_AJUSTES', 'REPROVADO'].includes(review.decision)) {
      throw new Error(`LegalReviewer decision invalida: ${review.decision}`);
    }

    const fullNotes = review.notes + (review.specific_fixes?.length ? '\nAjustes:\n- ' + review.specific_fixes.join('\n- ') : '');

    log.info({ articleId: a.id, decision: review.decision, cost: r.cost_usd }, 'review LLM ok');
    if (!ctx.dry_run) {
      await updateArticle(a.id, { review_status: review.decision, review_notes: fullNotes, status: 'in_review' });
    }

    return {
      output: {
        review_status: review.decision,
        review_notes: fullNotes,
        hard_block_matches: [],
        llm_cost_usd: r.cost_usd,
      },
    };
  },
};

