// =============================================================================
// FASE 1.B — Indexar knowledge base REAL no banco novo
// Fontes:
//  1. 60 MDX em 21go-website/content/blog/ (artigos do site)
//  2. 21go-squad/agents/agente-pre-venda.md (framework CLOSER)
//  3. brand-guide.md (tom de voz)
//  4. src/data/pricing.ts (preços REAIS dos 8 planos por faixa FIPE)
//
// Estratégia de chunking:
//  - Remove frontmatter YAML
//  - Remove componentes JSX/MDX (<Image>, <Link>, etc) — fica só texto
//  - Split por H2/H3 headings (## ###)
//  - Se chunk > 1500 chars, split por parágrafo
//  - Junta parágrafos pequenos (<200 chars) com adjacente
//  - Cada chunk: { source, source_doc_id, chunk_index, content, metadata }
// =============================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BLOG_DIR = path.join(ROOT, '21go-website', 'content', 'blog');
const AGENT_MD = path.join(ROOT, '21go-squad', '21go-squad', 'agents', 'agente-pre-venda.md');
const BRAND_MD = path.join(ROOT, 'brand-guide.md');
const PRICING_TS = path.join(ROOT, '21go-website', 'src', 'data', 'pricing.ts');

const MIN_CHUNK = 200;
const MAX_CHUNK = 1500;
const TARGET = 800;

function stripMdx(text) {
  // Remove frontmatter YAML
  text = text.replace(/^---[\s\S]*?---\n+/, '');
  // Remove imports/exports MDX
  text = text.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  text = text.replace(/^export\s+.*$/gm, '');
  // Remove componentes JSX (auto-closed e bloco)
  text = text.replace(/<[A-Z][a-zA-Z]*\s[^>]*\/>/g, ''); // <Image .../>
  text = text.replace(/<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, ''); // <Component>...</Component>
  // Remove links markdown mas mantem texto
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove imagens markdown
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Remove HTML tags simples
  text = text.replace(/<\/?[a-z]+[^>]*>/g, '');
  // Normaliza linhas em branco
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function chunkBySection(text, sourceDocId) {
  // Split por headings ## e ###
  const sections = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentBody = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      // flush prev
      if (currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
      }
      currentTitle = m[2].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
  }

  // Cada secao vira 1+ chunk(s)
  const chunks = [];
  for (const sec of sections) {
    if (!sec.body || sec.body.length < 50) continue;
    const fullSec = sec.title ? `${sec.title}\n\n${sec.body}` : sec.body;

    if (fullSec.length <= MAX_CHUNK) {
      chunks.push({ content: fullSec, secao: sec.title || null });
    } else {
      // split por paragrafo, agrupando ate TARGET
      const paras = sec.body.split(/\n{2,}/).filter(Boolean);
      let current = sec.title ? sec.title + '\n\n' : '';
      for (const p of paras) {
        if ((current + '\n\n' + p).length > MAX_CHUNK && current.length > MIN_CHUNK) {
          chunks.push({ content: current.trim(), secao: sec.title || null });
          current = sec.title ? sec.title + '\n\n' + p : p;
        } else {
          current = current ? current + '\n\n' + p : p;
        }
      }
      if (current.trim().length >= MIN_CHUNK) {
        chunks.push({ content: current.trim(), secao: sec.title || null });
      }
    }
  }

  return chunks;
}

function processBlog(filePath) {
  const slug = path.basename(filePath, '.mdx');
  const raw = fs.readFileSync(filePath, 'utf8');

  // Captura titulo do frontmatter se tiver
  let title = slug;
  const fmMatch = raw.match(/^---([\s\S]*?)---/);
  if (fmMatch) {
    const tMatch = fmMatch[1].match(/title:\s*['"]?([^'"\n]+)['"]?/);
    if (tMatch) title = tMatch[1].trim();
  }

  const text = stripMdx(raw);
  const chunks = chunkBySection(text, slug);
  return { source: 'BLOG', source_doc_id: slug, title, chunks };
}

function processSimpleMd(filePath, sourceLabel, docId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = stripMdx(raw);
  const chunks = chunkBySection(text, docId);
  return { source: sourceLabel, source_doc_id: docId, title: docId, chunks };
}

