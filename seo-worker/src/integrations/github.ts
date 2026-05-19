/**
 * Integracao GitHub via Octokit — usada pelo Publisher (Agente 09).
 *
 * Fluxo:
 *   1) Le SHA atual do arquivo (se existir)
 *   2) Commita conteudo novo direto no branch base (GITHUB_BRANCH_BASE) ou em branch separada
 *   3) Retorna o sha do blob criado pra rastrear em seo.articles.mdx_sha
 *
 * Erros (token invalido, sem permissao, etc) retornam tipo erro estruturado.
 */
import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('integrations:github');

let _client: Octokit | null = null;
function client(): Octokit {
  if (_client) return _client;
  if (!config.GITHUB_TOKEN) throw new Error('Pendente de credencial: GITHUB_TOKEN');
  if (!config.GITHUB_REPO) throw new Error('Pendente de credencial: GITHUB_REPO');
  _client = new Octokit({ auth: config.GITHUB_TOKEN, request: { timeout: 30000 } });
  return _client;
}

function parseRepo(): { owner: string; repo: string } {
  const parts = (config.GITHUB_REPO ?? '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`GITHUB_REPO invalido: "${config.GITHUB_REPO}" — esperado "owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export interface CommitFileInput {
  path: string;                          // ex: '21go-website/content/blog/meu-slug.mdx'
  content: string;                       // UTF-8
  message: string;                       // commit message
  branch?: string;                       // default: GITHUB_BRANCH_BASE
}

export interface CommitResult {
  commit_sha: string;
  blob_sha: string;
  html_url: string;
}

/**
 * Cria ou atualiza um arquivo. Idempotente — se o conteudo nao mudou, ainda chama
 * a API e GitHub retorna 422 ("sha did not match"); capturamos e retornamos o sha atual.
 */
export async function commitFile(input: CommitFileInput): Promise<CommitResult> {
  const { owner, repo } = parseRepo();
  const branch = input.branch ?? config.GITHUB_BRANCH_BASE;
  const path = input.path;

  // 1) sha atual (se existe)
  let currentSha: string | undefined;
  try {
    const { data } = await client().rest.repos.getContent({ owner, repo, path, ref: branch });
    if (!Array.isArray(data) && 'sha' in data) currentSha = data.sha;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404) {
      log.error({ err: (e as Error).message }, 'falha ao ler arquivo atual');
      throw e;
    }
  }

  // 2) cria/atualiza
  try {
    const { data } = await client().rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch,
      path,
      message: input.message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      sha: currentSha,
      committer: { name: config.GITHUB_AUTHOR_NAME, email: config.GITHUB_AUTHOR_EMAIL },
      author: { name: config.GITHUB_AUTHOR_NAME, email: config.GITHUB_AUTHOR_EMAIL },
    });

    const blob_sha = data.content?.sha ?? '';
    const commit_sha = data.commit?.sha ?? '';
    const html_url = data.content?.html_url ?? '';

    log.info({ path, branch, commit_sha: commit_sha.slice(0, 7) }, 'commitFile ok');
    return { commit_sha, blob_sha, html_url };
  } catch (e) {
    log.error({ path, err: (e as Error).message }, 'commitFile falhou');
    throw e;
  }
}

/** Move arquivo (rename) — usado quando rascunho vira publicacao. */
export async function moveFile(input: { from: string; to: string; message: string; branch?: string }): Promise<{ commit_sha: string }> {
  const { owner, repo } = parseRepo();
  const branch = input.branch ?? config.GITHUB_BRANCH_BASE;

  // Le conteudo do origem
  const { data: src } = await client().rest.repos.getContent({ owner, repo, path: input.from, ref: branch });
  if (Array.isArray(src) || src.type !== 'file') throw new Error('moveFile: origem nao e arquivo');
  const content = Buffer.from(src.content, 'base64').toString('utf8');

  // Cria no destino
  await commitFile({ path: input.to, content, message: input.message, branch });

  // Deleta origem
  const { data: delResp } = await client().rest.repos.deleteFile({
    owner, repo, path: input.from, message: input.message, sha: src.sha, branch,
    committer: { name: config.GITHUB_AUTHOR_NAME, email: config.GITHUB_AUTHOR_EMAIL },
    author: { name: config.GITHUB_AUTHOR_NAME, email: config.GITHUB_AUTHOR_EMAIL },
  });
  const commit_sha = delResp.commit?.sha ?? '';
  log.info({ from: input.from, to: input.to, commit_sha: commit_sha.slice(0, 7) }, 'moveFile ok');
  return { commit_sha };
}

/** Lista arquivos em uma pasta — usado pra detectar slugs existentes. */
export async function listFolder(path: string, branch?: string): Promise<string[]> {
  const { owner, repo } = parseRepo();
  const ref = branch ?? config.GITHUB_BRANCH_BASE;
  try {
    const { data } = await client().rest.repos.getContent({ owner, repo, path, ref });
    if (!Array.isArray(data)) return [];
    return data.filter((it) => it.type === 'file').map((it) => it.name);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return [];
    throw e;
  }
}
