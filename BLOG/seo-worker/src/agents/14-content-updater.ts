/**
 * Agente 14 — Content Updater
 *
 * Aplica recomendacoes abertas em artigos JA publicados:
 *  - improve_ctr / update_title / update_meta_description
 *      -> reescreve title + meta description (frontmatter)
 *  - refresh_content
 *      -> pauta duplicada (Agente 02 decidiu ATUALIZAR_ARTIGO_EXISTENTE): em vez de
 *         publicar um artigo novo canibal, injeta o angulo novo como secao no artigo
 *         que ja ranqueia e marca last_updated.
 *
 * Fonte da verdade e seo.articles.mdx_content (NAO o filesystem — worker e site
 * rodam em containers separados; a versao antiga lia com fs.readFile e falhava
 * com ENOENT em 100% das execucoes).
 *
 * Ao final enfileira o Publisher (09), que commita o MDX atualizado na master.
 */
import type { Agent } from './_types.js';
import { query, exec } from '../db/pg.js';
import { updateArticle, saveVersion, getById } from '../db/repositories/articles.js';
import { parseMdx, buildMdx, type ArticleFrontmatter } from '../lib/mdx.js';
import { enforceWriterRules } from '../lib/enforce-writer-rules.js';
import { complete } from '../integrations/llm.js';
import { SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { child } from '../lib/logger.js';

const log = child('agent:14-content-updater');

interface Input {
  /** Quantas recomendacoes processar nesta corrida. */
  limit?: number;
  /** Filtra por tipo (o write worker usa pra pegar so refresh_content no slot diario). */
  only_types?: string[];
}

interface Output {
  processed: number;
  applied: number;
  published_queued: number;
  errors: string[];
  total_cost_usd: number;
}

const TYPES_META = ['improve_ctr', 'update_title', 'update_meta_description'];
/**
 * `expand_content` cobre 2 origens (o CHECK do schema nao aceita tipo novo):
 *  - Agente 13 (GSC): artigo com impressao e sem clique, pede mais profundidade
 *  - Agente 02: pauta duplicada — o angulo novo vira secao aqui em vez de artigo canibal
 */
const TYPES_REFRESH = ['expand_content'];

const SYSTEM_PROMPT_TITLE = `Voce melhora titles e meta descriptions de artigos do blog da 21Go.
${SCOPE_RULES_TEXT}
Retorne JSON estrito: { "new_title": "...", "new_description": "..." }
- new_title: 55-65 chars, especifico, com a palavra-chave principal, sem clickbait
- new_description: 130-160 chars, escrita pro leitor decidir clicar, sem promessa de cobertura`;

const SYSTEM_PROMPT_REFRESH = `Voce atualiza artigos do blog da 21Go (associacao de protecao patrimonial veicular do Rio, 20+ anos).

${SCOPE_RULES_TEXT}

Chegou uma pauta NOVA que e proxima demais de um artigo que ja existe. Em vez de publicar
um artigo duplicado (canibalizacao), voce vai ENRIQUECER o artigo existente com o angulo novo.

REGRAS HARD:
- Escreva UMA secao nova, 180-260 palavras, no padrao Atomic Answer:
  "## {pergunta real do leitor}" + resposta direta de 40-60 palavras + aprofundamento.
- A secao precisa trazer informacao que o artigo AINDA NAO TEM. Se o angulo novo ja estiver
  coberto, responda com "skip": true e explique.
- NUNCA prometa cobertura/indenizacao/garantia. NUNCA diga que e "igual seguro".
- NUNCA mencione caminhao, carreta, onibus, carga.
- Pode citar dado com fonte real no formato "segundo {fonte}".
- Nao repita CTA (o artigo ja tem).

Retorne JSON estrito:
{
  "skip": boolean,
  "reason": "1 frase",
  "new_section_markdown": "## Pergunta...\\n\\nResposta...",
  "new_title": "opcional — so se o titulo atual ficou pior que o angulo novo",
  "new_description": "opcional — meta description 130-160 chars"
}`;

interface RecJoined {
  id: string;
  type: string;
  article_id: string;
  recommendation: string;
  reason: string;
  data: { url?: string; angle?: string; new_keyword?: string; topic_id?: string };
  art_slug: string;
  art_status: string;
}

export const agent14: Agent<Input, Output> = {
  id: '14-content-updater',
  description: 'Aplica recomendacoes (title/meta/refresh) no artigo existente e republica',
  async run(input, ctx) {
    const limit = input.limit ?? 3;
    const types = input.only_types ?? [...TYPES_META, ...TYPES_REFRESH];

    const recs = await query<RecJoined>(
      `SELECT r.id, r.type, r.article_id, r.data, r.recommendation, r.reason,
              a.slug AS art_slug, a.status AS art_status
       FROM seo.recommendations r
       JOIN seo.articles a ON a.id = r.article_id
       WHERE r.status='open'
         AND r.type = ANY($1)
       ORDER BY r.priority DESC, r.created_at ASC
       LIMIT $2`,
      [types, limit],
    );

    const errors: string[] = [];
    let applied = 0;
    let publishedQueued = 0;
    let totalCost = 0;

    for (const rec of recs) {
      try {
        const article = await getById(rec.article_id);
        if (!article) throw new Error('article nao encontrado');
        if (!article.mdx_content) throw new Error('article sem mdx_content (gerado antes da persistencia em banco)');

        const parsed = parseMdx(article.mdx_content);
        const isRefresh = TYPES_REFRESH.includes(rec.type);

        let newContent = parsed.content;
        let newTitle = parsed.data.title ?? article.title;
        let newDescription = parsed.data.description ?? article.meta_description ?? '';

        if (isRefresh) {
          const r = await complete({
            tier: 'main',
            system: SYSTEM_PROMPT_REFRESH,
            messages: [{
              role: 'user',
              content: `Artigo atual (title): ${parsed.data.title}
Palavra-chave principal do artigo: ${article.main_keyword ?? '(nao informada)'}

Angulo NOVO que precisa ser absorvido: "${rec.data.angle ?? rec.data.new_keyword ?? rec.recommendation}"
Palavra-chave da pauta nova: ${rec.data.new_keyword ?? '(nao informada)'}
Motivo da recomendacao: ${rec.reason}

Conteudo atual do artigo:
"""
${parsed.content.slice(0, 9000)}
"""

Retorne JSON conforme as instrucoes do sistema.`,
            }],
            max_tokens: 1200,
            temperature: 0.5,
            timeout_ms: 150_000,
          });
          totalCost += r.cost_usd ?? 0;

          const sug = parseJsonLoose(r.text) as {
            skip?: boolean; reason?: string; new_section_markdown?: string;
            new_title?: string; new_description?: string;
          };

          if (sug.skip || !sug.new_section_markdown) {
            log.info({ recId: rec.id, reason: sug.reason }, 'refresh dispensado — angulo ja coberto');
            if (!ctx.dry_run) {
              await exec(
                `UPDATE seo.recommendations SET status='dismissed', applied_at=now(), data = data || $2::jsonb WHERE id=$1`,
                [rec.id, JSON.stringify({ dismiss_reason: sug.reason ?? 'angulo ja coberto' })],
              );
            }
            continue;
          }

          // Injeta a secao ANTES de "## Em resumo" (ou no fim, se nao existir)
          newContent = insertSection(parsed.content, sug.new_section_markdown.trim());
          if (sug.new_title) newTitle = sug.new_title;
          if (sug.new_description) newDescription = sug.new_description;
        } else {
          const r = await complete({
            tier: 'main',
            system: SYSTEM_PROMPT_TITLE,
            messages: [{
              role: 'user',
              content: `Title atual: ${parsed.data.title}
Description atual: ${parsed.data.description ?? '(vazio)'}
Palavra-chave principal: ${article.main_keyword ?? '(nao informada)'}
URL: ${rec.data.url ?? article.url}
Motivo da recomendacao: ${rec.type}

Retorne JSON com new_title e new_description.`,
            }],
            max_tokens: 500,
            temperature: 0.4,
          });
          totalCost += r.cost_usd ?? 0;
          const sug = parseJsonLoose(r.text) as { new_title?: string; new_description?: string };
          if (!sug.new_title) throw new Error('LLM sem new_title');
          newTitle = sug.new_title;
          if (sug.new_description) newDescription = sug.new_description;
        }

        const today = new Date().toISOString().slice(0, 10);
        const fm: ArticleFrontmatter = {
          title: newTitle,
          description: newDescription,
          date: parsed.data.date ?? today,
          author: parsed.data.author ?? '21Go',
          category: parsed.data.category ?? 'Geral',
          keywords: parsed.data.keywords ?? [],
          image: parsed.data.image ?? '/blog/default.jpg',
          last_updated: today,
        };

        if (ctx.dry_run) {
          log.info({ articleId: rec.article_id, type: rec.type, new_title: newTitle }, 'DRY-RUN — nao grava');
          continue;
        }

        const newMdx = enforceWriterRules(buildMdx(fm, newContent)).mdx;

        // Versiona o conteudo ANTERIOR antes de sobrescrever
        const versions = await query<{ version: number }>(
          `SELECT version FROM seo.article_versions WHERE article_id=$1`,
          [rec.article_id],
        );
        const nextVersion = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
        await saveVersion(rec.article_id, nextVersion, article.mdx_content, 'agent:14-content-updater', `update: ${rec.type}`);

        const wordCount = newContent.split(/\s+/).filter(Boolean).length;
        await updateArticle(rec.article_id, {
          title: newTitle,
          meta_title: newTitle,
          meta_description: newDescription,
          mdx_content: newMdx,
          word_count: wordCount,
          read_time_min: Math.max(1, Math.ceil(wordCount / 220)),
          // volta pra in_review pra passar pelo pre-check do Publisher e re-commitar
          status: 'in_review',
        });

        await exec(
          `UPDATE seo.recommendations SET status='applied', applied_at=now() WHERE id=$1`,
          [rec.id],
        );
        applied++;

        // Republica: Publisher commita o MDX atualizado na master
        try {
          const { queuePublish } = await import('../queue.js');
          await queuePublish.add('manual-publish', {
            article_id: rec.article_id,
            skip_human_review: true,
            triggered_by: 'agent:14',
          });
          publishedQueued++;
        } catch (e) {
          errors.push(`publish enqueue ${rec.article_id}: ${(e as Error).message}`);
        }

        log.info({ articleId: rec.article_id, recId: rec.id, type: rec.type, slug: rec.art_slug, new_title: newTitle }, 'update aplicado + republicacao enfileirada');
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`rec ${rec.id}: ${msg}`);
        log.warn({ err: msg, recId: rec.id }, 'falha ao aplicar recomendacao');
      }
    }

    return {
      output: {
        processed: recs.length,
        applied,
        published_queued: publishedQueued,
        errors,
        total_cost_usd: Number(totalCost.toFixed(6)),
      },
    };
  },
};

/** Insere a secao nova antes de "## Em resumo" / "## Perguntas frequentes" / "## Fontes". */
function insertSection(body: string, section: string): string {
  const anchors = ['## Em resumo', '## Perguntas frequentes', '## Fontes consultadas'];
  for (const a of anchors) {
    const idx = body.indexOf(a);
    if (idx > 0) {
      return body.slice(0, idx).trimEnd() + '\n\n' + section + '\n\n' + body.slice(idx);
    }
  }
  return body.trimEnd() + '\n\n' + section + '\n';
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  return JSON.parse(cleaned);
}
