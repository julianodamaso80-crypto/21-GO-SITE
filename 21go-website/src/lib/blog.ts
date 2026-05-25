import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'content/blog')

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  author: string
  category: string
  keywords: string[]
  image: string
  content: string
  readTime: number
  lastUpdated?: string
  cluster?: string
  funnelStage?: 'top' | 'mid' | 'bottom'
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return []
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'))
  const posts = files.map((file) => getPostBySlug(file.replace('.mdx', '')))
  return posts
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  const wordCount = content.split(/\s+/).length
  return {
    slug,
    title: data.title || '',
    description: data.description || '',
    date: data.date || '',
    author: data.author || '21Go',
    category: data.category || 'Geral',
    keywords: data.keywords || [],
    image: data.image || '/blog/default.jpg',
    content,
    readTime: Math.ceil(wordCount / 200),
    lastUpdated: data.last_updated || data.lastUpdated || undefined,
    cluster: data.cluster || undefined,
    funnelStage: data.funnel_stage || data.funnelStage || undefined,
  }
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return fs.readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace('.mdx', ''))
}
