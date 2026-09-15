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

/**
 * Tira a marcacao [1], [2]... que a IA usa pra dizer qual mensagem cada parte responde. E anotacao
 * INTERNA: o cliente nunca pode ver. Em 15/09/2026 saiu "[2] podemos sim! pra gente seguir..." pro
 * Pierre, porque dois caminhos do worker mandavam o texto da IA por dividirEmPartes, que nao
 * limpava. Agora a limpeza mora no envio, por onde TODA parte passa: caminho novo nao vaza.
 */
export function semMarcaDeParte(texto: string): string {
  return texto.replace(/^\s*\[\d{1,2}\]\s*/, '')
}

/**
 * Chegaram varias mensagens: quais ficaram SEM resposta. A IA marca cada parte com [1], [2]...
 * e e por ai que o envio cita o balao certo. Dono, 15/09/2026: a Lara perguntou da regiao e das
 * formas de pagamento, e a Isa respondeu so a primeira, sem citar nenhuma. Agora o cerebro
 * confere e manda reescrever quando falta alguma.
 */
export function marcasQueFaltam(resposta: string, quantasMensagens: number): number[] {
  if (quantasMensagens < 2) return []
  const tem = new Set<number>()
  for (const m of resposta.matchAll(/(?:^|\n)\s*\[(\d{1,2})\]/g)) tem.add(Number(m[1]))
  const faltam: number[] = []
  for (let i = 1; i <= quantasMensagens; i++) if (!tem.has(i)) faltam.push(i)
  return faltam
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
  // So marcador ([INAUDIVEL], [CORTADO]) e nada de fala: nao deu pra entender.
  if (!t || /^\[?\s*(inaudivel|cortado)\s*\]?\.?$/.test(t) || !t.replace(/\[(inaudivel|cortado)\]/g, '').trim()) return true
  // Trecho que nao ficou claro vem marcado; com 3 ou mais buracos, o que sobra e palpite.
  return (t.match(/\[inaudivel\]/g) ?? []).length >= 3
}

export function mensagemAudioNaoEntendido(abertura: string | null): string {
  const t = 'não consegui entender seu áudio 🙏🏼\n\npode mandar de novo ou escrever pra mim?'
  return abertura ? `${abertura}\n\n${t}` : t
}

/**
 * Print ou documento que o atendente anexa no painel (dono, 14/09/2026).
 *
 * A Meta so aceita jpeg, png e webp como IMAGEM. O resto vai como DOCUMENTO, que ela aceita em
 * quase todo formato e entrega com o nome do arquivo — inclusive o HEIC do iPhone: foto da
 * galeria costuma virar jpeg no upload do Safari, mas quando nao vira, mandar como imagem volta
 * erro da Meta e o atendente fica sem entender por que nao foi.
 *
 * Limite: 5 MB de imagem e 16 MB de documento. A Meta aceita documento ate 100 MB, mas o
 * container do site tem 2 GB de RAM e o arquivo passa inteiro por ele.
 */
export const LIMITE_IMAGEM = 5 * 1024 * 1024
export const LIMITE_DOCUMENTO = 16 * 1024 * 1024

const IMAGENS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export function tipoDeAnexo(mime: string | null | undefined): 'image' | 'document' {
  return IMAGENS.includes((mime || '').toLowerCase().split(';')[0].trim()) ? 'image' : 'document'
}

/** Nome que o cliente ve no balao do documento. Sem isso, o WhatsApp mostra "arquivo". */
export function nomeDoAnexo(nome: string | null | undefined, tipo: 'image' | 'document'): string {
  const limpo = (nome || '').split(/[\\/]/).pop()?.replace(/["']/g, '').trim().slice(0, 100) || ''
  if (limpo) return limpo
  return tipo === 'image' ? 'imagem.jpg' : 'arquivo'
}

/** Devolve o erro pronto pro atendente ler, ou null se o arquivo pode ir. */
export function anexoRecusado(p: { tamanho: number; tipo: 'image' | 'document' }): string | null {
  if (p.tamanho === 0) return 'arquivo vazio'
  const limite = p.tipo === 'image' ? LIMITE_IMAGEM : LIMITE_DOCUMENTO
  if (p.tamanho > limite) {
    const mb = Math.round(limite / 1024 / 1024)
    return `arquivo grande demais — o limite é ${mb} MB para ${p.tipo === 'image' ? 'imagem' : 'documento'}`
  }
  return null
}
