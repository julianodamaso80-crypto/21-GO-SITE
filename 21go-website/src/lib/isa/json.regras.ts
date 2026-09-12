/**
 * Leitura tolerante do JSON que a IA devolve — logica pura.
 *
 * Eval de 12/09/2026: o Gemini 3.1 Pro escreveu quebra de linha CRUA dentro de "resposta" em 24 de
 * 45 respostas, e o 2.5 Flash em 1 de 45. `JSON.parse` estoura, o worker registra "erro" e o
 * cliente fica SEM RESPOSTA, em silencio. Aqui: cerca, controle dentro de string, e por fim a
 * extracao campo a campo. So devolve null quando nao ha nem um "resposta" reconhecivel.
 */

function tentar(texto: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(texto) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Troca \n, \r e \t crus por escapes, so DENTRO de strings JSON. */
export function escaparControlesEmStrings(texto: string): string {
  let out = ''
  let emString = false
  let escapando = false
  for (const ch of texto) {
    if (emString) {
      if (escapando) {
        out += ch
        escapando = false
        continue
      }
      if (ch === '\\') {
        out += ch
        escapando = true
        continue
      }
      if (ch === '"') {
        emString = false
        out += ch
        continue
      }
      if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += ''
      else if (ch === '\t') out += '\\t'
      else out += ch
      continue
    }
    if (ch === '"') emString = true
    out += ch
  }
  return out
}

function semCerca(bruto: string): string {
  return bruto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

/** Ultimo recurso: pega cada campo por regex no texto ja escapado. */
function extrairCampos(texto: string): Record<string, unknown> | null {
  const campo = (nome: string) => {
    const m = texto.match(new RegExp(`"${nome}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
    if (!m) return undefined
    try {
      return JSON.parse(`"${m[1]}"`) as string
    } catch {
      return m[1]
    }
  }
  const resposta = campo('resposta')
  if (resposta === undefined) return null
  const out: Record<string, unknown> = { resposta }
  for (const n of ['pronta', 'gatilho', 'genero', 'placa']) {
    const v = campo(n)
    if (v !== undefined) out[n] = v
  }
  for (const n of ['leilao', 'app']) {
    const m = texto.match(new RegExp(`"${n}"\\s*:\\s*(true|false)`))
    if (m) out[n] = m[1] === 'true'
  }
  return out
}

export function lerJsonTolerante(bruto: string): Record<string, unknown> | null {
  const limpo = semCerca(bruto || '')
  if (!limpo) return null
  const direto = tentar(limpo)
  if (direto) return direto
  const escapado = escaparControlesEmStrings(limpo)
  const depois = tentar(escapado)
  if (depois) return depois
  // Texto antes/depois do objeto ("aqui está: {...}")
  const i = escapado.indexOf('{')
  const f = escapado.lastIndexOf('}')
  if (i >= 0 && f > i) {
    const miolo = tentar(escapado.slice(i, f + 1))
    if (miolo) return miolo
  }
  return extrairCampos(escapado)
}
