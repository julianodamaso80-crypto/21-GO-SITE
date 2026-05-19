/**
 * Agente 09 — Publisher
 *
 * Move MDX de _drafts/ pra content/blog/ via Octokit (commit no branch base do site).
 *
 * Pre-condicoes (hard):
 *   - article.status === 'in_review'
 *   - article.review_status === 'APROVADO' ou 'APROVADO_COM_AJUSTES'
 *   - AUTO_PUBLISH_ENABLED=true OU skip_human_review=true (override manual)
 *
 * Apos commit:
 *   - article.status = 'published'
 *   - article.published_at = now
 *   - article.mdx_path = 'content/blog/{slug}.mdx' (sem _drafts)
 *   - article.mdx_sha = blob_sha do GitHub
 *   - remove o arquivo local de _drafts/ (limpeza)
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { updateArticle, saveVersion } from '../db/repositories/articles.js';
import { commitFile } from '../integrations/github.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:09-publisher');

interface Input {
  article: ArticleRow;
  skip_human_review?: boolean;
}

interface Output {
  published: boolean;
  reason?: string;
  commit_sha?: string;
  blob_sha?: string;
  new_mdx_path?: string;
}

const TARGET_DIR = '21go-website/content/blog'; // sem _drafts/

export const agent09: Agent<Input, Output> = {
  id: '09-publisher',
  description: 'Publica rascunho aprovado: move MDX pra content/blog/ via Octokit + dispara rebuild',
  async run(input, ctx) {
    const a = input.article;
    const skip = !!input.skip_human_review;

    // ===== Pre-checks =====
    if (a.status !== 'in_review' && a.status !== 'draft') {
      return { output: { published: false, reason: `status=${a.status} (esperado in_review)` } };
    }
    if (a.review_status === 'REPROVADO') {
      return { output: { published: false, reason: 'review_status=REPROVADO' } };
    }
    if (!config.AUTO_PUBLISH_ENABLED && !skip) {
      return {
        output: {
          published: false,
          reason: 'AUTO_PUBLISH_ENABLED=false (primeiros 30 dias). Use skip_human_review:true via /runs/publish manual.',
        },
      };
    }
    if (!a.mdx_path) return { output: { published: false, reason: 'article sem mdx_path' } };
    if (!config.GITHUB_TOKEN || !config.GITHUB_REPO) {
      return { output: { published: false, reason: 'Pendente de credencial: GITHUB_TOKEN/GITHUB_REPO' } };
    }

    // ===== Le MDX local =====
    const repoRoot = await findRepoRoot();
    const localPath = path.join(repoRoot, a.mdx_path);
    let mdx: string;
    try {
      mdx = await fs.readFile(localPath, 'utf8');
    } catch (e) {
      return { output: { published: false, reason: `nao leu MDX local: ${(e as Error).message}` } };
    }

    const newPath = `${TARGET_DIR}/${a.slug}.mdx`;
    log.info({ from: a.mdx_path, to: newPath, articleId: a.id }, 'publicando');

    if (ctx.dry_run) {
      log.info('DRY-RUN — nao commita no github');
      return { output: { published: false, reason: 'dry_run' } };
    }

    // ===== Commit no GitHub =====
    let commitResult: { commit_sha: string; blob_sha: string; html_url: string };
    try {
      commitResult = await commitFile({
        path: newPath,
        content: mdx,
        message: `feat(blog): publica "${a.title}"\n\nGerado pelo seo-worker (Agente 09 Publisher).\nArticle: ${a.id}\nSlug: ${a.slug}`,
        branch: config.GITHUB_BRANCH_BASE,
      });
    } catch (e) {
      return { output: { published: false, reason: `github commit falhou: ${(e as Error).message}` } };
    }

    // ===== Atualiza article + versiona =====
    await saveVersion(a.id, 1, mdx, 'agent:09-publisher', `publicado em ${commitResult.commit_sha.slice(0, 7)}`);
    await updateArticle(a.id, {
      status: 'published',
      published_at: new Date().toISOString(),
      mdx_path: newPath,
      mdx_sha: commitResult.blob_sha,
    });

    // ===== Remove arquivo local de _drafts/ =====
    try {
      await fs.unlink(localPath);
      log.info({ localPath }, 'arquivo local de _drafts removido');
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'falha ao remover arquivo local — segue');
    }

    log.info({ articleId: a.id, commit: commitResult.commit_sha.slice(0, 7), slug: a.slug }, 'publicado');
    return {
      output: {
        published: true,
        commit_sha: commitResult.commit_sha,
        blob_sha: commitResult.blob_sha,
        new_mdx_path: newPath,
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
