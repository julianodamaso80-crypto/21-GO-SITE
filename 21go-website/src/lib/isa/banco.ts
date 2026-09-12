import 'server-only'
import { Pool } from 'pg'

/**
 * Banco da Isa pela conexao DIRETA (pg), nao pelo REST do Supabase.
 *
 * A fila precisa de SQL atomico (reivindicar a conversa sem dois workers responderem juntos) e
 * nao pode cair junto com o PostgREST, que da 503 quando o CRM sincroniza no mesmo banco (ver
 * supabase-direto.ts). Mesmo jeito de conectar: campos separados, sem connectionString, porque
 * o `sslmode=require` da URL vira verify-full no pg e derruba com SELF_SIGNED_CERT_IN_CHAIN.
 *
 * messages.created_at e `timestamp without time zone` gravado em UTC — toda comparacao com as
 * colunas timestamptz da Isa passa por `AT TIME ZONE 'UTC'`.
 *
 * ⚠️ PRECISAO: o Postgres grava microssegundos e o `pg` devolve Date do JS, que so tem
 * milissegundos. O `visto` que volta pro banco fica ate 999 µs MENOR que o valor gravado — e
 * `ultimo_inbound_em > visto` dava verdadeiro sem mensagem nova nenhuma: a Isa mandava so a
 * primeira parte da resposta ("interrompida") e o contato nunca saia da fila (reprocessado a cada
 * minuto). Achado no teste de 11/09/2026. Toda comparacao com um horario que passou pelo JS
 * trunca o lado do banco em milissegundos (`ms(...)`).
 */

/** Trunca um timestamp do banco em milissegundos — o que o JS consegue devolver. */
const ms = (coluna: string) => `date_trunc('milliseconds', ${coluna})`

let _pool: Pool | null = null

function pool(): Pool {
  if (_pool) return _pool
  const url = process.env.SUPABASE_DB_URL
  if (!url) throw new Error('SUPABASE_DB_URL ausente — a Isa nao tem banco')
  const u = new URL(url)
  _pool = new Pool({
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    query_timeout: 15_000,
  } as never)
  _pool.on('error', (err) => console.error('[isa] pool pg:', err.message))
  return _pool
}

export async function sql<T = Record<string, unknown>>(texto: string, valores: unknown[] = []): Promise<T[]> {
  const r = await pool().query(texto, valores)
  return r.rows as T[]
}

export interface ContatoIsa {
  telefone: string
  conversation_id: string | null
  lead_id: string | null
  nome: string | null
  ligada: boolean
  pausa_motivo: string | null
  pausa_por: string | null
  transferido_em: string | null
  entrada: string | null
  desconto50_em: string | null
  desconto50_de: string | null
  desconto50_para: string | null
  aguardando_dono: string | null
  genero: string | null
  preco_da_tabela: boolean
  processado_ate: string | null
  ultimo_inbound_em: string | null
  janela_ate: string | null
  ultima_resposta_em: string | null
  opcoes_versao: OpcoesVersao | null
  /** Placa esperando a resposta de leilao/aplicativo pra ser cotada. */
  placa_pendente: string | null
  /** Anotacao interna do time (o cliente nunca ve). */
  nota: string | null
  /** /reiniciar (numeros de teste): a Isa ignora historico e simulacoes de antes disto. */
  reiniciada_em: string | null
  /** Etiquetas do painel/CRM (etiquetas.regras.ts). */
  etiquetas: string[]
  /** Ultima mensagem de alguem do time pelo painel/CRM — a Isa nao fala por cima ate o cliente responder. */
  humano_em: string | null
}

/** Versoes que a Isa listou (cotacao sem placa), esperando o cliente responder o numero. */
export interface OpcoesVersao {
  tipo: 'carro' | 'moto'
  brandId: number
  brandText: string
  ano: number
  modeloDito: string
  itens: { id: number; text: string; back: string | null }[]
}

