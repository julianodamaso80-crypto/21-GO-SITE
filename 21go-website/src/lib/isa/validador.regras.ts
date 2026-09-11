/**
 * A trava que impede a Isa de inventar numero. Regra do dono: "nunca inventar valores".
 *
 * Toda resposta gerada pela IA passa aqui antes de sair: cada "R$ ...", cada "...%" e cada valor
 * com centavos ("437,00") tem que estar na lista calculada em fatos.regras.ts. Numero fora da
 * lista = a resposta nao sai (o cerebro reescreve uma vez; se falhar de novo, a Isa pausa e
 * chama o dono). Ano, km e horas nao sao dinheiro e nao sao checados.
 */

export interface Permitidos {
  dinheiro: number[]
  pct: number[]
}

const TOLERANCIA = 0.011

function paraNumero(bruto: string): number {
  // 1.550 → 1550 · 437,00 → 437 · 19,9 → 19.9
  return Number(bruto.replace(/\./g, '').replace(',', '.'))
}

export function extrairNumeros(texto: string): { dinheiro: number[]; pct: number[] } {
  const dinheiro: number[] = []
  const pct: number[] = []
  const usados: [number, number][] = []

  // "R$ 50 mil", "R$ 1.550", "R$ 437,00", "R$437"
  for (const m of texto.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(\s*mil\b)?/gi)) {
    const v = paraNumero(m[1]) * (m[2] ? 1000 : 1)
    dinheiro.push(Math.round(v * 100) / 100)
    usados.push([m.index!, m.index! + m[0].length])
  }
  // valor com centavos sem R$: "415,15"
  for (const m of texto.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d%])/g)) {
    const i = m.index!
    if (usados.some(([a, b]) => i >= a && i < b)) continue
    dinheiro.push(paraNumero(m[1]))
  }
  for (const m of texto.matchAll(/(\d{1,3}(?:,\d+)?)\s*%/g)) {
    pct.push(paraNumero(m[1]))
  }
  return { dinheiro, pct }
}

const formataDinheiro = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Telefone escrito pela IA (11/09/2026: ela inventou "0800 2100 021"). Numero de contato so sai
 * pelo codigo (link da Leticya); na resposta da IA, qualquer telefone barra. Sequencia de 8+
 * digitos separados por espaco, ponto, hifen ou parenteses — sem virgula e sem R$ na frente,
 * pra nao pegar dinheiro ("R$ 116.540,00").
 */
export function extrairTelefones(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/(?<![\p{L}\d,_])\(?\d[\d\s().-]{6,}\d(?![\p{L}\d,_])/gu)) {
    const antes = texto.slice(Math.max(0, m.index! - 4), m.index!)
    if (/R\$\s*$/.test(antes)) continue
    if (m[0].replace(/\D/g, '').length >= 8) out.push(m[0].trim())
  }
  return out
}

export function validarNumeros(texto: string, permitidos: Permitidos): { ok: boolean; invalidos: string[] } {
  const { dinheiro, pct } = extrairNumeros(texto)
  const perto = (lista: number[], v: number) => lista.some((p) => Math.abs(p - v) < TOLERANCIA)
  const invalidos = [
    ...dinheiro.filter((v) => !perto(permitidos.dinheiro, v)).map(formataDinheiro),
    ...pct.filter((v) => !perto(permitidos.pct, v)).map((v) => `${v}%`),
    ...extrairTelefones(texto).map((t) => `telefone ${t}`),
  ]
  return { ok: invalidos.length === 0, invalidos: [...new Set(invalidos)] }
}
