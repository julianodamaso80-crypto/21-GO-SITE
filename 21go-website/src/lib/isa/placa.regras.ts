/**
 * Placa na mensagem do cliente — achada pelo CODIGO, nunca pela IA.
 *
 * Bug de 11/09/2026: o dono mandou "Pyv8i13" e a IA respondeu "essa placa é de um carro Hyundai
 * HB20 Sense Plus 2020" — inventado. Ela nao preencheu o campo que dispara a consulta, entao nao
 * houve consulta no Power, nem lead, nem PDF. Placa agora e detectada aqui e vai direto pra
 * consulta; a IA nem e chamada. Logica pura.
 */

// Antiga (ABC1234) e Mercosul (ABC1D23), com ou sem hifen/espaco no meio.
const PLACA = /(?<![A-Za-z0-9])([A-Za-z]{3})[\s-]?(\d[A-Za-z0-9]\d{2})(?![A-Za-z0-9])/g

/** A ultima placa escrita no texto (normalizada), ou null. Ignora o que esta dentro de links. */
export function placaNoTexto(texto: string | null | undefined): string | null {
  const semLinks = (texto || '').replace(/https?:\/\/\S+/g, ' ')
  let achada: string | null = null
  for (const m of semLinks.matchAll(PLACA)) achada = `${m[1]}${m[2]}`.toUpperCase()
  return achada
}
