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

/**
 * A falha foi da Meta ou da rede, e tentar de novo em segundos resolve? Em 15/09/2026 a Isa foi
 * responder o Rafael e a Meta devolveu "(#2) Service temporarily unavailable". Ninguem tentou de
 * novo, a mensagem dele ficou sem resposta, a janela de 24h fechou e no dia seguinte a Leticya nao
 * conseguia mais escrever pra ele. Erro de regra (janela fechada, numero invalido) NAO e passageiro:
 * repetir so gasta tempo.
 */
export function ehFalhaPassageira(mensagem: string): boolean {
  return /\(#(1|2|4)\)|\b(131000|133004|130429|80007)\b|temporarily unavailable|service unavailable|try again later|timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|\b50[0234]\b/i.test(mensagem)
}

/**
 * O cliente mandou 2 ou mais mensagens em sequencia, mas elas chegaram com segundos de diferenca
 * e viraram turnos separados, cada um com UMA mensagem. partesComCitacao so cita quando chegam
 * juntas, entao nada era citado. Dono, 16/09/2026 (moto e carro, 13:06): "cliente mandou 2
 * mensagem ou mais vc tem q responder a mensagem que ele mandou, selecionar o responder e sempre
 * responder cada mensagem separada".
 *
 * Se houve 2+ mensagens dele nos ultimos minutos, a primeira parte cita a que esta sendo
 * respondida (a mais recente). Uma so vez por resposta, como no WhatsApp. Citacao ja feita pelo
 * [n] nao e sobrescrita.
 */
export function citarMensagemRespondida(
  partes: ParteEnvio[],
  historico: { direction: string; content: string; whatsapp_message_id: string; criada_em: string }[],
  agora: Date,
  janelaMs = 3 * 60_000,
): ParteEnvio[] {
  if (partes.length === 0 || partes.some((p) => p.citar)) return partes
  // Dono, 16/09/2026: "qd tiver somente 1 pergunta vc nao precisa responder selecionando ela, so qd
  // tiver 2 ou mais". Conta so o que ainda esta SEM resposta (depois da nossa ultima mensagem): num
  // pergunta-e-resposta normal cada pergunta chega sozinha e sai sem citacao, como gente faz.
  const ultimaNossa = historico.map((m) => m.direction).lastIndexOf('outbound')
  const pendentes = historico
    .slice(ultimaNossa + 1)
    .filter((m) => m.direction === 'inbound' && (m.content || '').trim())
    .filter((m) => agora.getTime() - new Date(m.criada_em).getTime() < janelaMs)
  if (pendentes.length < 2) return partes
  const alvo = pendentes[pendentes.length - 1]?.whatsapp_message_id
  if (!alvo) return partes
  return partes.map((p, i) => (i === 0 ? { ...p, citar: alvo } : p))
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

/**
 * Trava geral contra loop: quantas mensagens a Isa pode mandar sem o cliente responder.
 *
 * Dono, 16/09/2026, depois das 14 simulacoes do Carlos: "nao deixa acontecer isso de novo". A
 * correcao daquele defeito (jaCotouEssaPlaca) cobre aquele caminho; esta trava cobre QUALQUER
 * caminho futuro. Uma resposta normal cabe folgado: template dos 5 min (1) + simulacao inteira
 * (ate 4) + retomada dos 10 min (1). Passou disso sem ele escrever, e defeito: nao manda, pausa e
 * avisa o dono.
 */
export const LIMITE_SEM_RESPOSTA = 7

export function passaDoLimiteSemResposta(jaEnviadasSemResposta: number, vaiEnviar: number): boolean {
  return jaEnviadasSemResposta + vaiEnviar > LIMITE_SEM_RESPOSTA
}

/**
 * Ate onde a Isa JA LEU. Tem que ser a ultima mensagem que entrou na resposta, nao a que existia
 * quando a conversa foi pega pra atender: o lote e lido depois, e um audio que chega nesse meio
 * entra na resposta E era contado como "mensagem nova", cortando o envio na primeira parte.
 *
 * Caso do dono (25/09/2026): o cliente perguntou dos 2 almocos e das 2 lavagens, a resposta saiu
 * com 3 partes e so a primeira foi enviada ("que bom que gostou do plano"); a pergunta dele ficou
 * sem resposta.
 */
export function vistoDoLote(
  vistoAtual: string | null,
  novas: readonly { criada_em?: string | null }[],
): string | null {
  const ultima = novas.length ? novas[novas.length - 1]?.criada_em : null
  return ultima || vistoAtual
}

/**
 * A mesma mensagem nunca sai duas vezes na conversa (dono, 26/09/2026: "mandou mesma mensagem 2x,
 * isso nao pode acontecer nunca"). O Francisco mandou "Vou analisar" e "Entro contato" em sequencia
 * e ouviu duas vezes "claro, sem pressa..." — as duas saidas da IA diferiam so por uma virgula.
 * Compara sem acento, pontuacao, emoji e caixa; quase igual (>= 90% dos pares de letras) conta.
 */
export function repeteMensagemRecente(texto: string, anteriores: string[]): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const t = norm(texto)
  // "ok", "sim", so emoji: curto demais pra dizer que e repeticao
  if (t.length < 6) return false
  const pares = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const pt = pares(t)
  return anteriores.some((a) => {
    const n = norm(a)
    if (n === t) return true
    if (n.length < 6 || Math.min(n.length, t.length) / Math.max(n.length, t.length) < 0.8) return false
    const pa = pares(n)
    let comum = 0
    for (const [k, v] of pt) comum += Math.min(v, pa.get(k) ?? 0)
    return (2 * comum) / (t.length - 1 + n.length - 1) >= 0.9
  })
}