/** A mensagem ja estava gravada? A Meta reentrega eventos e a Isa nao pode responder duas vezes. */
export async function mensagemJaGravada(wamid: string): Promise<boolean> {
  const r = await sql(
    `SELECT 1 FROM public.messages WHERE whatsapp_message_id = $1 AND evolution_instance = 'cloud_isa' LIMIT 1`,
    [wamid],
  )
  return r.length > 0
}

/** Webhook: mensagem NOVA do cliente. Marca o contato como pendente, com o relogio do banco. */
export async function registrarInbound(p: { telefone: string; conversationId: string; nome: string | null }): Promise<void> {
  await sql(
    `INSERT INTO public.isa_contatos (telefone, conversation_id, nome, ultimo_inbound_em, janela_ate)
     VALUES ($1, $2, $3, now(), now() + interval '24 hours')
     ON CONFLICT (telefone) DO UPDATE SET
       conversation_id   = COALESCE(EXCLUDED.conversation_id, isa_contatos.conversation_id),
       nome              = COALESCE(isa_contatos.nome, EXCLUDED.nome),
       ultimo_inbound_em = now(),
       janela_ate        = now() + interval '24 hours',
       updated_at        = now()`,
    [p.telefone, p.conversationId, p.nome],
  )
}

/**
 * Reivindica ate `limite` conversas prontas: chegou mensagem depois do que ja foi respondido e o
 * cliente parou de digitar ha `silencioSeg`. Um UPDATE so, com SKIP LOCKED — dois workers nunca
 * pegam o mesmo telefone. O lock expira em `lockSeg` (worker que morreu no meio de um deploy).
 */
export async function reivindicarPendentes(p: {
  silencioSeg: number
  lockSeg: number
  limite: number
  /** Fora do horario so os numeros de teste do dono sao atendidos (ele testa 24 h). */
  somente?: string[] | null
}): Promise<ContatoIsa[]> {
  return sql<ContatoIsa>(
    `UPDATE public.isa_contatos c SET processando_desde = now()
     WHERE c.telefone IN (
       SELECT telefone FROM public.isa_contatos
       WHERE ultimo_inbound_em IS NOT NULL
         AND ${ms('ultimo_inbound_em')} > COALESCE(processado_ate, '-infinity'::timestamptz)
         AND ultimo_inbound_em < now() - make_interval(secs => $1)
         AND (processando_desde IS NULL OR processando_desde < now() - make_interval(secs => $2))
         AND ($4::text[] IS NULL OR telefone = ANY($4::text[]))
       ORDER BY ultimo_inbound_em
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING c.*`,
    [p.silencioSeg, p.lockSeg, p.limite, p.somente ?? null],
  )
}

/**
 * Solta o contato. `processadoAte` e o ultimo_inbound_em VISTO na reivindicacao, nao now():
 * mensagem que chegou enquanto a Isa respondia continua pendente e entra na proxima rodada.
 */
export async function liberar(telefone: string, processadoAte: string | null, respondeu: boolean): Promise<void> {
  await sql(
    `UPDATE public.isa_contatos SET
       processando_desde  = NULL,
       processado_ate     = COALESCE($2::timestamptz, processado_ate),
       ultima_resposta_em = CASE WHEN $3 THEN now() ELSE ultima_resposta_em END,
       updated_at         = now()
     WHERE telefone = $1`,
    [telefone, processadoAte, respondeu],
  )
}

/** Solta sem marcar nada como respondido (fora do horario): fica pendente pra fila das 8h. */
export async function soltarSemProcessar(telefone: string): Promise<void> {
  await sql(`UPDATE public.isa_contatos SET processando_desde = NULL WHERE telefone = $1`, [telefone])
}

/**
 * Alguem do time respondeu pelo painel/CRM depois de `desde` (o ultimo_inbound_em visto)? Entao
 * quem esta atendendo e a pessoa: a Isa nao manda nada por cima (dono, 11/09/2026).
 */
