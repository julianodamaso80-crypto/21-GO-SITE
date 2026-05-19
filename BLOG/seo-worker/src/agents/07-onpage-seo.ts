/**
 * Agente 07 — On-Page SEO
 *
 * Determinista (sem LLM). Verifica e CORRIGE o MDX:
 *   - meta_title <= 65 chars
 *   - meta_description 130-160 chars
 *   - slug limpo (so a-z0-9-)
 *   - keyword principal aparece no titulo + introducao + algum H2
 *   - tem FAQ section
 *   - tem link interno
 *   - imagem destacada apontada
 *
 * Retorna warnings (nao bloqueia publicacao — Reviewer ja fez isso). Atualiza
 * frontmatter no MDX (description/keywords) e seo.articles correspondentes.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from './_types.js';
import type { ArticleRow } from '../db/repositories/articles.js';
import { updateArticle } from '../db/repositories/articles.js';
import { parseMdx, buildMdx, type ArticleFrontmatter } from '../lib/mdx.js';
import { child } from '../lib/logger.js';

const log = child('agent:07-onpage-seo');

interface Input {
  article: ArticleRow;
}

interface Output {
  warnings: string[];
  fixes_applied: string[];
}

export const agent07: Agent<Input, Output> = {
  id: '07-onpage-seo',
  description: 'Valida e ajusta meta tags/slug/keywords no MDX (determinista)',
  async run(input, ctx) {
    const a = input.article;
    if (!a.mdx_path) throw new Error('article sem mdx_path');
    const repoRoot = await findRepoRoot();
    const filePath = path.join(repoRoot, a.mdx_path);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseMdx(raw);

    const warnings: string[] = [];
    const fixes: string[] = [];
    const fm: ArticleFrontmatter = {
      title: parsed.data.title ?? a.title,
      description: parsed.data.description ?? '',
      date: parsed.data.date ?? new Date().toISOString().slice(0, 10),
      author: parsed.data.author ?? '21Go',
      category: parsed.data.category ?? 'Geral',
      keywords: parsed.data.keywords ?? [],
      image: parsed.data.image ?? '/blog/default.jpg',
    };

    // === 1) Meta title length ===
    if (fm.title.length > 65) {
      warnings.push(`title tem ${fm.title.length} chars (recomendado <= 65)`);
    }

    // === 2) Meta description ===
    if (!fm.description) {
      fm.description = extractFirstSentence(parsed.content, 155);
      fixes.push('description gerada a partir da introducao');
    } else if (fm.description.length < 80) {
      warnings.push(`description curta (${fm.description.length} chars; ideal 130-160)`);
    } else if (fm.description.length > 165) {
      fm.description = fm.description.slice(0, 158).trim() + '…';
      fixes.push('description truncada pra 160 chars');
    }

    // === 3) Slug ===
    if (!/^[a-z0-9-]+$/.test(a.slug)) warnings.push(`slug invalido: ${a.slug}`);
    if (a.slug.length > 80) warnings.push(`slug muito longo (${a.slug.length})`);

    // === 4) Keyword principal aparece? ===
    const main = (a.main_keyword ?? '').toLowerCase();
    if (main) {
      const titleOK = fm.title.toLowerCase().includes(main.split(' ')[0] ?? main);
      const contentLow = parsed.content.toLowerCase();
      const introOK = contentLow.slice(0, 500).includes(main.split(' ')[0] ?? main);
      const h2Pattern = /^## .+$/gm;
      const h2s = parsed.content.match(h2Pattern) ?? [];
      const inSomeH2 = h2s.some((h) => h.toLowerCase().includes(main.split(' ')[0] ?? main));
      if (!titleOK) warnings.push(`keyword principal nao aparece no title`);
      if (!introOK) warnings.push(`keyword principal nao aparece nos 500 primeiros chars`);
      if (!inSomeH2) warnings.push(`keyword principal nao aparece em nenhum H2`);
    }

    // === 5) FAQ section ===
    if (!/##\s*Perguntas frequentes/i.test(parsed.content)) {
      warnings.push('sem secao "## Perguntas frequentes"');
    }

    // === 6) Link interno ===
    const internalLinks = Array.from(parsed.content.matchAll(/\[([^\]]+)\]\((\/[^)]+)\)/g));
    if (internalLinks.length === 0) {
      warnings.push('sem links internos detectados');
    }

    // === 7) Imagem ===
    if (!fm.image || fm.image === '/blog/default.jpg') {
      warnings.push('imagem destacada generica (/blog/default.jpg) — sugerir asset proprio');
    }

    // === 8) Reescreve MDX se houve fix ===
    if (fixes.length > 0 && !ctx.dry_run) {
      const newMdx = buildMdx(fm, parsed.content);
      await fs.writeFile(filePath, newMdx, 'utf8');
      log.info({ articleId: a.id, fixes }, 'mdx atualizado');
      await updateArticle(a.id, { meta_description: fm.description });
    }

    log.info({ articleId: a.id, warnings: warnings.length, fixes: fixes.length }, 'onpage check');
    return { output: { warnings, fixes_applied: fixes } };
  },
};

function extractFirstSentence(content: string, maxLen: number): string {
  // Pega primeira frase nao-vazia que nao seja H1/H2/etc
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const first = lines[0] ?? '';
  if (first.length <= maxLen) return first;
  // corta na proxima pontuacao apos maxLen
  const cut = first.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > 0 ? lastSpace : maxLen).trim() + '…';
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
