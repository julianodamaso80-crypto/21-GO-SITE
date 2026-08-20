import { NextRequest, NextResponse } from 'next/server'
import { conferirSenha } from '@/lib/painel/senha'
import { assinarSessao, DURACAO_SESSAO_MS } from '@/lib/painel/sessao'
import { buscarPorEmail, marcarLogin } from '@/lib/painel/usuarios'
import { COOKIE_SESSAO, consultorDoHost, segredoSessao } from '@/lib/painel/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Freio de forca bruta em memoria. Container unico, entao memoria basta — criar
 * tabela pra isso seria carga a mais num banco que ja e compartilhado com o CRM.
 */
const JANELA_MS = 15 * 60 * 1000
const LIMITE = 5
const tentativas = new Map<string, { n: number; ate: number }>()

function bloqueado(chave: string): boolean {
  const t = tentativas.get(chave)
  if (!t || t.ate < Date.now()) {
    tentativas.delete(chave)
    return false
  }
  return t.n >= LIMITE
}

function registrarFalha(chave: string): void {
  const t = tentativas.get(chave)
  if (!t || t.ate < Date.now()) tentativas.set(chave, { n: 1, ate: Date.now() + JANELA_MS })
  else t.n++
}

export async function POST(req: NextRequest) {
  const slug = consultorDoHost(req)
  if (!slug) return NextResponse.json({ erro: 'host_invalido' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { email?: string; senha?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  const senha = body.senha ?? ''
  if (!email || !senha) return NextResponse.json({ erro: 'dados_invalidos' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'sem-ip'
  const chave = `${slug}:${email}:${ip}`
  if (bloqueado(chave)) return NextResponse.json({ erro: 'muitas_tentativas' }, { status: 429 })

  const usuario = await buscarPorEmail(slug, email)
  // Mesma resposta pra e-mail que nao existe e senha errada: dizer qual dos dois
  // entrega a lista de quem tem acesso ao painel.
  if (!usuario || !usuario.ativo || !conferirSenha(senha, usuario.senhaHash)) {
    registrarFalha(chave)
    return NextResponse.json({ erro: 'credenciais_invalidas' }, { status: 401 })
  }

  tentativas.delete(chave)
  await marcarLogin(usuario.id)

  const token = assinarSessao(
    {
      uid: usuario.id,
      slug,
      papel: usuario.papel,
      v: usuario.tokenVersao,
      exp: Date.now() + DURACAO_SESSAO_MS,
    },
    segredoSessao(),
  )

  const res = NextResponse.json({ ok: true, papel: usuario.papel })
  // Sem `domain`: o cookie fica preso a este subdominio, entao sessao de um
  // parceiro nao viaja pro subdominio de outro.
  res.cookies.set(COOKIE_SESSAO, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  /**
   * So pra TELA saber o que mostrar (esconder a aba "Equipe" de quem nao e
   * dono). Nao e httpOnly de proposito e nao vale como permissao: quem decide
   * continua sendo a sessao assinada, conferida no servidor a cada rota.
   */
  res.cookies.set('painel_papel', usuario.papel, {
    path: '/',
    sameSite: 'lax',
    secure: true,
    maxAge: DURACAO_SESSAO_MS / 1000,
  })
  return res
}
