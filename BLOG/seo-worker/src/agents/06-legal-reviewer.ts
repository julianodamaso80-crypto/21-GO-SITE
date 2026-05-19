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
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import type { ArticleRow, ReviewStatus } from '../db/repositories/articles.js';
import { updateArticle } from '../db/repositories/articles.js';
import { complete } from '../integrations/anthropic.js';
import { checkScope, SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:06-legal-reviewer');

const FORBIDDEN_PHRASES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bcobertura garantida\b/i, reason: 'promessa de cobertura sem analise' },
  { pattern: /\bindeniza[cç][ãa]o garantida\b/i, reason: 'promessa de indenizacao' },
  { pattern: /\baprova[cç][ãa]o autom[aá]tica\b/i, reason: 'promessa de aprovacao sem analise' },
  { pattern: /\bcobre tudo\b/i, reason: 'absoluto sem ressalva' },
  { pattern: /\bprotege qualquer ve[ií]culo\b/i, reason: 'absoluto sem ressalva' },
  { pattern: /\bigual (a |ao |o |um )?seguro\b/i, reason: 'confusao com seguro tradicional' },
  { pattern: /\btipo (um )?seguro\b/i, reason: 'confusao com seguro tradicional' },
  { pattern: /\b[ée] seguro\b/i, reason: 'confusao com seguro tradicional' },
  { pattern: /\bsem (qualquer )?an[aá]lise\b/i, reason: 'promessa indevida' },
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
    if (!a.mdx_path) throw new Error('article sem mdx_path — nao tem o que revisar');

    // Le arquivo
    const repoRoot = await findRepoRoot();
    const filePath = path.join(repoRoot, a.mdx_path);
    let mdx: string;
    try {
      mdx = await fs.readFile(filePath, 'utf8');
    } catch (e) {
      throw new Error(`nao consegui ler ${filePath}: ${(e as Error).message}`);
    }

    // ===== 1) Hard-block regex =====
    const hardMatches: Array<{ pattern: string; reason: string }> = [];
    for (const f of FORBIDDEN_PHRASES) {
      if (f.pattern.test(mdx)) hardMatches.push({ pattern: f.pattern.source, reason: f.reason });
    }

    // Escopo
    const scope = checkScope(mdx);
    if (scope) hardMatches.push({ pattern: scope.matched, reason: scope.reason });

    if (hardMatches.length > 0) {
      const notes = 'REPROVADO no hard-block: ' + hardMatches.map((m) => `${m.reason} (${m.pattern})`).join('; ');
      log.warn({ articleId: a.id, matches: hardMatches }, 'hard-block disparou');
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

async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try { await fs.access(path.join(dir, '.git')); return dir; } catch { /* sobe */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
