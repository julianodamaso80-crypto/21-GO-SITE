import 'server-only'
import { etapaDoCard, etiquetasAoMover } from '@/lib/isa/funil.regras'
import { planosQueAparecem } from '@/lib/isa/fatos.regras'
import { ETIQUETAS_FORA_DA_FILA } from '@/lib/isa/etiquetas.regras'
import { sql, type ContatoIsa } from '@/lib/isa/banco'

/**
 * Consultas do painel da Isa. So leitura aqui; as acoes (responder, ligar/desligar, transferir)
 * ficam nas rotas /api/atendimento/*.
 */

export type Aba = 'todos' | 'precisa' | 'isa' | 'off' | 'transferidos' | 'consultores'

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
  pergunta_pendente: { texto: string; em: string } | null
  /** Mensagens do cliente depois da nossa ultima resposta — a bolinha verde do WhatsApp. */
  sem_resposta: number
}

// Quem veio pelo "Quero Ser Consultor" (dono, 21/09/2026): so na aba Consultores, em nenhuma outra.
const EH_CONSULTOR = `'consultor' = ANY(COALESCE(c.etiquetas, '{}'::text[]))`

const FILTRO: Record<Aba, string> = {
  todos: `NOT ${EH_CONSULTOR}`,
  // Pausou sozinha num gatilho (e nao foi transferido) ou esta esperando o dono decidir desconto.
  // ...ou ficou devendo uma resposta ("vou confirmar e ja te retorno" — auditoria 12/09/2026).
  // Etiqueta FRIO tira da fila (dono, 16/09/2026: "se eu selecionar tag frio ele sai de precisa
  // de mim"). Os parenteses em volta dos OR sao obrigatorios: sem eles o AND so valeria pro ultimo.
  precisa: `((NOT c.ligada AND c.pausa_por = 'isa' AND c.transferido_em IS NULL) OR (c.aguardando_dono IS NOT NULL AND c.aguardando_dono <> 'fecha_quando') OR c.pergunta_pendente IS NOT NULL)
    -- "ja cuidei" do painel tira da aba e deixa a conversa normal nas outras (dono, 25/09/2026)
    AND c.resolvido_em IS NULL
    -- Passou de 24 h da ultima mensagem dele: nao da pra escrever, so o template de retomada.
    -- Nao fica cobrando atencao de quem ninguem consegue responder (dono, 25/09/2026).
    AND (c.janela_ate IS NULL OR c.janela_ate > now())
    AND NOT (COALESCE(c.etiquetas, '{}'::text[]) && ARRAY[${ETIQUETAS_FORA_DA_FILA.map((e) => `'${e}'`).join(',')}]::text[])`,
  isa: `c.ligada AND NOT ${EH_CONSULTOR}`,
  off: `NOT c.ligada AND NOT ${EH_CONSULTOR}`,
  transferidos: `c.transferido_em IS NOT NULL AND NOT ${EH_CONSULTOR}`,
  consultores: EH_CONSULTOR,
}

