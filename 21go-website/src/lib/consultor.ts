import 'server-only'
import { supabaseAdmin } from './supabase-admin'
import { CONSULTORES_FALLBACK } from './consultores-fallback'

/**
 * O consultor dono do site em `21go.com.br/<slug>`.
 *
 * O que muda de um site pro outro e so isto: o PowerLink (pra cotacao nascer no
 * nome dele) e o WhatsApp (pro cliente falar direto com ele). O resto do site e
 * identico — mesmo codigo, mesmo container, mesmo deploy.
 */

export interface Consultor {
  slug: string
  nome: string
  whatsapp: string
  powerlinkId: string
  status: 'pendente' | 'ativo' | 'inadimplente' | 'cancelado'
  /**
   * Esconde a taxa de ativacao do cliente (tela, PDF e mensagem).
   *
   * Opcao por consultor: tem quem prefira tratar esse valor na conversa em vez
   * de mostrar junto da mensalidade. O valor continua sendo calculado — some da
   * vista, nao da conta.
   */
  ocultarAtivacao: boolean
}

/** Serve o site normalmente. Inadimplente ainda serve — o corte e no 5o dia. */
export function estaNoAr(c: Consultor): boolean {
  return c.status === 'ativo' || c.status === 'inadimplente'
}

/**
 * Cache em memoria.
 *
 * Sem ele, TODA visita a um site de consultor vira uma consulta ao Supabase —
 * e o banco e compartilhado com o CRM, que ja derrubou a gravacao de lead do
 * site uma vez por peso de query (o UPDATE de 185k x 159k a cada 15min).
 * Site de consultor e conteudo estatico com dois campos variaveis; ler isso do
 * banco a cada pageview seria pagar caro por um dado que quase nunca muda.
 *
 * 5 minutos: curto o bastante pra um cancelamento sair do ar rapido, longo o
 * bastante pra uma campanha de trafego nao virar carga no banco.
 */
const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { valor: Consultor | null; expiraEm: number }>()

/** Cancelamento e ativacao precisam sair do ar / entrar no ar na hora. */
export function esquecerConsultor(slug: string): void {
  cache.delete(slug)
}

export async function resolverConsultor(slug: string): Promise<Consultor | null> {
  const agora = Date.now()
  const emCache = cache.get(slug)
  if (emCache && emCache.expiraEm > agora) return emCache.valor

  let valor: Consultor | null = null
  try {
    const { data, error } = await supabaseAdmin()
      .from('sites_consultor')
      .select('slug, nome, whatsapp, powerlink_id, status, ocultar_ativacao')
      .eq('slug', slug)
      .maybeSingle()

    // O cliente do Supabase NAO lanca excecao em falha de HTTP: ele devolve
    // `{ data: null, error }`. Sem este `throw`, um 503 do banco chegava aqui
    // como "data vazio" e virava "consultor nao existe" — o lead de um site
    // vendido ia calado pro numero da casa, e o null ainda era gravado no cache
    // por 5 minutos, mantendo o erro depois de o banco voltar.
    if (error) throw new Error(error.message)

    if (data) {
      valor = {
        slug: data.slug as string,
        nome: data.nome as string,
        whatsapp: data.whatsapp as string,
        powerlinkId: data.powerlink_id as string,
        status: data.status as Consultor['status'],
        ocultarAtivacao: Boolean(data.ocultar_ativacao),
      }
    }
  } catch (err) {
    // Banco fora do ar nao pode derrubar o site do consultor NEM entregar o
    // lead dele pra outra pessoa. Ordem de preferencia, da melhor pra pior:
    //   1. ultimo valor conhecido (mesmo vencido)
    //   2. espelho da tabela no codigo (consultores-fallback.ts)
    //   3. null — so pra slug que nunca existiu
    // Nada disso e gravado no cache: se gravasse, o erro sobreviveria a volta
    // do banco pelos 5 minutos do TTL.
    console.error(`[consultor] lookup de "${slug}" falhou:`, (err as Error).message)
    if (emCache) return emCache.valor
    return CONSULTORES_FALLBACK[slug] ?? null
  }

  cache.set(slug, { valor, expiraEm: agora + TTL_MS })
  return valor
}

/**
 * Slug a partir do nome: "Juliano Damaso" -> "julianodamaso".
 *
 * Sem hifen e sem acento de proposito — o consultor vai ditar esse link no
 * telefone e escrever no cartao. `21go.com.br/julianodamaso` sobrevive a isso;
 * `21go.com.br/juliano-damaso` vira reclamacao de link que nao abre.
 *
 * O `normalize('NFD')` quebra "á" em "a" + acento combinante, e o filtro
 * seguinte descarta o acento junto com o resto do que nao e letra ou numero.
 */
export function slugDoNome(nome: string): string {
  return nome.normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '')
}
