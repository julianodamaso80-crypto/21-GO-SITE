/*
 * Ponte pro que o Next resolve no build e o `node --test` nao resolve sozinho:
 *   - `server-only`, que fora do Next nem existe como pacote (no servidor ele e modulo vazio);
 *   - import relativo sem extensao (`./powercrm-planos.regras`);
 *   - o alias `@/` do tsconfig, que aponta pra `src/`.
 *
 * Sem isto nenhum modulo de servidor entrava em teste. Chame no TOPO do arquivo de teste e
 * importe o modulo sob teste com `await import(...)`, pra o hook ja estar de pe.
 */
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../../src')
const EXTENSOES = ['.ts', '.tsx', '.js', '.mjs']

export function ligarResolvedorDoNext(): void {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'server-only') {
        return { url: 'data:text/javascript,export {}', shortCircuit: true }
      }

      let alvo: string | null = null
      if (specifier.startsWith('@/')) {
        alvo = path.join(SRC, specifier.slice(2))
      } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        alvo = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      }
      if (!alvo) return next(specifier, context)

      // Testa a extensao sempre que o caminho cru nao existe: `.regras` conta como extensao
      // pro `path.extname`, e sem isto `./powercrm-planos.regras` nunca virava o arquivo .ts.
      if (!existsSync(alvo)) {
        for (const ext of EXTENSOES) {
          if (existsSync(alvo + ext)) {
            return { url: pathToFileURL(alvo + ext).href, shortCircuit: true }
          }
        }
      }
      return { url: pathToFileURL(alvo).href, shortCircuit: true }
    },
  })
}
