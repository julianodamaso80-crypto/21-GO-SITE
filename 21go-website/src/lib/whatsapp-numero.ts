/**
 * Validação de celular brasileiro — a barreira de formato, antes de qualquer
 * chamada de rede.
 *
 * A validação que existia (11 dígitos, DDD entre 11 e 99, terceiro dígito 9)
 * deixava passar DDD que não existe no Brasil (20, 23, 25, 26, 29, 36, 39...)
 * e sequência repetida (21999999999). Número morto não é só lead perdido: cada
 * envio pra número inexistente é sinal de disparo em massa pro WhatsApp, e é
 * assim que chip cai.
 *
 * Client-safe: sem `node:*`, roda no browser e no servidor.
 */

/** Os 67 DDDs que existem de fato (Anatel). Fora desta lista, não existe. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 87, // PE
  82, // AL
  83, // PB
  84, // RN
  85, 88, // CE
  86, 89, // PI
  91, 93, 94, // PA
  92, 97, // AM
  95, // RR
  96, // AP
  98, 99, // MA
])

/** Só dígitos, sem o 55 do país. */
export function apenasDigitosNacionais(v: string): string {
  const d = v.replace(/\D/g, '')
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d
}

/**
 * Devolve a mensagem de erro, ou `null` se o formato está de pé.
 * A mensagem é a que o cliente lê no campo — direta, sem jargão.
 */
export function validarFormatoWhatsApp(v: string): string | null {
  const digits = apenasDigitosNacionais(v)

  if (digits.length !== 11) {
    return 'WhatsApp incompleto. Informe DDD + 9 dígitos'
  }
  if (!DDDS_VALIDOS.has(parseInt(digits.slice(0, 2), 10))) {
    return 'DDD inválido'
  }
  if (digits[2] !== '9') {
    return 'Celular deve começar com 9 depois do DDD'
  }
  // 21999999999, 11888888888 — dígito repetido nas 9 casas do número.
  if (/^(\d)\1{8}$/.test(digits.slice(2))) {
    return 'Confira o número — esse não parece um WhatsApp real'
  }

  return null
}
