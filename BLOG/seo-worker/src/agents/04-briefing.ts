/**
 * Agente 04 — Briefing
 *
 * Entrada: TopicRow aprovado.
 * Saida: BriefingRow com estrutura completa para o Writer (Agente 05).
 *
 * O briefing contem:
 *   - SEO title + H1
 *   - Outline H2/H3 com notas do que cada secao precisa cobrir
 *   - FAQs (pergunta + resposta curta)
 *   - Internal links sugeridos (com anchor + url)
 *   - Notas comerciais e juridicas (frases proibidas, cuidados de tom)
 *   - Sugestoes de exemplos praticos
 *   - Sugestao de imagem destacada
 */
import type { Agent } from './_types.js';
import type { TopicRow } from '../db/repositories/topics.js';
import { insertBriefing, type BriefingRow } from '../db/repositories/articles.js';
import { complete } from '../integrations/llm.js';
import { SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:04-briefing');

interface Input {
  topic: TopicRow;
}

interface Output {
  briefing_id: string | null;
  briefing: BriefingRow | null;
  llm_cost_usd: number | null;
}

const SYSTEM_PROMPT = `Voce e o Editor-Chefe do blog da 21Go (associacao de protecao patrimonial veicular do Rio, 20+ anos).

${SCOPE_RULES_TEXT}

OBJETIVO: dado um topico aprovado, montar um briefing COMPLETO em JSON valido (sem markdown, sem texto extra).

O briefing deve:
1. Ter title SEO claro (60-65 chars), nao clickbait.
2. Ter H1 ligeiramente diferente do title (mais natural pra leitor).
3. Outline com 4-6 H2, cada um com 0-3 H3 e notas curtas do que cobrir.
4. FAQs de 3-5 perguntas reais com respostas curtas (max 2 linhas).
5. Sugestoes de 2-3 links internos (anchor + url) priorizando pagina pilar.
6. Notas comerciais/juridicas: o que NAO falar (cobertura garantida, indenizacao garantida, igual seguro etc).
7. Sugestoes de 1-2 exemplos praticos concretos.
8. Sugestao de imagem destacada (descricao textual, sem prompt de IA).

PAGINAS PILAR DA 21GO:
- /protecao-veicular (planos e funcionamento)
- /cotacao (simulacao gratuita)
- /faq (perguntas frequentes)
- /indique (programa de indicacao)
- /blog (hub do blog)

NUNCA inventar regras especificas, valores, prazos ou coberturas. Em duvida: "fale com um consultor".`;

interface LlmBriefing {
  seo_title: string;
  h1: string;
  outline: Array<{ h2: string; h3?: string[]; notes?: string }>;
  faqs: Array<{ q: string; a: string }>;
  internal_links: Array<{ anchor: string; url: string }>;
  legal_notes: string;
  example_suggestions: string;
  image_suggestion: string;
}

export const agent04: Agent<Input, Output> = {
  id: '04-briefing',
  description: 'Cria briefing detalhado para o Writer a partir de um topic aprovado',
  async run(input, ctx) {
    const t = input.topic;

    const userMsg = `Topico aprovado:

Titulo proposto: ${t.title}
Categoria: ${t.category}
Intencao: ${t.intent ?? 'desconhecida'}
Audiencia: ${t.audience ?? '(nao informada)'}
Dor: ${t.pain_point ?? '(nao informada)'}
Pagina pilar relacionada: ${t.pillar_page ?? '/protecao-veicular'}
Palavras-chave secundarias: ${(t.secondary_keywords ?? []).join(', ') || '(nenhuma)'}

Gere o briefing COMPLETO em JSON (sem markdown):
{
  "seo_title": "string 60-65 chars",
  "h1": "string",
  "outline": [
    { "h2": "string", "h3": ["string", ...], "notes": "string com o que cobrir" },
    ...
  ],
  "faqs": [{ "q": "string", "a": "string max 2 linhas" }, ...],
  "internal_links": [{ "anchor": "string", "url": "/cotacao" }, ...],
  "legal_notes": "string com cuidados comerciais/juridicos",
  "example_suggestions": "string com 1-2 exemplos praticos concretos",
  "image_suggestion": "string descrevendo a imagem destacada"
}`;

    let llmCost: number | null = null;
    let briefing: LlmBriefing;
    try {
      const r = await complete({
        tier: 'main',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
        max_tokens: 2500,
        temperature: 0.4,
      });
      llmCost = r.cost_usd;
      briefing = parseJson(r.text);
    } catch (e) {
      log.error({ err: (e as Error).message, topic: t.id }, 'briefing LLM falhou');
      throw e;
    }

    if (ctx.dry_run) {
      log.info({ topic: t.id, title: briefing.seo_title }, 'DRY-RUN — briefing nao gravado');
      return { output: { briefing_id: null, briefing: null, llm_cost_usd: llmCost } };
    }

    const row = await insertBriefing({
      topic_id: t.id,
      seo_title: briefing.seo_title,
      h1: briefing.h1,
      outline: briefing.outline,
      faqs: briefing.faqs,
      internal_links: briefing.internal_links,
      legal_notes: briefing.legal_notes,
      example_suggestions: briefing.example_suggestions,
      image_suggestion: briefing.image_suggestion,
      is_update_of: t.target_article_id,
      llm_model_used: 'anthropic:main',
    });

    log.info({ briefing_id: row.id, topic: t.id }, 'briefing criado');
    return { output: { briefing_id: row.id, briefing: row, llm_cost_usd: llmCost } };
  },
};

function parseJson(text: string): LlmBriefing {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const parsed = JSON.parse(cleaned) as Partial<LlmBriefing>;
  if (!parsed.seo_title || !parsed.h1) throw new Error('briefing JSON sem seo_title ou h1');
  return {
    seo_title: parsed.seo_title,
    h1: parsed.h1,
    outline: parsed.outline ?? [],
    faqs: parsed.faqs ?? [],
    internal_links: parsed.internal_links ?? [],
    legal_notes: parsed.legal_notes ?? '',
    example_suggestions: parsed.example_suggestions ?? '',
    image_suggestion: parsed.image_suggestion ?? '',
  };
}
