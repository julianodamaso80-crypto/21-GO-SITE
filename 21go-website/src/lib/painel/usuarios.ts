import 'server-only'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '../supabase-admin'
import { ROTAS_RESERVADAS } from '../rotas-reservadas'
import { hashSenha, gerarSenha } from './senha'
import { slugDeVendedor } from './slug'
import type { Papel } from './sessao'

export interface UsuarioPainel {
  id: string
  consultorSlug: string
  papel: Papel
  nome: string
  email: string
  whatsapp: string | null
  vendedorSlug: string
  tokenVersao: number
  ativo: boolean
  criadoEm: string
  ultimoLoginEm: string | null
}

const COLUNAS =
  'id, consultor_slug, papel, nome, email, whatsapp, vendedor_slug, token_versao, ativo, criado_em, ultimo_login_em'

function daLinha(l: Record<string, unknown>): UsuarioPainel {
  return {
    id: l.id as string,
    consultorSlug: l.consultor_slug as string,
    papel: l.papel as Papel,
    nome: l.nome as string,
    email: l.email as string,
    whatsapp: (l.whatsapp as string) ?? null,
    vendedorSlug: l.vendedor_slug as string,
    tokenVersao: l.token_versao as number,
    ativo: l.ativo as boolean,
    criadoEm: l.criado_em as string,
    ultimoLoginEm: (l.ultimo_login_em as string) ?? null,
  }
}

export async function buscarPorEmail(
  consultorSlug: string,
  email: string,
): Promise<(UsuarioPainel & { senhaHash: string }) | null> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(`${COLUNAS}, senha_hash`)
    .eq('consultor_slug', consultorSlug)
    .ilike('email', email.trim())
    .maybeSingle()

  // O client do Supabase NAO lanca em falha de HTTP: sem este throw, banco fora
  // do ar viraria "senha incorreta" e o dono passaria a tarde tentando entrar.
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...daLinha(data), senhaHash: data.senha_hash as string }
}

export async function buscarPorId(id: string, consultorSlug: string): Promise<UsuarioPainel | null> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(COLUNAS)
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? daLinha(data) : null
}

export async function listarUsuarios(consultorSlug: string): Promise<UsuarioPainel[]> {
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .select(COLUNAS)
    .eq('consultor_slug', consultorSlug)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(daLinha)
}

export async function criarUsuario(a: {
  consultorSlug: string
  nome: string
  email: string
  whatsapp: string | null
  senha: string
  papel?: Papel
}): Promise<UsuarioPainel> {
  const existentes = new Set((await listarUsuarios(a.consultorSlug)).map((u) => u.vendedorSlug))
  const vendedorSlug = slugDeVendedor({
    nome: a.nome,
    whatsapp: a.whatsapp ?? '',
    existentes,
    reservadas: ROTAS_RESERVADAS,
  })
  if (!vendedorSlug) throw new Error('nome_invalido')

  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .insert({
      id: `pu_${randomBytes(9).toString('hex')}`,
      consultor_slug: a.consultorSlug,
      papel: a.papel ?? 'vendedor',
      nome: a.nome.trim(),
      email: a.email.trim().toLowerCase(),
      whatsapp: a.whatsapp,
      senha_hash: hashSenha(a.senha),
      vendedor_slug: vendedorSlug,
    })
    .select(COLUNAS)
    .single()

  // 23505 = unique violation. O unico unique que a pessoa consegue provocar e o
  // do e-mail — o slug ja foi desempatado acima.
  if (error) throw new Error(error.code === '23505' ? 'email_em_uso' : error.message)
  return daLinha(data)
}

export async function atualizarUsuario(
  id: string,
  consultorSlug: string,
  patch: { nome?: string; email?: string; whatsapp?: string | null },
): Promise<UsuarioPainel> {
  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.nome !== undefined) campos.nome = patch.nome.trim()
  if (patch.email !== undefined) campos.email = patch.email.trim().toLowerCase()
  if (patch.whatsapp !== undefined) campos.whatsapp = patch.whatsapp

  // O `vendedor_slug` NAO entra aqui, nunca. Ele foi impresso, postado e mandado
  // em grupo — trocar quebra tudo que a pessoa ja divulgou.
  const { data, error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update(campos)
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
    .select(COLUNAS)
    .single()
  if (error) throw new Error(error.code === '23505' ? 'email_em_uso' : error.message)
  return daLinha(data)
}

/** Devolve a senha em claro pra tela mostrar — ela nao existe em outro lugar. */
export async function redefinirSenha(
  id: string,
  consultorSlug: string,
  senha?: string,
): Promise<string> {
  const nova = senha && senha.length >= 8 ? senha : gerarSenha()
  const usuario = await buscarPorId(id, consultorSlug)
  if (!usuario) throw new Error('nao_encontrado')

  const { error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update({
      senha_hash: hashSenha(nova),
      // Derruba as sessoes vivas: quem estava logado com a senha antiga sai.
      token_versao: usuario.tokenVersao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
  if (error) throw new Error(error.message)
  return nova
}

/**
 * Exclusao e SOFT de proposito: apagar a linha soltaria o `vendedor_slug` pra
 * outra pessoa e reescreveria o historico de quem trouxe cada lead.
 */
export async function desativarUsuario(
  id: string,
  consultorSlug: string,
  ativo = false,
): Promise<void> {
  const usuario = await buscarPorId(id, consultorSlug)
  if (!usuario) throw new Error('nao_encontrado')
  if (usuario.papel === 'admin' && !ativo) throw new Error('admin_nao_desativa')

  const { error } = await supabaseAdmin()
    .from('painel_usuarios')
    .update({
      ativo,
      token_versao: usuario.tokenVersao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('consultor_slug', consultorSlug)
  if (error) throw new Error(error.message)
}

export async function marcarLogin(id: string): Promise<void> {
  await supabaseAdmin()
    .from('painel_usuarios')
    .update({ ultimo_login_em: new Date().toISOString() })
    .eq('id', id)
}
