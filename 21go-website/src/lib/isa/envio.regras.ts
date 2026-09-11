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
  const vistas = new Set<string>()
  const partes = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    // A mesma frase duas vezes na mesma resposta (11/09/2026: "vou confirmar" 3x, uma por
    // pergunta que ela nao sabia) fica com cara de robo — vai uma so.
    .filter((p) => {
      const chave = p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (vistas.has(chave)) return false
      vistas.add(chave)
      return true
    })
  if (partes.length <= MAX_PARTES) return partes
  return [...partes.slice(0, MAX_PARTES - 1), partes.slice(MAX_PARTES - 1).join('\n\n')]
}

export interface ParteEnvio {
  texto: string
  /** wamid da mensagem do cliente que esta parte responde (citada no WhatsApp), ou null. */
  citar: string | null
}

/**
 * Chegaram varias mensagens juntas: a IA marca cada parte com [1], [2]... e aqui a marca vira a
 * citacao da mensagem certa (dono, 11/09/2026, com o print do balao de resposta). Com UMA
 * mensagem so nao cita nada — nao faz sentido citar o que acabou de chegar sozinho.
 */
export function partesComCitacao(texto: string, wamids: (string | undefined)[]): ParteEnvio[] {
  const citavel = wamids.length > 1
  return dividirEmPartes(texto).map((p) => {
    const m = p.match(/^\[(\d{1,2})\]\s*/)
    const limpo = m ? p.slice(m[0].length).trim() : p
    const i = m ? Number(m[1]) - 1 : -1
    const wamid = citavel && i >= 0 && i < wamids.length ? wamids[i] ?? null : null
    return { texto: limpo, citar: wamid }
  })
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
  if (!t || /^\[?\s*inaudivel\s*\]?\.?$/.test(t)) return true
  // Trecho que nao ficou claro vem marcado; com 3 ou mais buracos, o que sobra e palpite.
  return (t.match(/\[inaudivel\]/g) ?? []).length >= 3
}

export function mensagemAudioNaoEntendido(abertura: string | null): string {
  const t = 'não consegui entender seu áudio 🙏🏼\n\npode mandar de novo ou escrever pra mim?'
  return abertura ? `${abertura}\n\n${t}` : t
}