export async function humanoFalouDepois(telefone: string, desde: string | null): Promise<boolean> {
  const r = await sql<{ falou: boolean }>(
    `SELECT humano_em IS NOT NULL AND ${ms('humano_em')} >= COALESCE($2::timestamptz, '-infinity'::timestamptz) AS falou
     FROM public.isa_contatos WHERE telefone = $1`,
    [telefone, desde],
  )
  return !!r[0]?.falou
}

/** Chegou mensagem nova depois de `desde`? A Isa para no meio da resposta e rele tudo. */
export async function chegouMensagemNova(telefone: string, desde: string | null): Promise<boolean> {
  const r = await sql<{ novo: boolean }>(
    `SELECT ${ms('ultimo_inbound_em')} > COALESCE($2::timestamptz, '-infinity'::timestamptz) AS novo
     FROM public.isa_contatos WHERE telefone = $1`,
    [telefone, desde],
  )
  return !!r[0]?.novo
}

export interface MensagemHistorico {
  id: string
  whatsapp_message_id: string
  direction: 'inbound' | 'outbound'
  sender: string | null
  message_type: string
  content: string
  raw_payload: unknown
  criada_em: string
}

/** Mensagens do cliente ainda nao respondidas (depois de processado_ate), em ordem. */
export async function inboundsNovas(conversationId: string, processadoAte: string | null): Promise<MensagemHistorico[]> {
  return sql<MensagemHistorico>(
    `SELECT id, whatsapp_message_id, direction, sender, message_type, content, raw_payload,
            (created_at AT TIME ZONE 'UTC') AS criada_em
     FROM public.messages
     WHERE conversation_id = $1 AND evolution_instance = 'cloud_isa' AND direction = 'inbound'
       AND ${ms("created_at AT TIME ZONE 'UTC'")} > COALESCE($2::timestamptz, '-infinity'::timestamptz)
     ORDER BY created_at`,
    [conversationId, processadoAte],
  )
}

/**
 * Ultimas `limite` mensagens da conversa (contexto da IA), da mais antiga pra mais nova. `desde`
 * = reiniciada_em: depois de um /reiniciar a Isa nao enxerga o que veio antes.
 */