function processPricing(filePath) {
  // Ler e gerar chunks por plano com features + faixas representativas
  const src = fs.readFileSync(filePath, 'utf8');

  // Extrair PLAN_INFO via regex (simples — pega features de cada plano)
  const planMap = {};
  const planRegex = /'([\w-]+)':\s*{[^}]*?id:\s*'\1'[^}]*?name:\s*'([^']+)'[^}]*?description:\s*'([^']+)'[^}]*?features:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = planRegex.exec(src)) !== null) {
    const id = m[1];
    const name = m[2];
    const description = m[3];
    const featuresBlock = m[4];
    const features = [];
    const featRegex = /{\s*text:\s*'([^']+)'[^}]*?included:\s*(true|false)/g;
    let fm;
    while ((fm = featRegex.exec(featuresBlock)) !== null) {
      features.push({ text: fm[1], included: fm[2] === 'true' });
    }
    planMap[id] = { id, name, description, features };
  }

  // Pra cada plano, gera 1 chunk descrevendo cobertura
  const chunks = [];
  for (const [planId, info] of Object.entries(planMap)) {
    const incluidos = info.features.filter(f => f.included).map(f => f.text);
    const naoIncluidos = info.features.filter(f => !f.included).map(f => f.text);
    let content = `Plano ${info.name} (id=${planId}): ${info.description}\n\nINCLUI:\n`;
    content += incluidos.map(x => `- ${x}`).join('\n');
    if (naoIncluidos.length) {
      content += `\n\nNÃO INCLUI:\n`;
      content += naoIncluidos.map(x => `- ${x}`).join('\n');
    }
    content += `\n\nPara saber a cota mensal exata, consulte tool getPlanPrice(plano='${planId}', valor_fipe=X).`;
    chunks.push({ content, secao: info.name, plano: planId });
  }

  return { source: 'PLANOS', source_doc_id: 'pricing-2026', title: 'Planos 21Go (8 planos)', chunks };
}

(async () => {
  const c = new Client({
    host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432,
    user: 'postgres.dsclaxtvcbbuxmtmpxpf', password: 'GuI1616GuI@',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('Limpando ai.knowledge_chunks...');
  await c.query('TRUNCATE ai.knowledge_chunks RESTART IDENTITY CASCADE');

  const docs = [];

  // 1) Pricing (estruturado)
  console.log('Processing pricing.ts...');
  docs.push(processPricing(PRICING_TS));

  // 2) Brand guide
  console.log('Processing brand-guide.md...');
  docs.push(processSimpleMd(BRAND_MD, 'BRAND_GUIDE', 'brand-guide'));

  // 3) Agente pre-venda
  console.log('Processing agente-pre-venda.md...');
  docs.push(processSimpleMd(AGENT_MD, 'AGENT_PLAYBOOK', 'agente-pre-venda'));

  // 4) Todos os blog MDX
  const blogs = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
  console.log(`Processing ${blogs.length} blog MDX...`);
  for (const f of blogs) {
    docs.push(processBlog(path.join(BLOG_DIR, f)));
  }

  // Inserir
  let totalInserted = 0;
  for (const doc of docs) {
    for (let i = 0; i < doc.chunks.length; i++) {
      const ch = doc.chunks[i];
      const metadata = {
        title: doc.title,
        secao: ch.secao || null,
      };
      if (ch.plano) metadata.plano = ch.plano;
      await c.query(
        `INSERT INTO ai.knowledge_chunks (source, source_doc_id, chunk_index, content, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [doc.source, doc.source_doc_id, i, ch.content, JSON.stringify(metadata)]
      );
      totalInserted++;
    }
  }

  console.log(`\nTotal inserido: ${totalInserted} chunks`);
  const stats = await c.query(`
    SELECT source, count(*)::int AS chunks, round(avg(length(content)))::int AS avg_chars
    FROM ai.knowledge_chunks GROUP BY source ORDER BY chunks DESC
  `);
  console.log('\nDistribuicao:');
  for (const r of stats.rows) {
    console.log(`  ${r.source.padEnd(18)} ${String(r.chunks).padStart(4)} chunks  avg=${r.avg_chars} chars`);
  }

  await c.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
