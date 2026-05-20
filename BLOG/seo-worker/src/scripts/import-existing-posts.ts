/**
 * Importa os 60+ posts MDX existentes em 21go-website/content/blog/*.mdx
 * pra seo.articles, gerando embeddings pra cada um.
 *
 * Isso popula a base do anti-canibal: depois de rodar, o Agente 03
 * vai conseguir comparar pautas novas contra TODO o histórico real.
 *
 * Idempotente: se um slug já existe, atualiza sem regenerar embedding.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { query, queryOne, exec, closePool } from '../db/pg.js';
import { embedPassage } from '../lib/similarity.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findRepoRoot(): Promise<string> {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    try { await fs.access(path.join(dir, '.git')); return dir; } catch { /* sobe */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

type Category = 'carros' | 'motos' | 'frotas' | 'educativo';

/** Heuristica conservadora — em duvida, marca 'educativo'. */
function classifyPost(title: string, category: string | undefined, content: string): Category {
  const haystack = (title + ' ' + (category ?? '') + ' ' + content.slice(0, 500)).toLowerCase();

  // Frota tem prioridade pq pode mencionar carros/motos junto
  if (/\b(frota|frotas|delivery|aplicativo|uber|99|ifood|rappi|loggi|motoboy)\b/.test(haystack)) return 'frotas';
  if (/\b(moto|motos|motociclista|motoqueiro|motoboy)\b/.test(haystack)) return 'motos';
  if (/\b(carro|carros|automovel|automoveis|veiculo|veiculos|sedan|suv|hatch)\b/.test(haystack)) return 'carros';
  return 'educativo';
}

interface MdxPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: Category;
  main_keyword: string;
  secondary_keywords: string[];
  content: string;
  word_count: number;
  read_time_min: number;
  mdx_path: string;
}

async function readMdxPost(filePath: string, repoRoot: string): Promise<MdxPost | null> {
  const slug = path.basename(filePath, '.mdx');
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    logger.warn({ slug, err: (e as Error).message }, 'falha ao ler MDX');
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as { title?: string; description?: string; date?: string; category?: string; keywords?: string[] };
  const category = classifyPost(fm.title ?? slug, fm.category, content);
  const words = content.split(/\s+/).filter(Boolean).length;
  const keywords = (fm.keywords ?? []).filter((k): k is string => typeof k === 'string' && k.trim().length > 0);

  return {
    slug,
    title: fm.title ?? slug.replace(/-/g, ' '),
    description: fm.description ?? '',
    date: fm.date ?? new Date().toISOString().slice(0, 10),
    category,
    main_keyword: keywords[0] ?? fm.title ?? slug,
    secondary_keywords: keywords.slice(1, 8),
    content,
    word_count: words,
    read_time_min: Math.max(1, Math.ceil(words / 220)),
    mdx_path: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
  };
}

async function main(): Promise<void> {
  const repoRoot = await findRepoRoot();
  const blogDir = path.join(repoRoot, '21go-website', 'content', 'blog');
  logger.info({ blogDir }, 'lendo posts MDX existentes');

  const files = await fs.readdir(blogDir);
  const mdxFiles = files.filter((f) => f.endsWith('.mdx'));
  logger.info({ count: mdxFiles.length }, 'arquivos MDX encontrados');

  let imported = 0;
  let updated = 0;
  let embeddings_generated = 0;
  let errors = 0;
  const byCategory: Record<string, number> = { carros: 0, motos: 0, frotas: 0, educativo: 0 };

  for (const file of mdxFiles) {
    const filePath = path.join(blogDir, file);
    const post = await readMdxPost(filePath, repoRoot);
    if (!post) { errors++; continue; }

    try {
      // Verifica se ja existe
      const existing = await queryOne<{ id: string; embedding: unknown }>(
        `SELECT id, embedding FROM seo.articles WHERE company_id=$1 AND slug=$2`,
        [config.COMPANY_ID, post.slug],
      );

      if (existing) {
        byCategory[post.category] = (byCategory[post.category] ?? 0) + 1;
        // Update sem regenerar embedding (mantem o existente)
        await exec(
          `UPDATE seo.articles SET
             title=$2, meta_description=$3, category=$4,
             main_keyword=$5, secondary_keywords=$6,
             mdx_path=$7, word_count=$8, read_time_min=$9,
             status='published', published_at=COALESCE(published_at, $10::timestamptz)
           WHERE id=$1`,
          [
            existing.id, post.title, post.description, post.category,
            post.main_keyword, post.secondary_keywords,
            post.mdx_path, post.word_count, post.read_time_min,
            post.date + 'T00:00:00Z',
          ],
        );
        updated++;
        byCategory[post.category] = (byCategory[post.category] ?? 0) + 1;
        logger.debug({ slug: post.slug, category: post.category }, 'updated');
      } else {
        // Insert + embedding novo
        const inserted = await queryOne<{ id: string }>(
          `INSERT INTO seo.articles
             (company_id, title, slug, meta_description, category, main_keyword,
              secondary_keywords, mdx_path, word_count, read_time_min,
              status, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published', $11)
           RETURNING id`,
          [
            config.COMPANY_ID, post.title, post.slug, post.description,
            post.category, post.main_keyword, post.secondary_keywords,
            post.mdx_path, post.word_count, post.read_time_min,
            post.date + 'T00:00:00Z',
          ],
        );

        if (inserted) {
          // Gera embedding e salva (cast pra vector via SQL)
          try {
            const emb = await embedPassage(`${post.title}. ${post.content.slice(0, 2000)}`);
            const vectorLiteral = '[' + emb.join(',') + ']';
            await exec(
              `UPDATE seo.articles SET embedding = $2::vector WHERE id = $1`,
              [inserted.id, vectorLiteral],
            );
            embeddings_generated++;
          } catch (e) {
            logger.warn({ slug: post.slug, err: (e as Error).message }, 'embedding falhou (segue sem)');
          }
        }
        imported++;
        byCategory[post.category] = (byCategory[post.category] ?? 0) + 1;
        logger.info({ slug: post.slug, category: post.category, words: post.word_count }, 'inserted');
      }
    } catch (e) {
      errors++;
      logger.error({ slug: post.slug, err: (e as Error).message }, 'erro inserindo');
    }
  }

  // Validacao final
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM seo.articles WHERE company_id=$1`,
    [config.COMPANY_ID],
  );
  const withEmbedding = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM seo.articles WHERE company_id=$1 AND embedding IS NOT NULL`,
    [config.COMPANY_ID],
  );

  logger.info({
    mdx_files: mdxFiles.length,
    inserted: imported,
    updated,
    embeddings_generated,
    errors,
    by_category: byCategory,
    total_articles_in_db: totalRow?.count,
    with_embedding: withEmbedding?.count,
  }, '=== IMPORT FINALIZADO ===');

  await closePool();
}

main().catch((e) => {
  logger.fatal({ err: (e as Error).message, stack: (e as Error).stack }, 'import fatal');
  process.exit(1);
});
