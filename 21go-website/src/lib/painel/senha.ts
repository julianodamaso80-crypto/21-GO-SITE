import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Senha do painel. `scrypt` do proprio Node em vez de bcrypt: o build roda num
 * VPS que leva de 20min a 1h e ja estourou memoria por lib pesada — dependencia
 * nativa nova ali e risco desproporcional pra um painel de um cliente.
 */

const SAL_BYTES = 16
const CHAVE_BYTES = 64

/** Sem `0/O` e sem `1/I/l`: a senha vai ser lida em print de celular. */
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz'

export function hashSenha(senha: string): string {
  const sal = randomBytes(SAL_BYTES)
  const chave = scryptSync(senha, sal, CHAVE_BYTES)
  return `scrypt$${sal.toString('hex')}$${chave.toString('hex')}`
}

export function conferirSenha(senha: string, hash: string): boolean {
  try {
    const [algoritmo, salHex, chaveHex] = hash.split('$')
    if (algoritmo !== 'scrypt' || !salHex || !chaveHex) return false
    const esperada = Buffer.from(chaveHex, 'hex')
    if (esperada.length !== CHAVE_BYTES) return false
    const calculada = scryptSync(senha, Buffer.from(salHex, 'hex'), CHAVE_BYTES)
    return timingSafeEqual(esperada, calculada)
  } catch {
    // Hash corrompido nao pode virar erro 500 na tela de login: vira "senha
    // incorreta", que e o efeito pratico correto.
    return false
  }
}

export function gerarSenha(tamanho = 8): string {
  const bytes = randomBytes(tamanho)
  let s = ''
  for (let i = 0; i < tamanho; i++) s += ALFABETO[bytes[i] % ALFABETO.length]
  return s
}
