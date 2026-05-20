/**
 * Agente 09 — Publisher (branch + PR, sem auto-merge)
 *
 * Fluxo:
 *   1. Pega sha do branch base (GITHUB_BRANCH_BASE, ex: master)
 *   2. Cria branch nova `seo/publish-{slug}-{timestamp}` a partir desse sha
 *   3. Commita o MDX em `21go-website/content/blog/{slug}.mdx` NA BRANCH NOVA
 *   4. Abre Pull Request da branch nova para o branch base
 *   5. Article.status = 'awaiting_pr_merge' + pr_url + pr_branch
 *
 * NAO mergea — humano aprova o PR no GitHub.
 *
 * Apos o merge humano + rebuild EasyPanel, o cron de 15 em 15 minutos de recheck
 * (publish.worker.ts handlePublishJob mode='recheck-pending-indexing')
 * varre artigos em 'awaiting_pr_merge' e verifica se a URL ja esta live;
 * se sim, marca como 'published' e dispara Agentes 10-12.
 *
 * Pre-condicoes (hard):
 *   - article.status in ('draft', 'in_review')
 *   - article.review_status in (null, 'APROVADO', 'APROVADO_COM_AJUSTES')
 *   - AUTO_PUBLISH_ENABLED=true OU skip_human_review=true (override manual)
 *   - GITHUB_TOKEN e GITHUB_REPO configurados
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { updateArticle, saveVersion } from '../db/repositories/articles.js';
import { commitFile, getBranchSha, createBranch, createPullRequest } from '../integrations/github.js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('agent:09-publisher');

interface Input {
  article: ArticleRow;
  skip_human_review?: boolean;
}

interface Output {
  pr_opened: boolean;
  reason?: string;
  pr_number?: number;
  pr_url?: string;
  pr_branch?: string;
  commit_sha?: string;
}

const TARGET_DIR = '21go-website/content/blog';

export const agent09: Agent<Input, Output> = {
  id: '09-publisher',
  description: 'Cria branch + commit + PR (sem auto-merge). Humano aprova no GitHub.',
  async run(input, ctx) {
    const a = input.article;
    const skip = !!input.skip_human_review;

    // ===== Pre-checks =====
    if (a.status !== 'in_review' && a.status !== 'draft') {
      return { output: { pr_opened: false, reason: `status=${a.status} (esperado draft|in_review)` } };
    }
    if (a.review_status === 'REPROVADO') {
      return { output: { pr_opened: false, reason: 'review_status=REPROVADO — Reviewer 06 vetou' } };
    }
    if (!config.AUTO_PUBLISH_ENABLED && !skip) {
      return {
        output: {
          pr_opened: false,
          reason: 'AUTO_PUBLISH_ENABLED=false (primeiros 30 dias). Use skip_human_review=true em /runs/publish.',
        },
      };
    }
    if (!a.mdx_path) return { output: { pr_opened: false, reason: 'article sem mdx_path' } };
    if (!config.GITHUB_TOKEN || !config.GITHUB_REPO) {
      return { output: { pr_opened: false, reason: 'Pendente de credencial: GITHUB_TOKEN/GITHUB_REPO' } };
    }

    // ===== Le MDX local =====
    const repoRoot = await findRepoRoot();
    const localPath = path.join(repoRoot, a.mdx_path);
    let mdx: string;
    try {
      mdx = await fs.readFile(localPath, 'utf8');
    } catch (e) {
      return { output: { pr_opened: false, reason: `nao leu MDX local: ${(e as Error).message}` } };
    }

    if (ctx.dry_run) {
      log.info({ articleId: a.id }, 'DRY-RUN — nao abre PR');
      return { output: { pr_opened: false, reason: 'dry_run' } };
    }

    // ===== Branch + commit + PR =====
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = `seo/publish-${a.slug}-${ts}`;
    const targetPath = `${TARGET_DIR}/${a.slug}.mdx`;

    try {
      // 1. Sha do base
      const baseSha = await getBranchSha(config.GITHUB_BRANCH_BASE);
      log.info({ base: config.GITHUB_BRANCH_BASE, sha: baseSha.slice(0, 7) }, 'sha do base');

      // 2. Cria branch nova
      await createBranch(branchName, baseSha);

      // 3. Commita MDX na branch nova
      const commitResult = await commitFile({
        path: targetPath,
        content: mdx,
        message: `feat(blog): publica "${a.title}"\n\nGerado pela esteira SEO (Agente 09 Publisher).\nArticle: ${a.id}\nSlug: ${a.slug}`,
        branch: branchName,
      });

      // 4. Abre PR
      const pr = await createPullRequest({
        head: branchName,
        base: config.GITHUB_BRANCH_BASE,
        title: `[blog] ${a.title}`,
        body: [
          `## Novo artigo do blog gerado pela esteira SEO`,
          ``,
          `- **Slug:** \`${a.slug}\``,
          `- **Categoria:** ${a.category ?? '(nao informada)'}`,
          `- **Palavra-chave principal:** ${a.main_keyword ?? '(nao informada)'}`,
          `- **Word count:** ${a.word_count ?? '?'} (~${a.read_time_min ?? '?'} min leitura)`,
          `- **Review status:** ${a.review_status ?? '(sem review)'}`,
          ``,
          `**URL futura:** ${a.url}`,
          ``,
          `**Article ID:** \`${a.id}\` (super-banco \`seo.articles\`)`,
          ``,
          `### Como aprovar`,
          `1. Revise o MDX neste PR`,
          `2. Se OK, mergeia (Squash recomendado)`,
          `3. EasyPanel rebuilda o site automaticamente`,
          `4. Apos rebuild, o cron de 15 em 15 minutos do seo-worker detecta a URL live, marca status='published' e dispara Agentes 10-12 (sitemap + Google + Bing + IndexNow)`,
          ``,
          `### Como rejeitar`,
          `Fecha o PR sem merge. O article fica em \`awaiting_pr_merge\` indefinidamente — pode ser arquivado depois via SQL.`,
        ].join('\n'),
      });

      // 5. Salva versao + atualiza article
      await saveVersion(a.id, 1, mdx, 'agent:09-publisher', `PR #${pr.number} aberto`);
      await updateArticle(a.id, {
        status: 'awaiting_pr_merge',
        mdx_path: targetPath,
        mdx_sha: commitResult.blob_sha,
        pr_url: pr.html_url,
        pr_branch: branchName,
      });

      log.info({
        articleId: a.id, pr: pr.number, url: pr.html_url, branch: branchName,
      }, 'PR aberto — aguardando merge humano');

      return {
        output: {
          pr_opened: true,
          pr_number: pr.number,
          pr_url: pr.html_url,
          pr_branch: branchName,
          commit_sha: commitResult.commit_sha,
        },
      };
    } catch (e) {
      const msg = (e as Error).message;
      log.error({ err: msg, articleId: a.id }, 'falha ao abrir PR');
      return { output: { pr_opened: false, reason: `github falhou: ${msg}` } };
    }
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
