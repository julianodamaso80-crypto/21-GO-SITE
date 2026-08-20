import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { listarUsuarios } from './usuarios'
import { mascararTelefone, formatarTelefone } from './formato'

/**
 * O que o painel mostra. Tudo sai da tabela `leads`, filtrando por
 * `consultor_slug` — a coluna que a migracao 276 criou justamente pra isto.
 *
 * "Fechado" e "perdido" nao sao chute nosso: e o `status` que o webhook do
 * PowerCRM ja escreve quando a negociacao fecha ou morre la.
 */

export interface LeadPainel {
  id: string
  criadoEm: string
  nome: string
  telefone: string
  veiculo: string
  valorMensal: number | null
  plano: string | null
  etapa: string
  vendedorSlug: string | null
  vendedorNome: string | null
}

export interface Resumo {
  total: number
  noMes: number
  hoje: number
  ganhos: number
  perdidos: number
  emNegociacao: number
  /**
   * As duas origens, separadas — e a pergunta que o dono do painel faz primeiro:
   * "quanto veio do meu site e quanto a minha rede me trouxe?".
   */
  doSite: { total: number; noMes: number; ganhos: number }
  deIndicacao: { total: number; noMes: number; ganhos: number }
  porVendedor: { slug: string; nome: string; total: number; noMes: number; ganhos: number }[]
}

const COLUNAS_LEAD =
  'id, created_at, nome, telefone, marca_interesse, modelo_interesse, ano_interesse, cotacao_valor, cotacao_plano, status, etapa_funil, vendedor_slug'

function inicioDoMes(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

function inicioDoDia(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

function etapaLegivel(status: string | null, etapa: string | null): string {
  if (status === 'convertido') return 'Fechado'
  if (status === 'perdido') return 'Perdido'
  if (etapa && etapa !== 'novo') return 'Em negociação'
  return 'Novo'
}

function veiculoDe(l: Record<string, unknown>): string {
  const partes = [l.marca_interesse, l.modelo_interesse, l.ano_interesse].filter(Boolean)
  return partes.length ? partes.join(' ') : '—'
}

export async function resumoDoPainel(
  consultorSlug: string,
  vendedorSlug: string | null,
): Promise<Resumo> {
  let q = supabaseAdmin()
    .from('leads')
    .select('created_at, status, etapa_funil, vendedor_slug')
    .eq('consultor_slug', consultorSlug)
  // Vendedor so ve o que ele mesmo trouxe. O recorte sai da SESSAO, nunca de
  // parametro da URL.
  if (vendedorSlug) q = q.eq('vendedor_slug', vendedorSlug)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as Record<string, unknown>[]

  const mes = inicioDoMes()
  const dia = inicioDoDia()
  const contar = (f: (l: Record<string, unknown>) => boolean) => linhas.filter(f).length

  const resumo: Resumo = {
    total: linhas.length,
    noMes: contar((l) => (l.created_at as string) >= mes),
    hoje: contar((l) => (l.created_at as string) >= dia),
    ganhos: contar((l) => l.status === 'convertido'),
    perdidos: contar((l) => l.status === 'perdido'),
    emNegociacao: contar(
      (l) => l.status !== 'convertido' && l.status !== 'perdido' && l.etapa_funil !== 'novo',
    ),
    doSite: { total: 0, noMes: 0, ganhos: 0 },
    deIndicacao: { total: 0, noMes: 0, ganhos: 0 },
    porVendedor: [],
  }

  const doSite = linhas.filter((l) => !l.vendedor_slug)
  const deIndicacao = linhas.filter((l) => !!l.vendedor_slug)
  const fatia = (ls: Record<string, unknown>[]) => ({
    total: ls.length,
    noMes: ls.filter((l) => (l.created_at as string) >= mes).length,
    ganhos: ls.filter((l) => l.status === 'convertido').length,
  })
  resumo.doSite = fatia(doSite)
  resumo.deIndicacao = fatia(deIndicacao)

  if (vendedorSlug) return resumo

  const usuarios = await listarUsuarios(consultorSlug, { incluirExcluidos: true })
  const nomePorSlug = new Map(usuarios.map((u) => [u.vendedorSlug, u.nome]))

  const chaves = new Set<string>([
    ...usuarios.filter((u) => u.papel === 'vendedor').map((u) => u.vendedorSlug),
    ...linhas.map((l) => (l.vendedor_slug as string) ?? '').filter(Boolean),
  ])

  resumo.porVendedor = [...chaves]
    .map((slug) => {
      const dele = linhas.filter((l) => l.vendedor_slug === slug)
      return {
        slug,
        nome: nomePorSlug.get(slug) ?? slug,
        total: dele.length,
        noMes: dele.filter((l) => (l.created_at as string) >= mes).length,
        ganhos: dele.filter((l) => l.status === 'convertido').length,
      }
    })
    .sort((a, b) => b.noMes - a.noMes || b.total - a.total)

  return resumo
}

export async function leadsDoPainel(a: {
  consultorSlug: string
  vendedorSlug: string | null
  de?: string | null
  ate?: string | null
  pagina?: number
  porPagina?: number
  mascarar: boolean
  /** `site` = veio direto do link do consultor · `indicacao` = alguem trouxe. */
  origem?: 'site' | 'indicacao' | null
}): Promise<{ itens: LeadPainel[]; total: number }> {
  const porPagina = Math.min(a.porPagina ?? 50, 200)
  const pagina = Math.max(a.pagina || 1, 1)
  const inicio = (pagina - 1) * porPagina

  let q = supabaseAdmin()
    .from('leads')
    .select(COLUNAS_LEAD, { count: 'exact' })
    .eq('consultor_slug', a.consultorSlug)
    .order('created_at', { ascending: false })
    .range(inicio, inicio + porPagina - 1)

  if (a.vendedorSlug) q = q.eq('vendedor_slug', a.vendedorSlug)
  if (a.origem === 'site') q = q.is('vendedor_slug', null)
  if (a.origem === 'indicacao') q = q.not('vendedor_slug', 'is', null)
  if (a.de) q = q.gte('created_at', a.de)
  if (a.ate) q = q.lte('created_at', a.ate)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const usuarios = await listarUsuarios(a.consultorSlug, { incluirExcluidos: true })
  const nomePorSlug = new Map(usuarios.map((u) => [u.vendedorSlug, u.nome]))

  const itens = ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
    id: l.id as string,
    criadoEm: l.created_at as string,
    nome: (l.nome as string) ?? '—',
    telefone: a.mascarar
      ? mascararTelefone((l.telefone as string) ?? '')
      : formatarTelefone((l.telefone as string) ?? ''),
    veiculo: veiculoDe(l),
    valorMensal: (l.cotacao_valor as number) ?? null,
    plano: (l.cotacao_plano as string) ?? null,
    etapa: etapaLegivel((l.status as string) ?? null, (l.etapa_funil as string) ?? null),
    vendedorSlug: (l.vendedor_slug as string) ?? null,
    vendedorNome: l.vendedor_slug
      ? (nomePorSlug.get(l.vendedor_slug as string) ?? (l.vendedor_slug as string))
      : null,
  }))

  return { itens, total: count ?? itens.length }
}
