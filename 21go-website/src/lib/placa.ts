/**
 * Validação de placa do formulário de cotação.
 *
 * REGRA MAIOR (ordem do dono, 03/08/2026): **nunca bloquear placa que existe.**
 * Perder um cliente real custa infinitamente mais caro que deixar um curioso
 * entrar. Por isso a única coisa que bloqueia de verdade é o que não pode ser
 * placa de jeito nenhum: vazia, incompleta ou fora dos dois formatos oficiais.
 *
 * Padrão suspeito (AAA1111, ABC1234, ...) NÃO bloqueia sozinho — placas assim
 * existem de verdade, são poucas mas existem. O que acontece com elas:
 *
 *   1. a base do PowerCRM confirma a placa  → segue direto, nem avisa;
 *   2. a base não confirma                  → pede uma confirmação de 1 toque
 *      ("é essa mesmo a minha placa") e libera;
 *   3. a base está fora do ar               → segue, sem atrito nenhum.
 *
 * Ou seja: a heurística vira FRICÇÃO pro curioso, nunca PORTA FECHADA pro
 * cliente. Client-safe.
 */

/** Placa antiga: ABC1234 */
const RE_ANTIGA = /^[A-Z]{3}\d{4}$/
/** Placa Mercosul: ABC1D23 */
const RE_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/

/** Normaliza pra comparação: maiúsculas, só letra e número. */
export function normalizePlaca(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isPlacaFormatValid(v: string): boolean {
  const p = normalizePlaca(v)
  return RE_ANTIGA.test(p) || RE_MERCOSUL.test(p)
}

function allEqual(s: string): boolean {
  return s.length > 1 && new Set(s).size === 1
}

/** "ABC" / "1234" — caracteres em sequência consecutiva. */
function isSequential(s: string): boolean {
  if (s.length < 3) return false
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== 1) return false
  }
  return true
}

/**
 * Padrão de placa que costuma ser chute pra pular o campo.
 *
 * ATENÇÃO: isto é um SINAL, não um veredito. Placas assim existem de verdade
 * (BBB2222 e ABC1234 são combinações válidas que algum estado já emitiu), então
 * quem chama NUNCA deve bloquear só por causa disto — ver `validatePlaca` e o
 * fluxo de confirmação na página de cotação.
 */
export function isPlacaSuspeita(v: string): boolean {
  const p = normalizePlaca(v)
  const letras = p.replace(/\d/g, '')
  const digitos = p.replace(/\D/g, '')

  // ABC1D23 e ABC1234 são os exemplos que o próprio site mostra no placeholder
  if (p === 'ABC1D23' || p === 'ABC1234') return true
  // AAA1111, XXX0000, AAA1A11…
  if (allEqual(letras) && allEqual(digitos)) return true
  // qualquer coisa + 0000
  if (digitos === '0000' || digitos === '000') return true
  // ABC1234 genérico: letras e números ambos em sequência
  if (isSequential(letras) && isSequential(digitos)) return true

  return false
}

export type PlacaProblema =
  /** Não pode ser placa nenhuma — barra e pronto. */
  | { level: 'block'; msg: string }
  /** Parece chute, mas pode ser real — pede 1 toque de confirmação, não barra. */
  | { level: 'confirm'; msg: string }

/**
 * Problema da placa, ou null quando pode seguir.
 *
 * @param obrigatoria  true pra veículo usado, false pra zero km
 * @param jaConfirmada base confirmou a placa OU o cliente disse que é a dele —
 *                     nesse caso o padrão suspeito é ignorado por completo
 */
export function validatePlaca(
  v: string,
  obrigatoria: boolean,
  jaConfirmada = false,
): PlacaProblema | null {
  const p = normalizePlaca(v)

  if (!p) {
    return obrigatoria ? { level: 'block', msg: 'Informe a placa do veículo' } : null
  }
  if (p.length < 7) {
    return { level: 'block', msg: 'Placa incompleta — são 7 caracteres (ex: RIO2A18)' }
  }
  if (!isPlacaFormatValid(p)) {
    return { level: 'block', msg: 'Placa inválida. Use o formato ABC1D23 ou ABC1234' }
  }
  if (!jaConfirmada && isPlacaSuspeita(p)) {
    return {
      level: 'confirm',
      msg: 'Essa placa parece um exemplo. Se for mesmo a do seu veículo, é só confirmar.',
    }
  }

  return null
}
