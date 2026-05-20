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
import { commitFile } from '../integrations/github.js';
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
      log.info({ articleId: a.id }, 'DRY-RUN — nao commita');
      return { output: { pr_opened: false, reason: 'dry_run' } };
    }

    // ===== Commit DIRETO na master (decisao user 2026-05-20: sem PR/revisao humana) =====
    const targetPath = `${TARGET_DIR}/${a.slug}.mdx`;

    try {
      // Commita direto no branch base (master) — sem branch separada, sem PR.
      const commitResult = await commitFile({
        path: targetPath,
        content: mdx,
        message: `feat(blog): ${a.title}\n\nGerado pela esteira SEO automatica.\nArticle: ${a.id}\nSlug: ${a.slug}\nCategoria: ${a.category ?? '?'}\nPalavras: ${a.word_count ?? '?'}`,
        branch: config.GITHUB_BRANCH_BASE,
      });

      // Salva versao + atualiza article direto pra 'published'
      // (cron de 15min vai verificar URL live e disparar Agentes 10-12 de indexacao)
      await saveVersion(a.id, 1, mdx, 'agent:09-publisher', `commit direto na master ${commitResult.commit_sha.slice(0, 7)}`);
      await updateArticle(a.id, {
        status: 'awaiting_pr_merge', // mantem awaiting_pr_merge pra cron detectar URL live e disparar indexacao
        mdx_path: targetPath,
        mdx_sha: commitResult.blob_sha,
        pr_url: commitResult.html_url, // url do arquivo no GitHub
        pr_branch: config.GITHUB_BRANCH_BASE,
      });

      log.info({
        articleId: a.id, commit_sha: commitResult.commit_sha.slice(0, 7), branch: config.GITHUB_BRANCH_BASE,
      }, 'commit DIRETO na master — sem PR (modo auto-publish)');

      // Dispara rebuild EasyPanel via SSH (best-effort — se SSH falha, ignora; cron de recheck pega depois)
      void triggerEasyPanelRebuild().catch((e) => {
        log.warn({ err: (e as Error).message }, 'rebuild EasyPanel via SSH falhou (nao bloqueante)');
      });

      return {
        output: {
          pr_opened: true, // mantem nome do campo por compat; significa "publicacao iniciada"
          pr_url: commitResult.html_url,
          pr_branch: config.GITHUB_BRANCH_BASE,
          commit_sha: commitResult.commit_sha,
        },
      };
    } catch (e) {
      const msg = (e as Error).message;
      log.error({ err: msg, articleId: a.id }, 'falha ao commitar na master');
      return { output: { pr_opened: false, reason: `github falhou: ${msg}` } };
    }
  },
};

/**
 * Dispara rebuild do site no EasyPanel via SSH + docker.
 * Best-effort: se falhar, cron de 15 em 15 minutos retenta detectar URL live e disparar 10-12.
 *
 * Requer chave SSH em ~/.ssh/claude_21go autorizada em root@167.71.31.77.
 * Executa: 1) git pull no /etc/easypanel/projects/social-21go/site/code
 *          2) docker buildx build (multi-stage)
 *          3) docker service update --force --image easypanel/social-21go/site:latest social-21go_site
 */
async function triggerEasyPanelRebuild(): Promise<void> {
  const { spawn } = await import('child_process');
  const sshKey = process.env.EASYPANEL_SSH_KEY ?? 'C:/Users/damas/.ssh/claude_21go';
  const sshHost = process.env.EASYPANEL_HOST ?? 'root@167.71.31.77';
  const remoteCmd = `cd /etc/easypanel/projects/social-21go/site/code && git pull origin master && cd 21go-website && docker buildx build -t easypanel/social-21go/site:latest --load . && docker service update --force --image easypanel/social-21go/site:latest social-21go_site`;

  log.info({ host: sshHost }, 'disparando rebuild EasyPanel via SSH (background)');

  // Dispara sem aguardar (fire-and-forget — vai demorar 5-10min)
  const child = spawn('ssh', [
    '-i', sshKey,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=10',
    sshHost,
    remoteCmd,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  log.info({ pid: child.pid }, 'SSH rebuild disparado em background');
}

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
