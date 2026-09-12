import 'server-only'
import { etapaDoCard } from '@/lib/isa/funil.regras'
import { planosQueAparecem } from '@/lib/isa/fatos.regras'
import { sql, type ContatoIsa } from '@/lib/isa/banco'

/**
 * Consultas do painel da Isa. So leitura aqui; as acoes (responder, ligar/desligar, transferir)
 * ficam nas rotas /api/atendimento/*.
 */

export type Aba = 'todos' | 'precisa' | 'isa' | 'off' | 'transferidos'

export interface ItemLista {
  telefone: string
  nome: string | null
  ligada: boolean
  pausa_motivo: string | null
  transferido_em: string | null
  aguardando_dono: string | null
  preco_da_tabela: boolean
  ultima: string | null
  ultima_direcao: string | null
  ultima_em: string | null
  janela_ate: string | null
  etiquetas: string[]
}

const FILTRO: Record<Aba, string> = {
  todos: 'true',
  // Pausou sozinha num gatilho (e nao foi transferido) ou esta esperando o dono decidir desconto.
  precisa: `(NOT c.ligada AND c.pausa_por = 'isa' AND c.transferido_em IS NULL) OR c.aguardando_dono IS NOT NULL`,
  isa: 'c.ligada',
  off: 'NOT c.ligada',
  transferidos: 'c.transferido_em IS NOT NULL',
}

export async function listarContatos(aba: Aba, busca: string, etiqueta = ''): Promise<ItemLista[]> {
  const termo = busca.trim()
  return sql<ItemLista>(
    `SELECT c.telefone, COALESCE(c.nome, cv.pushname) AS nome, c.ligada, c.pausa_motivo, c.transferido_em,
            c.aguardando_dono, c.preco_da_tabela, c.janela_ate, c.etiquetas,
            u.content AS ultima, u.direction AS ultima_direcao, (u.created_at AT TIME ZONE 'UTC') AS ultima_em
     FROM public.isa_contatos c
     LEFT JOIN public.conversations cv ON cv.id = c.conversation_id
     LEFT JOIN LATERAL (
       SELECT content, direction, created_at FROM public.messages m
       WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa'
       ORDER BY m.created_at DESC LIMIT 1
     ) u ON true
     WHERE c.conversation_id IS NOT NULL
       AND (${FILTRO[aba]})
       AND ($1 = '' OR c.telefone LIKE '%' || $1 || '%' OR COALESCE(c.nome, cv.pushname, '') ILIKE '%' || $1 || '%')
       AND ($2 = '' OR $2 = ANY(c.etiquetas))
     ORDER BY u.created_at DESC NULLS LAST
     LIMIT 500`,
    [termo, etiqueta],
  )
}

export interface CardFunil {
  telefone: string
  nome: string | null
  etapa: string
  /** A etapa que alguem arrastou (null = a do fluxo). */
  etapa_manual: string | null
  veiculo: string | null
  fipe: number | null
  plano: string | null
  valor: number | null
  ultima: string | null
  ultima_em: string | null
  etiquetas: string[]
  ligada: boolean
}

/**
 * Cards do funil: TODA conversa entra, com o veiculo e o plano da simulacao. A etapa vem do
 * `etapaDoCard` — o que a pessoa arrastou vence o que o fluxo calculou.
 */
