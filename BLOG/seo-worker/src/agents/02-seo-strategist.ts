/**
 * Agente 02 — SEO Strategist
 *
 * Entrada: KeywordRow vinda do Agente 01.
 * Saida: TopicRow com decision (APROVAR_ARTIGO_NOVO | ATUALIZAR | VIRAR_SECAO | REJEITAR_REPETICAO | REJEITAR_FORA_DO_ESCOPO).
 *
 * Pipeline:
 *   1) Hard checks deterministicos (scope-guard, categoria valida)
 *   2) Anti-repetition check (Agente 03) — pode causar REJEITAR_POR_REPETICAO ou ATUALIZAR
 *   3) Sonnet avalia: faz sentido virar artigo? merece pagina pilar? gera title + intent + audience + pain_point
 *   4) Insere TopicRow com decisao final
 */
import type { Agent } from './_types.js';
import type { KeywordRow } from '../db/repositories/keywords.js';
import { insertTopic, type TopicDecision } from '../db/repositories/topics.js';
import { setStatus } from '../db/repositories/keywords.js';
import { agent03 } from './03-anti-repetition.js';
import { complete } from '../integrations/anthropic.js';
import { checkScope, SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:02-seo-strategist');

interface Input {
  keyword: KeywordRow;
}

interface Output {
  topic_id: string | null;
  decision: TopicDecision;
  reason: string;
  llm_cost_usd: number | null;
}

const PILLAR_PAGES: Record<string, string> = {
  carros: '/protecao-veicular',
  motos: '/protecao-veicular',
  frotas: '/protecao-veicular',
  educativo: '/faq',
};

const SYSTEM_PROMPT = `Voce e o Estrategista de SEO da 21Go (associacao de protecao patrimonial veicular do Rio, 20+ anos de mercado).

${SCOPE_RULES_TEXT}

REGRAS:
1. Avalie se a palavra-chave merece virar artigo no blog da 21Go.
2. Considere: intencao de busca real, potencial comercial, fortalecimento de pagina pilar.
3. NUNCA aprove pautas que so trocam cidade (ex: "protecao veicular no RJ", "protecao veicular em SP") — sao repetitivas.
4. NUNCA aprove pautas sobre caminhao, carreta, onibus, transporte de carga.
5. Se a palavra-chave for muito generica/competitiva mas o tema for util, sugira uma reformulacao que ataque uma dor especifica.
6. Saida estritamente em JSON valido (sem markdown, sem texto extra).`;

interface LlmDecision {
  approve: boolean;
  proposed_title: string;
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional' | 'unknown';
  audience: string;
  pain_point: string;
  reason: string;
}

export const agent02: Agent<Input, Output> = {
  id: '02-seo-strategist',
  description: 'Decide se uma keyword vira topic (artigo) e qual a abordagem',
  async run(input, ctx) {
    const k = input.keyword;

    // 1) Hard scope check
    const scopeViolation = checkScope(k.keyword);
    if (scopeViolation) {
      const reason = `fora de escopo (${scopeViolation.reason}: "${scopeViolation.matched}")`;
      log.info({ kw: k.keyword, reason }, 'rejeitado por escopo');
      if (!ctx.dry_run) await setStatus(k.id, 'out_of_scope', reason);
      return { output: { topic_id: null, decision: 'REJEITAR_FORA_DO_ESCOPO', reason, llm_cost_usd: null } };
    }

    // 2) Pergunta ao LLM se vale virar artigo + titulo proposto
    let llmDecision: LlmDecision;
    let llmCost: number | null = null;
    try {
      const r = await complete({
        tier: 'main',
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Palavra-chave: "${k.keyword}"
Categoria: ${k.category}
Volume mensal (Google BR): ${k.search_volume ?? 'desconhecido'}
Dificuldade (0-100): ${k.difficulty ?? 'desconhecida'}
CPC BRL: ${k.cpc_brl ?? 'desconhecido'}
Intencao reportada: ${k.intent ?? 'unknown'}

Avalie e retorne JSON:
{
  "approve": boolean,
  "proposed_title": "string com titulo SEO claro, especifico (60-65 chars)",
  "intent": "informational|commercial|navigational|transactional|unknown",
  "audience": "string descrevendo publico alvo concreto",
  "pain_point": "string descrevendo a dor real do leitor",
  "reason": "string com 1-2 frases justificando approve true/false"
}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      });
      llmCost = r.cost_usd;
      llmDecision = parseJson(r.text);
    } catch (e) {
      log.error({ err: (e as Error).message, kw: k.keyword }, 'LLM falhou');
      return {
        output: { topic_id: null, decision: 'PENDENTE', reason: `LLM erro: ${(e as Error).message}`, llm_cost_usd: null },
      };
    }

    if (!llmDecision.approve) {
      const reason = `LLM rejeitou: ${llmDecision.reason}`;
      log.info({ kw: k.keyword, reason }, 'rejeitado pelo LLM');
      if (!ctx.dry_run) await setStatus(k.id, 'rejected', reason);
      return { output: { topic_id: null, decision: 'REJEITAR_FORA_DO_ESCOPO', reason, llm_cost_usd: llmCost } };
    }

    // 3) Anti-repetition
    const antiRep = await agent03.run(
      { title: llmDecision.proposed_title, main_keyword: k.keyword, category: k.category, intent: llmDecision.intent },
      ctx,
    );

    let decision: TopicDecision;
    let reason: string;
    let targetArticleId: string | undefined;

    if (antiRep.output.slug_collision) {
      decision = 'ATUALIZAR_ARTIGO_EXISTENTE';
      reason = `slug ja existe: ${antiRep.output.slug_collision.slug}`;
      targetArticleId = antiRep.output.slug_collision.article_id;
    } else if (antiRep.output.cannibal_with) {
      const c = antiRep.output.cannibal_with;
      decision = 'ATUALIZAR_ARTIGO_EXISTENTE';
      reason = `canibal com "${c.title}" (similarity ${c.similarity.toFixed(3)})`;
      targetArticleId = c.article_id;
    } else if (antiRep.output.city_swap_risk) {
      decision = 'REJEITAR_POR_REPETICAO';
      reason = `padrao "{tema} em ${antiRep.output.city_detected}" — repetitivo`;
    } else {
      decision = 'APROVAR_ARTIGO_NOVO';
      reason = llmDecision.reason;
    }

    if (ctx.dry_run) {
      log.info({ kw: k.keyword, decision, reason }, 'DRY-RUN — nao gravado');
      return { output: { topic_id: null, decision, reason, llm_cost_usd: llmCost } };
    }

    // 4) Cria TopicRow
    const topic = await insertTopic({
      title: llmDecision.proposed_title,
      main_keyword_id: k.id,
      category: k.category,
      intent: llmDecision.intent,
      audience: llmDecision.audience,
      pain_point: llmDecision.pain_point,
      pillar_page: PILLAR_PAGES[k.category],
      anti_repetition_score: antiRep.output.anti_repetition_score,
      similar_articles: antiRep.output.similar_articles,
      decision,
      decision_reason: reason,
      target_article_id: targetArticleId,
    });

    // Marca a keyword como 'used' so se aprovou
    if (decision === 'APROVAR_ARTIGO_NOVO' || decision === 'ATUALIZAR_ARTIGO_EXISTENTE') {
      await setStatus(k.id, 'used');
    } else {
      await setStatus(k.id, 'rejected', reason);
    }

    return { output: { topic_id: topic.id, decision, reason, llm_cost_usd: llmCost } };
  },
};

function parseJson(text: string): LlmDecision {
  // Algumas vezes o LLM envolve em ```json — limpa antes.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const parsed = JSON.parse(cleaned) as Partial<LlmDecision>;
  if (typeof parsed.approve !== 'boolean') throw new Error('LLM JSON sem campo approve boolean');
  return {
    approve: parsed.approve,
    proposed_title: String(parsed.proposed_title ?? ''),
    intent: (parsed.intent ?? 'unknown') as LlmDecision['intent'],
    audience: String(parsed.audience ?? ''),
    pain_point: String(parsed.pain_point ?? ''),
    reason: String(parsed.reason ?? ''),
  };
}
