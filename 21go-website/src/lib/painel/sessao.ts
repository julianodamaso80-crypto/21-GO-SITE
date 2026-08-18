import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Sessao do painel num cookie assinado, sem tabela de sessao.
 *
 * O `v` e o `token_versao` do usuario. Excluir, desativar ou redefinir a senha
 * incrementa a coluna — e toda sessao viva daquela pessoa morre no request
 * seguinte, sem precisar cacar token nenhum.
 */

export type Papel = 'admin' | 'vendedor'

export interface Sessao {
  uid: string
  slug: string
  papel: Papel
  v: number
  /** Epoch em ms. */
  exp: number
}

export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000

function assinar(carga: string, segredo: string): string {
  return createHmac('sha256', segredo).update(carga).digest('base64url')
}

export function assinarSessao(s: Sessao, segredo: string): string {
  const carga = Buffer.from(JSON.stringify(s)).toString('base64url')
  return `${carga}.${assinar(carga, segredo)}`
}

export function lerSessao(token: string, segredo: string, agora = Date.now()): Sessao | null {
  try {
    const partes = token.split('.')
    if (partes.length !== 2) return null
    const [carga, assinatura] = partes

    const esperada = Buffer.from(assinar(carga, segredo))
    const recebida = Buffer.from(assinatura)
    if (esperada.length !== recebida.length) return null
    if (!timingSafeEqual(esperada, recebida)) return null

    const s = JSON.parse(Buffer.from(carga, 'base64url').toString()) as Sessao
    if (!s?.uid || !s?.slug || (s.papel !== 'admin' && s.papel !== 'vendedor')) return null
    if (typeof s.exp !== 'number' || s.exp <= agora) return null
    return s
  } catch {
    return null
  }
}
