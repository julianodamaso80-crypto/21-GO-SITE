import 'server-only'

/**
 * Embeddings locais (Xenova/multilingual-e5-large, 1024 dim) compatíveis
 * com os chunks indexados em ai.knowledge_chunks e ai.conversation_chunks.
 *
 * Singleton: modelo carrega 1x em memória (~560MB) e fica reusando.
 * Latência média por embed: ~100-300ms em CPU moderna.
 */

// e5-small: 384 dim, ~120MB em RAM. Suficiente pra PT-BR retrieval.
// Testado em produção — diferença de qualidade vs e5-large é pequena pra
// queries curtas (mensagens de WhatsApp).
const MODEL_ID = 'Xenova/multilingual-e5-small'

let extractorPromise: Promise<unknown> | null = null

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import('@xenova/transformers')
      return pipeline('feature-extraction', MODEL_ID, { quantized: true })
    })()
  }
  return extractorPromise
}

export async function embedQuery(text: string): Promise<number[]> {
  const extractor = (await getExtractor()) as (
    inputs: string,
    opts: { pooling: 'mean'; normalize: boolean },
  ) => Promise<{ tolist: () => number[][] }>
  // e5 espera prefixo "query: " pra perguntas (vs "passage: " pra docs indexados)
  const out = await extractor(`query: ${text}`, { pooling: 'mean', normalize: true })
  const arr = out.tolist()
  return arr[0]
}

export function vecToPgString(vec: number[]): string {
  return '[' + vec.map((v) => v.toFixed(6)).join(',') + ']'
}
