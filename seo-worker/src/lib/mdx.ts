/**
 * Serializador MDX — usado pelo Writer (Agente 05) e Publisher (Agente 09).
 *
 * Frontmatter compativel com o parser atual do site (src/lib/blog.ts):
 *   { title, description, date, author, category, keywords[], image }
 */
import matter from 'gray-matter';

export interface ArticleFrontmatter {
  title: string;
  description: string;
  date: string;          // ISO 8601 (yyyy-mm-dd)
  author: string;        // ex: '21Go'
  category: string;      // 'Carros' | 'Motos' | 'Frotas' | 'Educativo'
  keywords: string[];
  image: string;         // path absoluto, ex: '/blog/<slug>.jpg' ou '/blog/default.jpg'
}

export function buildMdx(frontmatter: ArticleFrontmatter, body: string): string {
  // gray-matter aceita stringify(content, data) — frontmatter sai em YAML
  return matter.stringify(body.trim() + '\n', frontmatter);
}

export interface ParsedMdx {
  data: Partial<ArticleFrontmatter>;
  content: string;
  word_count: number;
  read_time_min: number;
}

export function parseMdx(raw: string): ParsedMdx {
  const { data, content } = matter(raw);
  const words = content.split(/\s+/).filter(Boolean).length;
  return {
    data: data as Partial<ArticleFrontmatter>,
    content,
    word_count: words,
    read_time_min: Math.max(1, Math.ceil(words / 220)),
  };
}

/** Normaliza titulo em slug seguro pra URL/arquivo. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // remove acentos
    .replace(/[^a-z0-9\s-]/g, '')         // mantem so alfanum + espaco/hifen
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}
