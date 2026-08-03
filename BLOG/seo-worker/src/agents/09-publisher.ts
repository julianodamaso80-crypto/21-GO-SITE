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
    if (!config.GITHUB_TOKEN || !config.GITHUB_REPO) {
      return { output: { pr_opened: false, reason: 'Pendente de credencial: GITHUB_TOKEN/GITHUB_REPO' } };
    }

    // ===== Le MDX do banco (mdx_content) =====
    if (!a.mdx_content) {
      return { output: { pr_opened: false, reason: 'article sem mdx_content (Writer falhou ou article muito antigo)' } };
    }
    const mdx = a.mdx_content;

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

      // Sinaliza que ha commit novo pra publicar. O rebuild em si e feito por
      // /root/blog-autodeploy.sh (cron no droplet), que detecta commit em
      // 21go-website/ e reconstroi o servico social-21go_site.
      await notifyDeployHook(a.slug);

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
 * Avisa que ha conteudo novo pra publicar.
 *
 * A versao anterior chamava spawn('ssh', ...) com a chave privada do laptop do dev
 * ('C:/Users/damas/.ssh/claude_21go') hardcoded como default. O container nao tem
 * binario ssh, entao o spawn falhava com ENOENT — e como ENOENT chega pelo evento
 * 'error' do ChildProcess (nao pela promise), o .catch() nao pegava e o processo
 * inteiro morria. Na pratica: TODA publicacao derrubava o worker.
 *
 * Agora e só um webhook opcional, com erro contido. O rebuild de verdade fica com
 * /root/blog-autodeploy.sh (cron no droplet), que nao precisa de credencial dentro
 * do container e roda mesmo que este aviso falhe.
 */
async function notifyDeployHook(slug: string): Promise<void> {
  const hook = process.env.DEPLOY_WEBHOOK_URL;
  if (!hook) {
    log.info({ slug }, 'commit feito — rebuild fica com o cron blog-autodeploy do droplet');
    return;
  }
  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'blog-publish', slug }),
      signal: AbortSignal.timeout(15_000),
    });
    log.info({ slug, status: res.status }, 'deploy hook avisado');
  } catch (e) {
    log.warn({ err: (e as Error).message, slug }, 'deploy hook falhou (nao bloqueante)');
  }
}

