/**
 * Como o bot escreve, por identidade. Dono, 02/10/2026: "a Mariana escreve sempre com a primeira
 * letra maiuscula da frase e nao usa emoji". A Isa escreve minusculo e com emoji de proposito (e a
 * forma da Leticya): sem estilo, o texto sai identico.
 *
 * Roda no ultimo passo antes do envio, e o mesmo texto e o que se grava em `messages`.
 */

export interface EstiloDoBot {
  maiuscula: boolean
  semEmoji: boolean
}

// "1" + FE0F + 20E3 (tecla): fica o digito, sai a moldura.
const TECLA = /([0-9#*])\u{FE0F}?\u{20E3}/gu

// Emoji e seus pedacos (bandeira, tom de pele, ZWJ, seletor de variacao), com os espacos em volta.
const EMOJI =
  /[ \t]*(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{200D}\u{FE0E}\u{FE0F}\u{20E3}])+[ \t]*/gu

function semEmoji(texto: string): string {
  return texto.replace(TECLA, '$1').replace(EMOJI, (m: string, i: number, s: string) => {
    const antes = s[i - 1]
    const depois = s[i + m.length]
    // comeco/fim de linha ou pontuacao logo depois: nao sobra espaco nenhum
    if (antes === undefined || antes === '\n' || depois === undefined || depois === '\n' || /[,.!?;:)]/.test(depois)) return ''
    return ' '
  })
}

// Comeco do texto, comeco de linha e depois de . ! ? com espaco: a primeira letra minuscula ali
// (o resto da palavra so e olhado, nao consumido, pra o ". " seguinte ainda valer).
const INICIO_DE_FRASE = /(^|\n|[.!?][ \t\n]+)([ \t]*)(\p{Ll})(?=(\S*))/gu

function comMaiuscula(texto: string): string {
  return texto.replace(INICIO_DE_FRASE, (_m: string, sep: string, esp: string, letra: string, resto: string) => {
    // link, e-mail, placa, valor, 21Go: palavra com digito ou cara de endereco fica como esta
    const intocavel = /\d|@|:\/\/|^www\./i.test(letra + resto)
    return sep + esp + (intocavel ? letra : letra.toUpperCase())
  })
}

export function aplicarEstilo(texto: string, estilo: EstiloDoBot | undefined): string {
  if (!estilo) return texto
  let t = texto
  if (estilo.semEmoji) t = semEmoji(t)
  if (estilo.maiuscula) t = comMaiuscula(t)
  return t
}