export async function historico(conversationId: string, limite = 30, desde: string | null = null): Promise<MensagemHistorico[]> {
  const r = await sql<MensagemHistorico>(
    `SELECT id, whatsapp_message_id, direction, sender, message_type, content, NULL AS raw_payload,
            (created_at AT TIME ZONE 'UTC') AS criada_em
     FROM public.messages
     WHERE conversation_id = $1 AND evolution_instance = 'cloud_isa'
       AND (created_at AT TIME ZONE 'UTC') > COALESCE($3::timestamptz, '-infinity'::timestamptz)
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limite, desde],
  )
  return r.reverse()
}

/**
 * /reiniciar dos numeros de teste: zera o que a Isa sabe do contato (desconto dado, pausa, lead,
 * genero, versoes...) e marca o instante — historico e simulacoes de antes deixam de valer. As
 * mensagens ficam no banco e no painel.
 */
export async function reiniciarContato(telefone: string): Promise<void> {
  await sql(
    `UPDATE public.isa_contatos SET
       reiniciada_em = now(), lead_id = NULL, ligada = true, pausa_motivo = NULL, pausa_por = NULL,
       pausada_em = NULL, transferido_em = NULL, entrada = NULL, desconto50_em = NULL,
       desconto50_de = NULL, desconto50_para = NULL, aguardando_dono = NULL, genero = NULL,
       preco_da_tabela = false, retomada_em = NULL, abordagem5min_em = NULL, opcoes_versao = NULL, placa_pendente = NULL,
       ultima_resposta_em = NULL, humano_em = NULL, updated_at = now()
     WHERE telefone = $1`,
    [telefone],
  )
  // Pedido de desconto deste contato que ficou esperando o supervisor (4240): sem isto, o 4240
  // continua em "modo supervisor" e para de conversar como cliente (teste de 11/09/2026).
  await sql(
    `UPDATE public.isa_contatos SET aguardando_dono = NULL, updated_at = now()
     WHERE aguardando_dono IN ('desconto:' || $1, 'valor:' || $1)`,
    [telefone],
  )
}

/** Troca o "[imagem]"/"[documento]" pelo que a Isa leu — o arquivo em si nunca e gravado. */
export async function gravarLeitura(messageId: string, texto: string): Promise<void> {
  await sql(`UPDATE public.messages SET content = $2 WHERE id = $1 AND evolution_instance = 'cloud_isa'`, [messageId, texto])
}

/** Troca o "[áudio]" pela transcricao — o audio em si nunca e gravado no banco. */
export async function gravarTranscricao(messageId: string, texto: string): Promise<void> {
  await sql(`UPDATE public.messages SET content = $2 WHERE id = $1 AND evolution_instance = 'cloud_isa'`, [
    messageId,
    `🎤 ${texto}`,
  ])
}

export async function registrarEvento(telefone: string, tipo: string, detalhe: unknown, por = 'isa'): Promise<void> {
  await sql(`INSERT INTO public.isa_eventos (telefone, tipo, detalhe, por) VALUES ($1, $2, $3, $4)`, [
    telefone,
    tipo,
    detalhe == null ? null : JSON.stringify(detalhe),
    por,
  ]).catch((err) => console.error('[isa] evento nao gravado:', tipo, err instanceof Error ? err.message : err))
}

/** Atualiza campos do contato. So as colunas conhecidas — nunca nome de coluna vindo de fora. */
const CAMPOS_EDITAVEIS = new Set([
  'lead_id', 'nome', 'ligada', 'pausa_motivo', 'pausa_por', 'pausada_em', 'transferido_em', 'entrada',
  'desconto50_em', 'desconto50_de', 'desconto50_para', 'aguardando_dono', 'genero', 'preco_da_tabela',
  'retomada_em', 'abordagem5min_em', 'opcoes_versao', 'placa_pendente', 'nota',
])

export async function atualizarContato(telefone: string, campos: Record<string, unknown>): Promise<void> {
  const nomes = Object.keys(campos).filter((c) => CAMPOS_EDITAVEIS.has(c))
  if (nomes.length === 0) return
  const sets = nomes.map((c, i) => `${c} = $${i + 2}`).join(', ')
  // jsonb vai como texto: o pg transformaria objeto/array JS em array do Postgres.
  const valores = nomes.map((c) => {
    const v = campos[c]
    return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v
  })
  await sql(`UPDATE public.isa_contatos SET ${sets}, updated_at = now() WHERE telefone = $1`, [telefone, ...valores])
}

/**
 * Quem sumiu depois da simulacao: ja recebeu cotacao, a Isa falou por ultimo ha 1 h ou mais, a
 * janela de 24 h ainda esta aberta e ainda nao houve retomada desde a ultima fala da Isa (e nem
 * nas ultimas 24 h). Dono (11/09/2026): "se ele nao responder depois de 1 hr voce chama ele de
 * novo" — uma vez so por silencio.
 */
export async function contatosParaRetomar(limite = 10): Promise<ContatoIsa[]> {
  return sql<ContatoIsa>(
    `UPDATE public.isa_contatos c SET retomada_em = now()
     WHERE c.telefone IN (
       SELECT telefone FROM public.isa_contatos
       WHERE ligada AND lead_id IS NOT NULL AND conversation_id IS NOT NULL
         AND ultima_resposta_em IS NOT NULL
         AND ultima_resposta_em > COALESCE(ultimo_inbound_em, '-infinity'::timestamptz)
         AND ultima_resposta_em < now() - interval '1 hour'
         AND janela_ate > now() + interval '10 minutes'
         AND (retomada_em IS NULL OR (retomada_em < ultima_resposta_em AND retomada_em < now() - interval '24 hours'))
         AND (humano_em IS NULL OR humano_em < ultima_resposta_em)
         AND processando_desde IS NULL
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING c.*`,
    [limite],
  )
}
