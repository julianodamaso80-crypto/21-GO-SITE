import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { PAINEL_POR_HOST } from '../consultores-painel'
import { painelDoHost } from './rotas'
import { lerSessao, type Sessao, type Papel } from './sessao'
import { buscarPorId } from './usuarios'

export const COOKIE_SESSAO = 'painel_sess'

/**
 * O segredo que assina a sessao.
 *
 * Com `PAINEL_SESSAO_SEGREDO` no ambiente, usa ele. Sem, deriva da service role
 * key: e o unico jeito de o painel funcionar mesmo que alguem suba o container
 * sem lembrar da variavel nova — e o efeito de a chave girar um dia e so todo
 * mundo precisar entrar de novo, nao o painel quebrar.
 */
export function segredoSessao(): string {
  const explicito = process.env.PAINEL_SESSAO_SEGREDO
  if (explicito) return explicito
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('sem segredo pra assinar sessao do painel')
  return createHash('sha256').update(`painel:${base}`).digest('hex')
}

/** O consultor dono do host da requisicao. */
export function consultorDoHost(req: NextRequest): string | null {
  return painelDoHost(req.headers.get('host') ?? '', PAINEL_POR_HOST)
}

/**
 * Sessao valida OU null. Confere quatro coisas: assinatura, validade, se o slug
 * bate com o host (sessao de um parceiro nao vale no subdominio de outro) e se
 * o `token_versao` ainda e o mesmo — e o que faz excluir usuario derrubar a
 * sessao dele no request seguinte.
 */
export async function sessaoDaRequisicao(req: NextRequest): Promise<Sessao | null> {
  const token = req.cookies.get(COOKIE_SESSAO)?.value
  const slugDoHost = consultorDoHost(req)
  if (!token || !slugDoHost) return null

  const sessao = lerSessao(token, segredoSessao())
  if (!sessao || sessao.slug !== slugDoHost) return null

  const usuario = await buscarPorId(sessao.uid, sessao.slug)
  if (!usuario || !usuario.ativo || usuario.tokenVersao !== sessao.v) return null
  return sessao
}

export class SemPermissao extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'nao_autenticado' : 'sem_permissao')
  }
}

export async function exigirSessao(req: NextRequest, papel?: Papel): Promise<Sessao> {
  const sessao = await sessaoDaRequisicao(req)
  if (!sessao) throw new SemPermissao(401)
  if (papel && sessao.papel !== papel) throw new SemPermissao(403)
  return sessao
}
