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

/** Mais que isso a Isa nao lista: pede um detalhe (cortar a lista esconderia a versao dele). */
export const MAX_OPCOES = 6

// O cliente fala "manual", "automatico", "turbo", "sedan", "premier"; o Power escreve "Mec.",
// "Aut.", "TB", "SED.", "PREM.". Os dois lados passam por aqui antes de comparar.
const SINONIMOS: Record<string, string> = {
  MANUAL: 'MEC', MECANICO: 'MEC', MECANICA: 'MEC', MT: 'MEC',
  AUTOMATICO: 'AUT', AUTOMATICA: 'AUT', AUTO: 'AUT', AT: 'AUT',
  TURBO: 'TB', SEDAN: 'SED', PREMIER: 'PREM', PREMIERE: 'PREM',
}
const palavrasDe = (s: string) => norm(s).split(' ').filter((p) => p.length >= 2).map((p) => SINONIMOS[p] ?? p)

/**
 * Versoes que batem com o que o cliente disse.
 *  1) Todas as palavras da versao estao no que ele disse (ele mandou o nome completo, com ou sem
 *     marca e ano) → so a mais especifica. Teste do dono de 11/09/2026: mandou "ONIX HATCH ACTIV
 *     1.0 12V TB Flex 5p Aut." e a Isa achou 14 e pediu o nome de novo.
 *  2) Senao, so as que MAIS batem (empate no topo), nunca tudo que tem uma palavra em comum.
 * O nome do modelo (1a palavra da versao) tem que ter sido dito — "plus" sozinho nao acha um Onix.
 */
export function filtrarVersoes<T extends ItemPower>(modelos: T[], dito: string): T[] {
  const palavras = palavrasDe(dito)
  if (palavras.length === 0) return []
  const disse = new Set(palavras)
  const comModelo = modelos
    .map((m) => ({ m, nome: palavrasDe(m.text) }))
    // o nome do modelo da versao (1a palavra: ONIX) tem que ter sido dito — com ou sem a marca antes
    .filter((x) => x.nome.length > 0 && disse.has(x.nome[0]))

  const completas = comModelo.filter((x) => x.nome.length > 0 && x.nome.every((p) => disse.has(p)))
  if (completas.length) {
    const maior = Math.max(...completas.map((x) => x.nome.length))
    return completas.filter((x) => x.nome.length === maior).map((x) => x.m)
  }

  const pontuados = comModelo
    .map((x) => ({ m: x.m, pontos: palavras.filter((p) => x.nome.includes(p)).length }))
    .filter((x) => x.pontos > 0)
  if (pontuados.length === 0) return []
  const topo = Math.max(...pontuados.map((x) => x.pontos))
  return pontuados
    .filter((x) => x.pontos === topo)
    .sort((a, b) => a.m.text.localeCompare(b.m.text))
    .map((x) => x.m)
}

export function mensagemDetalhe(modelo: string, ano: number | null): string {
  // zero km nao tem documento: pede o que o cliente sabe (cambio e nome da versao)
  return `tem várias versões do ${modelo}${ano ? ` ${ano}` : ''} aqui 😃 me fala se é manual ou automático e o nome da versão, que eu acho a sua certinho`
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
