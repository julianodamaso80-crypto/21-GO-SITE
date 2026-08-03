/**
 * Validação de placa do formulário de cotação.
 *
 * Filosofia (ordem do dono, 03/08/2026): a placa é OBRIGATÓRIA pra veículo
 * usado — é o que separa cliente de curioso —, mas a validação **não pode
 * travar o negócio**. Então:
 *
 *   - formato errado ou placa obviamente inventada  → bloqueia (é digitação
 *     preguiçosa, não cliente de verdade);
 *   - placa bem formada que a base não confirma      → só avisa, deixa seguir.
 *     Base fora do ar, veículo recém-emplacado e placa de outro estado são
 *     casos reais demais pra barrar alguém por isso.
 *
 * Client-safe.
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
 * Placas que ninguém digita por engano — são chute pra pular o campo.
 * Deliberadamente conservador: na dúvida deixa passar, porque barrar cliente
 * de verdade custa muito mais caro que deixar um curioso entrar.
 */
export function isPlacaObviouslyFake(v: string): boolean {
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

/**
 * Erro de placa pra exibir no formulário, ou null quando pode seguir.
 * `obrigatoria` é true pra veículo usado e false pra zero km.
 */
export function validatePlaca(v: string, obrigatoria: boolean): string | null {
  const p = normalizePlaca(v)

  if (!p) {
    return obrigatoria ? 'Informe a placa do veículo' : null
  }
  if (p.length < 7) return 'Placa incompleta — são 7 caracteres (ex: RIO2A18)'
  if (!isPlacaFormatValid(p)) return 'Placa inválida. Use o formato ABC1D23 ou ABC1234'
  if (isPlacaObviouslyFake(p)) return 'Essa placa não parece real. Digite a placa do seu veículo'

  return null
}
