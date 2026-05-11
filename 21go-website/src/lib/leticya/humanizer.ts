// @ts-nocheck — modulo Leticya v2 em shadow mode (nao dispara WhatsApp). Validacao TS desativada ate refactor da tipagem do AI SDK.
import 'server-only'

/**
 * Anti-robô: chunking + delay simulado + typing indicator.
 *
 * Padrão SOTA 2026 (Sierra/Decagon):
 *  - DELAY INICIAL antes da 1ª bolha: 30-90s randômico (simula
 *    pessoa real lendo a mensagem antes de começar a responder)
 *  - Quebra resposta em 2-3 bolhas (\n\n ou sentence-split se >280 chars)
 *  - Delay proporcional por bolha: 35 chars/seg (velocidade real
 *    digitação) clamp [1.5s, 8s]
 *  - Gap entre bolhas: 700-1500ms randômico
 *  - Anti-pattern: NUNCA 2 bolhas em <800ms
 */

const INITIAL_READ_DELAY_MIN_MS = 30_000   // 30 segundos
const INITIAL_READ_DELAY_MAX_MS = 90_000   // 90 segundos
const TYPING_SPEED_CHARS_PER_SEC = 35
const MIN_DELAY_MS = 1500
const MAX_DELAY_MS = 8000
const MIN_GAP_BETWEEN_BUBBLES_MS = 700
const MAX_GAP_BETWEEN_BUBBLES_MS = 1500
const MAX_BUBBLE_CHARS = 280
const MAX_BUBBLES = 3

export interface Bubble {
  text: string
  typing_delay_ms: number
  gap_after_ms: number
}

export function chunkResponse(text: string): string[] {
  // 1. Quebra forte por linha em branco dupla
  const hardSplit = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)

  // 2. Bolhas grandes: split por sentence
  const finalBubbles: string[] = []
  for (const part of hardSplit) {
    if (part.length <= MAX_BUBBLE_CHARS) {
      finalBubbles.push(part)
    } else {
      const sentences = part.match(/[^.!?]+[.!?]+/g) || [part]
      let buffer = ''
      for (const s of sentences) {
        if ((buffer + ' ' + s).trim().length > MAX_BUBBLE_CHARS && buffer) {
          finalBubbles.push(buffer.trim())
          buffer = s
        } else {
          buffer = (buffer + ' ' + s).trim()
        }
      }
      if (buffer) finalBubbles.push(buffer.trim())
    }
  }

  // 3. Limita a MAX_BUBBLES (junta as últimas se houver mais)
  if (finalBubbles.length > MAX_BUBBLES) {
    const tail = finalBubbles.slice(MAX_BUBBLES - 1).join(' ')
    return [...finalBubbles.slice(0, MAX_BUBBLES - 1), tail]
  }

  return finalBubbles
}

function calculateTypingDelay(textLength: number): number {
  const raw = (textLength / TYPING_SPEED_CHARS_PER_SEC) * 1000
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(raw)))
}

function randomGap(): number {
  return Math.round(
    MIN_GAP_BETWEEN_BUBBLES_MS +
      Math.random() * (MAX_GAP_BETWEEN_BUBBLES_MS - MIN_GAP_BETWEEN_BUBBLES_MS),
  )
}

function randomInitialReadDelay(): number {
  return Math.round(
    INITIAL_READ_DELAY_MIN_MS +
      Math.random() * (INITIAL_READ_DELAY_MAX_MS - INITIAL_READ_DELAY_MIN_MS),
  )
}

export function planHumanizedSend(
  text: string,
  opts: { skipInitialDelay?: boolean } = {},
): { bubbles: Bubble[]; initial_delay_ms: number; total_ms: number } {
  const parts = chunkResponse(text)
  const initialDelay = opts.skipInitialDelay ? 0 : randomInitialReadDelay()
  let totalMs = initialDelay
  const bubbles: Bubble[] = parts.map((bubbleText, idx) => {
    const typing = calculateTypingDelay(bubbleText.length)
    const gap = idx < parts.length - 1 ? randomGap() : 0
    totalMs += typing + gap
    return { text: bubbleText, typing_delay_ms: typing, gap_after_ms: gap }
  })
  return { bubbles, initial_delay_ms: initialDelay, total_ms: totalMs }
}

/**
 * Escolhe abertura/fechamento sem repetir as últimas N usadas pra mesmo contato.
 * Estado é externo (passado como argumento) — caller decide onde armazenar.
 */
export function pickVariation(
  options: string[],
  recentlyUsed: string[] = [],
): string {
  if (options.length === 0) return ''
  const pool = options.filter((o) => !recentlyUsed.includes(o))
  const final = pool.length > 0 ? pool : options
  return final[Math.floor(Math.random() * final.length)]
}
