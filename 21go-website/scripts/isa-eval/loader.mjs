/**
 * Loader do Node pro eval da Isa: deixa o codigo do site (`@/lib/...`, arquivos .ts sem
 * extensao, `import 'server-only'`) rodar fora do Next. Uso:
 *   node --import ./scripts/isa-eval/loader.mjs scripts/isa-eval/rodar.ts
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..')

register(
  `data:text/javascript,${encodeURIComponent(`
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const raiz = ${JSON.stringify(raiz.replace(/\\\\/g, '/'))}
const EXT = ['.ts', '.tsx', '/index.ts']
function comExtensao(caminho) {
  if (/\\.[a-z]+$/i.test(caminho) && existsSync(caminho)) return caminho
  for (const e of EXT) if (existsSync(caminho + e)) return caminho + e
  return null
}
export async function resolve(especificador, contexto, proximo) {
  if (especificador === 'server-only') return { url: 'data:text/javascript,export%20default%20null', shortCircuit: true }
  if (especificador.startsWith('@/')) {
    const alvo = comExtensao(raiz + '/src/' + especificador.slice(2))
    if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true }
  }
  if (especificador.startsWith('./') || especificador.startsWith('../')) {
    const base = contexto.parentURL ? fileURLToPath(new URL(especificador, contexto.parentURL)) : null
    const alvo = base ? comExtensao(base) : null
    if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true }
  }
  return proximo(especificador, contexto)
}
`)}`,
  pathToFileURL('./'),
)
