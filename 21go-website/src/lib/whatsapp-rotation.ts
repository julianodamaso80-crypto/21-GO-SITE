import 'server-only'
import { WHATSAPP_TARGETS, type WhatsAppTarget } from './constants'

/**
 * Rodízio dos números de WhatsApp que recebem os contatos do site.
 *
 * REGRA (decisão do dono, 2026-07-29): a cada 3 contatos, 2 caem no 4882 e 1 no
 * 4240. Não é sorteio — é uma fila fixa, pra proporção não desandar num volume
 * baixo. A fila é [4882, 4882, 4240] e o cursor anda um passo por contato.
 *
 * O cursor vive na memória do processo. Um restart reinicia o ciclo, o que na
 * prática só significa que o 4882 pega um contato a mais naquele momento — a
 * proporção continua 2:1 no acumulado. Sem estado em banco de propósito: um
 * contador persistido custaria uma ida ao Supabase em cada clique, no caminho
 * mais sensível do funil.
 */
const QUEUE: WhatsAppTarget[] = WHATSAPP_TARGETS.flatMap((t) =>
  Array.from({ length: Math.max(1, t.share) }, () => t),
)

let cursor = 0

/** Devolve o próximo número do rodízio e avança o cursor. */
export function pickWhatsAppTarget(): WhatsAppTarget {
  const target = QUEUE[cursor % QUEUE.length]
  cursor += 1
  return target
}

/** Posição atual do ciclo — só pra log/diagnóstico, não muda o estado. */
export function rotationState(): { cursor: number; queue: string[] } {
  return { cursor, queue: QUEUE.map((t) => t.number) }
}