export async function listarFunil(): Promise<CardFunil[]> {
  const linhas = await sql<
    Omit<CardFunil, 'etapa' | 'plano' | 'valor'> & {
      planos: { id: string; name: string; monthly: number }[] | null
      tem_simulacao: boolean
      escolheu: boolean
      documento: boolean
    }
  >(
    `SELECT c.telefone, COALESCE(c.nome, cv.pushname) AS nome, c.etapa AS etapa_manual, c.ligada, c.etiquetas,
            NULLIF(TRIM(CONCAT_WS(' ', l.marca_interesse, l.modelo_interesse, l.ano_interesse)), '') AS veiculo,
            l.valor_fipe_consultado AS fipe, l.cotacao_planos AS planos,
            u.content AS ultima, (u.created_at AT TIME ZONE 'UTC') AS ultima_em,
            (l.id IS NOT NULL) AS tem_simulacao,
            EXISTS (SELECT 1 FROM public.isa_eventos e WHERE e.telefone = c.telefone AND e.tipo = 'pediu_documentos') AS escolheu,
            (c.pausa_motivo = 'documento') AS documento
     FROM public.isa_contatos c
     LEFT JOIN public.conversations cv ON cv.id = c.conversation_id
     LEFT JOIN public.leads l ON l.id = c.lead_id
     LEFT JOIN LATERAL (
       SELECT content, created_at FROM public.messages m
       WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa'
       ORDER BY m.created_at DESC LIMIT 1
     ) u ON true
     WHERE c.conversation_id IS NOT NULL
     ORDER BY u.created_at DESC NULLS LAST
     LIMIT 500`,
  )
  return linhas.map(({ planos, ...l }) => {
    // O card mostra o plano que a Isa REALMENTE oferece pro veiculo (a mesma regra da conversa),
    // nao o plano de referencia gravado no lead.
    const doCliente = planosQueAparecem(planos || [])
    const p = doCliente[0]
    return {
      ...l,
      plano: p?.name ?? null,
      valor: p?.monthly ?? null,
      etapa: etapaDoCard({
        etapa: l.etapa_manual,
        temSimulacao: !!l.tem_simulacao,
        escolheuPlano: !!l.escolheu,
        mandouDocumento: !!l.documento,
      }),
    }
  })
}

/** Arrastou o card: a escolha da pessoa fica gravada e vence a etapa automatica. */
export async function gravarEtapa(telefone: string, etapa: string | null): Promise<void> {
  await sql(
    `UPDATE public.isa_contatos SET etapa = $2, etapa_em = CASE WHEN $2 IS NULL THEN NULL ELSE now() END, updated_at = now()
     WHERE telefone = $1`,
    [telefone, etapa],
  )
}

export async function contarPrecisa(): Promise<number> {
  const r = await sql<{ n: string }>(
    `SELECT count(*) AS n FROM public.isa_contatos c WHERE c.conversation_id IS NOT NULL AND (${FILTRO.precisa})`,
  )
  return Number(r[0]?.n ?? 0)
}

export interface ItemConversa {
  tipo: 'mensagem' | 'evento'
  em: string
  direcao?: string
  autor?: string
  conteudo?: string
  mensagem_tipo?: string
  media_id?: string | null
  evento?: string
  detalhe?: unknown
}

export async function abrirConversa(telefone: string): Promise<{ contato: ContatoIsa | null; itens: ItemConversa[] }> {
  const [contato] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!contato?.conversation_id) return { contato: contato ?? null, itens: [] }
  const msgs = await sql<{ em: string; direction: string; sender: string | null; content: string; message_type: string; media: string | null }>(
    `SELECT (created_at AT TIME ZONE 'UTC') AS em, direction, sender, content, message_type,
            COALESCE(raw_payload #>> '{entry,0,changes,0,value,messages,0,image,id}',
                     raw_payload #>> '{entry,0,changes,0,value,messages,0,document,id}') AS media
     FROM public.messages
     WHERE conversation_id = $1 AND evolution_instance = 'cloud_isa'
     ORDER BY created_at DESC LIMIT 300`,
    [contato.conversation_id],
  )
  const evs = await sql<{ em: string; tipo: string; detalhe: unknown; por: string | null }>(
    `SELECT created_at AS em, tipo, detalhe, por FROM public.isa_eventos
     WHERE telefone = $1 AND tipo NOT IN ('cerebro', 'etiquetas', 'humano_respondeu') ORDER BY id DESC LIMIT 100`,
    [telefone],
  )
  const itens: ItemConversa[] = [
    ...msgs.map((m) => ({
      tipo: 'mensagem' as const,
      em: new Date(m.em).toISOString(),
      direcao: m.direction,
      autor: m.direction === 'inbound' ? 'cliente' : m.sender || 'isa',
      conteudo: m.content,
      mensagem_tipo: m.message_type,
      media_id: m.media,
    })),
    ...evs.map((e) => ({ tipo: 'evento' as const, em: new Date(e.em).toISOString(), evento: e.tipo, detalhe: e.detalhe, autor: e.por ?? undefined })),
  ].sort((a, b) => a.em.localeCompare(b.em))
  return { contato, itens }
}
