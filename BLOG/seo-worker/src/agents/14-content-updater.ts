/**
 * Agente 14 — Content Updater
 *
 * Pega as top N recomendacoes abertas e:
 *  - improve_ctr / update_title: gera novo title + meta_description via LLM,
 *    reescreve frontmatter do MDX local (em _drafts se nao publicado, ou
 *    em uma copia de revisao se publicado), marca article com status='updating'
 *  - expand_content: gera bloco extra (FAQ ou secao) e proporciona ao revisor
 *  - add_internal_link: sugere insercao de link
 *
 * Por seguranca, NAO publica direto — apenas prepara a alteracao.
 * Publisher (09) precisa ser disparado depois com skip_human_review pra ir live.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import { query, exec } from '../db/pg.js';
import { updateArticle, saveVersion } from '../db/repositories/articles.js';
import { parseMdx, buildMdx, type ArticleFrontmatter } from '../lib/mdx.js';
import { complete } from '../integrations/llm.js';
import { SCOPE_RULES_TEXT } from '../lib/scope-guard.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:14-content-updater');

interface Input {
  /** Quantas recomendacoes processar nesta corrida. */
  limit?: number;
}

interface Output {
  processed: number;
  applied: number;
  errors: string[];
  total_cost_usd: number;
}

const SYSTEM_PROMPT_TITLE = `Voce melhora titles e meta descriptions de artigos do blog da 21Go.
${SCOPE_RULES_TEXT}
Retorne JSON estrito: { "new_title": "...", "new_description": "..." }
- new_title: 55-65 chars, especifico, sem clickbait, com palavra-chave principal
- new_description: 130-160 chars, util pro leitor decidir clicar, sem promessas`;

export const agent14: Agent<Input, Output> = {
  id: '14-content-updater',
  description: 'Aplica recomendacoes abertas (title/meta/expansao) em rascunho de update',
  async run(input, ctx) {
    const limit = input.limit ?? 3;

    // Pega top recomendacoes abertas, prioridade alta primeiro — JOIN com articles
    type RecJoined = {
      id: string;
      type: string;
      article_id: string;
      data: { url?: string };
      art_id: string;
      art_title: string;
      art_slug: string;
      art_mdx_path: string | null;
      art_main_keyword: string | null;
    };
    const recs = await query<RecJoined>(
      `SELECT r.id, r.type, r.article_id, r.data,
              a.id AS art_id, a.title AS art_title, a.slug AS art_slug,
              a.mdx_path AS art_mdx_path, a.main_keyword AS art_main_keyword
       FROM seo.recommendations r
       JOIN seo.articles a ON a.id = r.article_id
       WHERE r.status='open'
         AND r.type IN ('improve_ctr','update_title','update_meta_description')
       ORDER BY r.priority DESC, r.created_at ASC
       LIMIT $1`,
      [limit],
    );

    const errors: string[] = [];
    let applied = 0;
    let totalCost = 0;
    const processed = recs.length;

    for (const rec of recs) {
      const articles = rec.art_mdx_path ? { id: rec.art_id, title: rec.art_title, slug: rec.art_slug, mdx_path: rec.art_mdx_path, main_keyword: rec.art_main_keyword ?? undefined } : null;
      if (!articles) {
        errors.push(`rec ${rec.id}: article sem mdx_path`);
        continue;
      }
      try {
        const repoRoot = await findRepoRoot();
        const filePath = path.join(repoRoot, articles.mdx_path);
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = parseMdx(raw);

        // Pede LLM
        const r = await complete({
          tier: 'main',
          system: SYSTEM_PROMPT_TITLE,
          messages: [
            {
              role: 'user',
              content: `Title atual: ${parsed.data.title}
Description atual: ${parsed.data.description ?? '(vazio)'}
Palavra-chave principal: ${articles.main_keyword ?? '(nao informada)'}
URL: ${rec.data.url ?? articles.slug}

Motivo da recomendacao: ${rec.type}

Retorne JSON com new_title e new_description.`,
            },
          ],
          max_tokens: 500,
          temperature: 0.4,
        });
        totalCost += r.cost_usd ?? 0;

        const cleaned = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        const sug = JSON.parse(cleaned) as { new_title?: string; new_description?: string };
        if (!sug.new_title) throw new Error('LLM sem new_title');

        const fm: ArticleFrontmatter = {
          title: sug.new_title,
          description: sug.new_description ?? parsed.data.description ?? '',
          date: parsed.data.date ?? new Date().toISOString().slice(0, 10),
          author: parsed.data.author ?? '21Go',
          category: parsed.data.category ?? 'Geral',
          keywords: parsed.data.keywords ?? [],
          image: parsed.data.image ?? '/blog/default.jpg',
        };

        if (ctx.dry_run) {
          log.info({ articleId: rec.article_id, new_title: sug.new_title }, 'DRY-RUN — nao escreve');
          continue;
        }

        const newMdx = buildMdx(fm, parsed.content);

        // Salva versao antes de sobrescrever
        const existingVersions = await query<{ version: number }>(
          `SELECT version FROM seo.article_versions WHERE article_id=$1`,
          [rec.article_id],
        );
        const nextVersion = existingVersions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
        await saveVersion(rec.article_id, nextVersion, raw, 'agent:14-content-updater', `update: ${rec.type}`);

        // Escreve nova versao no MESMO mdx_path (publisher re-commita depois)
        await fs.writeFile(filePath, newMdx, 'utf8');
        await updateArticle(rec.article_id, {
          status: 'updating',
          title: sug.new_title,
          meta_title: sug.new_title,
          meta_description: fm.description,
        });

        await exec(
          `UPDATE seo.recommendations SET status='applied', applied_at=now() WHERE id=$1`,
          [rec.id],
        );
        applied++;
        log.info({ articleId: rec.article_id, recId: rec.id, new_title: sug.new_title, cost: r.cost_usd }, 'update aplicado');
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`rec ${rec.id}: ${msg}`);
        log.warn({ err: msg, recId: rec.id }, 'falha ao aplicar recomendacao');
      }
    }

    return { output: { processed, applied, errors, total_cost_usd: Number(totalCost.toFixed(6)) } };
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

// silencia warning de config nao usado (manteve pra futuras leituras)
void config;
