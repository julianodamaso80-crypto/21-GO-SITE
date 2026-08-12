import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Duas travas dos sites de consultor. Rodam no `prebuild`, entao quebram o build
 * — nao sao aviso pra alguem ler depois.
 *
 * As duas falham do mesmo jeito perigoso: em silencio. Nada estoura, nenhum erro
 * aparece; o site do consultor so passa a mandar o visitante pro lugar errado, ou
 * uma pagina do site some do ar. Coisa que so se descobre pelo consultor
 * reclamando que pagou anuncio e nao recebeu lead.
 */

// fileURLToPath e nao `.pathname`: o caminho real tem espacos ("21 GO - SITE") e
// a URL os entrega como %20, que o fs nao resolve.
const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(RAIZ, 'src')
const falhas = []

/* ─── 1. Ninguem importa next/link direto ────────────────────────────────────
 * O `@/components/Link` prefixa o slug sozinho. Um `next/link` solto num
 * componente novo seria uma porta de saida do site do consultor. */
const PERMITIDO = join('components', 'Link.tsx')

function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      varrer(caminho)
      continue
    }
    if (!/\.(tsx?|jsx?)$/.test(nome)) continue
    if (caminho.endsWith(PERMITIDO)) continue
    const fonte = readFileSync(caminho, 'utf8')

    if (fonte.includes("from 'next/link'")) {
      falhas.push(
        `${caminho.replace(RAIZ, '')} importa 'next/link' direto.\n` +
          `    Use: import Link from '@/components/Link'\n` +
          `    (senao um clique ali escapa do site do consultor pra home da 21Go)`,
      )
    }

    /**
     * `<a href="/algo">` cru — o buraco que o import sozinho nao fecha.
     *
     * Foi assim que o rodape vazou na primeira versao: um `<a>` comum, com o
     * href numa linha separada da tag, apontando pra /cotacao. O site do
     * consultor abria certo, todos os outros 43 links prefixavam certo, e esse
     * um mandava o visitante pra 21Go. So apareceu abrindo no navegador.
     *
     * `/api/...` fica de fora: aponta pros nossos endpoints, que ja tratam o
     * consultor pelo parametro `?c=`.
     *
     * `data-sai-do-slug` e a saida deliberada, e existe um caso real: a tela de
     * site indisponivel. Se o link dela fosse prefixado, mandaria o visitante de
     * volta pro slug que acabou de nao existir — um loop. Quem usa o marcador
     * esta dizendo "aqui sair do site do consultor e o certo", e isso fica no
     * proprio JSX, na cara de quem for ler depois.
     */
    if (!caminho.endsWith('.tsx')) continue
    for (const m of fonte.matchAll(/<a\s([^>]*)>/gs)) {
      const atributos = m[1]
      if (atributos.includes('data-sai-do-slug')) continue
      const href = atributos.match(/href=["'](\/(?!api\/)[^"']*)["']/)
      if (!href) continue
      falhas.push(
        `${caminho.replace(RAIZ, '')} tem <a href="${href[1]}"> cru.\n` +
          `    Use: <Link href="${href[1]}"> (de '@/components/Link')\n` +
          `    (um <a> comum nao prefixa o slug e vaza o visitante do site do consultor)\n` +
          `    Se sair do slug for MESMO o certo aqui, marque com data-sai-do-slug`,
      )
    }
  }
}
varrer(SRC)

/* ─── 2. ROTAS_RESERVADAS cobre as pastas reais de src/app ───────────────────
 * Pasta nova que nao entre na lista e lida como slug de consultor: a rota some
 * do ar e vira 404 pra todo mundo. */
const lista = readFileSync(join(SRC, 'lib', 'rotas-reservadas.ts'), 'utf8')
const declaradas = new Set([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]))

const noDisco = readdirSync(join(SRC, 'app'))
  .filter((n) => statSync(join(SRC, 'app', n)).isDirectory())
  // Route group `(x)` e rota dinamica `[x]` nao viram primeiro segmento de URL.
  .filter((n) => !n.startsWith('(') && !n.startsWith('['))

for (const rota of noDisco) {
  if (!declaradas.has(rota)) {
    falhas.push(
      `src/app/${rota}/ existe mas nao esta em ROTAS_RESERVADAS.\n` +
        `    Adicione '${rota}' em src/lib/rotas-reservadas.ts\n` +
        `    (senao /${rota} e tratada como slug de consultor e some do ar)`,
    )
  }
}

if (falhas.length) {
  console.error(`\n✗ verificacao dos sites de consultor falhou:\n`)
  for (const f of falhas) console.error(`  • ${f}\n`)
  process.exit(1)
}

console.log(`✓ sites de consultor: ${noDisco.length} rotas reservadas, nenhum next/link solto`)
