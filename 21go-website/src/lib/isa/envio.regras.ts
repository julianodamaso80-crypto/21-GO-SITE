/**
 * Como a Isa manda a resposta parecendo gente — logica pura, sem rede.
 *
 * Portado do Parlant (emcie-co/parlant, Apache-2.0): `perceived_performance_policy.py` e o
 * trecho de `canned_response_generator.py` que divide a mensagem em `\n\n` e espera entre as
 * partes. Os numeros sao os deles, somados em segundos como no codigo original.
 */

const MAX_PARTES = 5
const PALAVRAS_POR_MINUTO = 50
const TETO_PAUSA_S = 12

/** Quebra nas linhas em branco; quebra de linha simples fica na mesma mensagem. */
export function dividirEmPartes(texto: string): string[] {
  const partes = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (partes.length <= MAX_PARTES) return partes
  return [...partes.slice(0, MAX_PARTES - 1), partes.slice(MAX_PARTES - 1).join('\n\n')]
}

const palavras = (s: string) => s.split(/\s+/).filter(Boolean).length

/** Segundos de "digitando..." entre a parte que acabou de sair e a proxima. */
export function pausaEntreSegundos(enviada: string, proxima: string): number {
  const ne = palavras(enviada)
  const np = palavras(proxima)
  let s = ne <= 10 ? 0.5 : (ne / PALAVRAS_POR_MINUTO) * 2
  s += np <= 10 ? 1 : 2
  s += np / PALAVRAS_POR_MINUTO
  return Math.min(s, TETO_PAUSA_S)
}

/** O media_id vai numa URL do Graph — so o formato da Meta, nada de caminho ou URL. */
export function mediaIdValido(id: unknown): boolean {
  return typeof id === 'string' && /^[A-Za-z0-9._-]+$/.test(id) && !id.includes('..')
}

/**
 * Pre-mensagem curta ("perai", "1 min") antes da resposta de verdade. Nas 2 primeiras respostas
 * sempre (mostra que tem alguem ali); depois, so se as 2 ultimas esperas do cliente passaram de
 * 5 s. Nunca duas seguidas.
 */
export function precisaPreambulo(p: { esperasAnteriores: number[]; ultimaFoiPreambulo: boolean }): boolean {
  if (p.ultimaFoiPreambulo) return false
  if (p.esperasAnteriores.length <= 2) return true
  return p.esperasAnteriores.slice(-2).every((s) => s >= 5)
}

/**
 * Audio que nao deu pra entender (cortado, sem fala, ruido). Teste do dono de 11/09/2026: o
 * audio saiu cortado e a transcricao "completou" com "um Onix" — a lista de carros do prompt de
 * transcricao virava palpite. Agora: na duvida, a transcricao devolve [INAUDIVEL] e a Isa pede
 * pra repetir; nunca adivinha.
 */
export const AUDIO_INAUDIVEL = '🎤 [não deu pra entender o áudio]'

export function ehInaudivel(transcricao: string | null | undefined): boolean {
  const t = (transcricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return !t || /^\[?\s*inaudivel\s*\]?\.?$/.test(t)
}

export function mensagemAudioNaoEntendido(abertura: string | null): string {
  const t = 'não consegui entender seu áudio 🙏🏼\n\npode mandar de novo ou escrever pra mim?'
  return abertura ? `${abertura}\n\n${t}` : t
}