export async function listarContatos(aba: Aba, busca: string, etiqueta = '', usuario = ''): Promise<ItemLista[]> {
  const termo = busca.trim()
  return sql<ItemLista>(
    `SELECT c.telefone, COALESCE(c.nome, cv.pushname) AS nome, c.ligada, c.pausa_motivo, c.transferido_em,
            c.aguardando_dono, c.preco_da_tabela, c.janela_ate, c.etiquetas, c.pergunta_pendente,
            u.content AS ultima, u.direction AS ultima_direcao, (mov.em AT TIME ZONE 'UTC') AS ultima_em,
            -- Dono, 16/09/2026: "nao consigo identificar se tem mensagem pra responder". Conta o que
            -- ele escreveu depois da nossa ultima mensagem (Isa ou time), igual a bolinha do WhatsApp.
            -- so conta quando a ultima mensagem e dele: resposta nossa por ultimo ja e zero, sem varrer nada
            CASE WHEN u.direction <> 'inbound' THEN 0 ELSE
            (SELECT count(*)::int FROM public.messages i
              WHERE i.conversation_id = c.conversation_id AND i.evolution_instance = 'cloud_isa' AND i.direction = 'inbound'
                AND i.created_at > GREATEST(
                      COALESCE((SELECT max(o.created_at) FROM public.messages o
                                WHERE o.conversation_id = c.conversation_id AND o.evolution_instance = 'cloud_isa'
                                  AND o.direction = 'outbound'), '-infinity'::timestamptz),
                      -- abrir a conversa no painel ja conta como lido, por usuario
                      COALESCE((c.visto_por ->> $3)::timestamptz, '-infinity'::timestamptz))) END AS sem_resposta
     FROM public.isa_contatos c
     LEFT JOIN public.conversations cv ON cv.id = c.conversation_id
     LEFT JOIN LATERAL (
       SELECT content, direction, created_at FROM public.messages m
       WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa'
       ORDER BY m.created_at DESC LIMIT 1
     ) u ON true
     -- Ordem do WhatsApp de verdade (dono, 16/09/2026: "quem mandar mensagem vai ficando acima"):
     -- sobe quando o CLIENTE escreve ou quando o lead acabou de chegar. Mensagem automatica nossa
     -- (resultado dos 5 min, retomada dos 10 min) nao mexe na ordem — era ela que empurrava quem
     -- nunca respondeu pra cima de quem estava conversando.
     -- Resposta de GENTE do time (Leticya, dono) sobe como no WhatsApp (dono, 19/09/2026: "tem q
     -- ficar por ordem de chegada igual e no whatsapp"). A hora na lista e esta mesma, pra ordem e
     -- relogio nunca discordarem.
     LEFT JOIN LATERAL (
       SELECT GREATEST(
         (SELECT m.created_at FROM public.messages m
          WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa' AND m.direction = 'inbound'
          ORDER BY m.created_at DESC LIMIT 1),
         (SELECT m.created_at FROM public.messages m
          WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa' AND m.direction = 'outbound'
            AND COALESCE(m.sender, 'isa') NOT IN ('isa', 'agent', 'system', 'sistema')
          ORDER BY m.created_at DESC LIMIT 1),
         (SELECT m.created_at FROM public.messages m
          WHERE m.conversation_id = c.conversation_id AND m.evolution_instance = 'cloud_isa'
          ORDER BY m.created_at ASC LIMIT 1)
       ) AS em
     ) mov ON true
     WHERE c.conversation_id IS NOT NULL
       -- Dono (13/09/2026): TODO lead dos .site que nao clicou em "Quero contratar" entra aqui — quem
       -- clicou no desconto e quem recebeu a mensagem dos 5 min, respondendo ou nao.
       AND (${FILTRO[aba]})
       AND ($1 = '' OR c.telefone LIKE '%' || $1 || '%' OR COALESCE(c.nome, cv.pushname, '') ILIKE '%' || $1 || '%')
       AND ($2 = '' OR $2 = ANY(c.etiquetas))
     ORDER BY mov.em DESC NULLS LAST
     LIMIT 500`,
    [termo, etiqueta, usuario],
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
  nota: string | null
}

/**
 * Cards do funil: TODA conversa entra, com o veiculo e o plano da simulacao. A etapa vem do
 * `etapaDoCard` — o que a pessoa arrastou vence o que o fluxo calculou.
 */
export async function listarFunil(): Promise<CardFunil[]> {
  const linhas = await sql<
    Omit<CardFunil, 'etapa' | 'plano' | 'valor'> & {
      planos: { id: string; name: string; monthly: number }[] | null
      escolheu: boolean
      documento: boolean
    }
  >(
    `SELECT c.telefone, COALESCE(c.nome, cv.pushname) AS nome, c.etapa AS etapa_manual, c.ligada, c.etiquetas, c.nota,
            NULLIF(TRIM(CONCAT_WS(' ', l.marca_interesse, l.modelo_interesse, l.ano_interesse)), '') AS veiculo,
            l.valor_fipe_consultado AS fipe, l.cotacao_planos AS planos,
            u.content AS ultima, (u.created_at AT TIME ZONE 'UTC') AS ultima_em,
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
       -- Dono (13/09/2026): TODO lead dos .site que nao clicou em "Quero contratar" entra aqui — quem
       -- clicou no desconto e quem recebeu a mensagem dos 5 min, respondendo ou nao.
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
        escolheuPlano: !!l.escolheu,
        mandouDocumento: !!l.documento,
        etiquetas: l.etiquetas,
      }),
    }
  })
}

/** Arrastou o card: a escolha da pessoa fica gravada e vence a etapa automatica. */
export async function gravarEtapa(telefone: string, etapa: string | null): Promise<void> {
  await sql(
    // $2::text: sem o tipo explicito o Postgres recusa o parametro dentro do CASE
    // ("could not determine data type of parameter $2") e o card voltava pra coluna anterior.
    `UPDATE public.isa_contatos SET etapa = $2::text, etapa_em = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, updated_at = now()
     WHERE telefone = $1`,
    [telefone, etapa],
  )
  // A etiqueta anda com o funil (dono, 16/09/2026): mover o card grava a tag da coluna, senao a tag
  // antiga puxava o card de volta.
  if (etapa) {
    const [c] = await sql<{ etiquetas: string[] | null }>(`SELECT etiquetas FROM public.isa_contatos WHERE telefone = $1`, [telefone])
    if (c) {
      await sql(`UPDATE public.isa_contatos SET etiquetas = $2::text[], updated_at = now() WHERE telefone = $1`, [
        telefone,
        etiquetasAoMover(c.etiquetas, etapa),
      ])
    }
  }
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
  /** id da mensagem no WhatsApp: e o que permite responder CITANDO ela. */
  wamid?: string | null
  /** wamid da mensagem que esta respondeu (balao de citacao), nossa ou do cliente. */
  citou?: string | null
  evento?: string
  detalhe?: unknown
}

export async function abrirConversa(telefone: string): Promise<{ contato: ContatoIsa | null; itens: ItemConversa[] }> {
  const [contato] = await sql<ContatoIsa>(`SELECT * FROM public.isa_contatos WHERE telefone = $1`, [telefone])
  if (!contato?.conversation_id) return { contato: contato ?? null, itens: [] }
  const msgs = await sql<{ em: string; direction: string; sender: string | null; content: string; message_type: string; media: string | null; wamid: string | null; citou: string | null }>(
    `SELECT (created_at AT TIME ZONE 'UTC') AS em, direction, sender, content, message_type,
            whatsapp_message_id AS wamid,
            -- nossa resposta guarda {context:{message_id}}; o cliente vem no webhook da Meta
            COALESCE(raw_payload #>> '{context,message_id}',
                     raw_payload #>> '{entry,0,changes,0,value,messages,0,context,id}') AS citou,
            COALESCE(raw_payload #>> '{entry,0,changes,0,value,messages,0,image,id}',
                     raw_payload #>> '{entry,0,changes,0,value,messages,0,document,id}',
                     -- audio do cliente: sem isto o painel nao tinha o que tocar
                     raw_payload #>> '{entry,0,changes,0,value,messages,0,audio,id}') AS media
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
      wamid: m.wamid,
      citou: m.citou,
    })),
    ...evs.map((e) => ({ tipo: 'evento' as const, em: new Date(e.em).toISOString(), evento: e.tipo, detalhe: e.detalhe, autor: e.por ?? undefined })),
  ].sort((a, b) => a.em.localeCompare(b.em))
  return { contato, itens }
}
