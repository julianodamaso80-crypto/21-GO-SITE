/**
 * Cotacao sem placa (zero km, ou o cliente nao sabe a placa): a Isa acha a marca no Power, lista
 * as versoes do modelo naquele ano e o CLIENTE escolhe. Nunca chutar a versao — a mesma familia
 * muda FIPE e ate "faz / nao faz" de uma versao pra outra (X1 18i nao faz, 20i faz).
 */

export interface ItemPower {
  id: number
  text: string
  back?: string | null
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const APELIDOS: Record<string, string> = { VW: 'VOLKSWAGEN', GM: 'CHEVROLET', MERCEDES: 'MERCEDES-BENZ' }

export function acharMarca<T extends ItemPower>(lista: T[], dito: string): T | null {
  const alvo = norm(APELIDOS[norm(dito)] ?? dito)
  if (!alvo) return null
  const exata = lista.find((m) => norm(m.text) === alvo)
  if (exata) return exata
  return lista.find((m) => norm(m.text).split(' ').includes(alvo) || norm(m.text).includes(alvo)) ?? null
}

const MAX_OPCOES = 6

/** Versoes cujo nome tem as palavras que o cliente disse, as mais parecidas primeiro. */
export function filtrarVersoes<T extends ItemPower>(modelos: T[], dito: string): T[] {
  const palavras = norm(dito).split(' ').filter((p) => p.length >= 2)
  if (palavras.length === 0) return []
  const pontuados = modelos
    .map((m) => {
      const nome = ` ${norm(m.text)} `
      const pontos = palavras.filter((p) => nome.includes(` ${p} `) || nome.includes(p)).length
      // a primeira palavra (o modelo) tem que estar — "plus" sozinho nao acha um Onix
      return { m, pontos, temModelo: nome.includes(palavras[0]) }
    })
    .filter((x) => x.temModelo && x.pontos > 0)
  pontuados.sort((a, b) => b.pontos - a.pontos || a.m.text.localeCompare(b.m.text))
  return pontuados.slice(0, MAX_OPCOES).map((x) => x.m)
}

const EMOJI_NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']

/** Indice (0-based) que o cliente escolheu, ou null. Aceita "2", "2️⃣", "o 3", "é a 1". */
export function escolhaDoCliente(texto: string, total: number): number | null {
  const t = texto.trim()
  const m = t.match(/^(?:(?:é|e|eh)?\s*(?:o|a)?\s*)?(\d)(?:️?⃣)?\s*[.!)]?\s*$/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= total ? n - 1 : null
}

export function mensagemVersoes(modelo: string, ano: number | null, opcoes: ItemPower[]): string {
  const cab = `achei essas versões do ${modelo}${ano ? ` ${ano}` : ''}, qual é a sua? 👇`
  const linhas = opcoes.map((o, i) => `${EMOJI_NUM[i] ?? `${i + 1}.`} ${o.text}`)
  return [cab, ...linhas, '', 'é só me mandar o número 🙏🏼'].join('\n')
}
