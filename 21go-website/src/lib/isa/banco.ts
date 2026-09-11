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
 */

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
export async function reivindicarPendentes(p: { silencioSeg: number; lockSeg: number; limite: number }): Promise<ContatoIsa[]> {
  return sql<ContatoIsa>(
    `UPDATE public.isa_contatos c SET processando_desde = now()
     WHERE c.telefone IN (
       SELECT telefone FROM public.isa_contatos
       WHERE ultimo_inbound_em IS NOT NULL
         AND ultimo_inbound_em > COALESCE(processado_ate, '-infinity'::timestamptz)
         AND ultimo_inbound_em < now() - make_interval(secs => $1)
         AND (processando_desde IS NULL OR processando_desde < now() - make_interval(secs => $2))
       ORDER BY ultimo_inbound_em
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING c.*`,
    [p.silencioSeg, p.lockSeg, p.limite],
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

/** Chegou mensagem nova depois de `desde`? A Isa para no meio da resposta e rele tudo. */
export async function chegouMensagemNova(telefone: string, desde: string | null): Promise<boolean> {
  const r = await sql<{ novo: boolean }>(
    `SELECT ultimo_inbound_em > COALESCE($2::timestamptz, '-infinity'::timestamptz) AS novo
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
       AND (created_at AT TIME ZONE 'UTC') > COALESCE($2::timestamptz, '-infinity'::timestamptz)
     ORDER BY created_at`,
    [conversationId, processadoAte],
  )
}

/** Ultimas `limite` mensagens da conversa (contexto da IA), da mais antiga pra mais nova. */
export async function historico(conversationId: string, limite = 30): Promise<MensagemHistorico[]> {
  const r = await sql<MensagemHistorico>(
    `SELECT id, whatsapp_message_id, direction, sender, message_type, content, NULL AS raw_payload,
            (created_at AT TIME ZONE 'UTC') AS criada_em
     FROM public.messages
     WHERE conversation_id = $1 AND evolution_instance = 'cloud_isa'
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limite],
  )
  return r.reverse()
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
  'retomada_em', 'abordagem5min_em', 'opcoes_versao',
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
 * Quem sumiu depois da simulacao: ja recebeu cotacao, a Isa falou por ultimo ha 4 h ou mais, a
 * janela de 24 h ainda esta aberta e ainda nao houve retomada desde a ultima fala da Isa (e nem
 * nas ultimas 24 h). Dono: "pode retomar, respeitando o tempo — nunca com periodo curto".
 */
export async function contatosParaRetomar(limite = 10): Promise<ContatoIsa[]> {
  return sql<ContatoIsa>(
    `UPDATE public.isa_contatos c SET retomada_em = now()
     WHERE c.telefone IN (
       SELECT telefone FROM public.isa_contatos
       WHERE ligada AND lead_id IS NOT NULL AND conversation_id IS NOT NULL
         AND ultima_resposta_em IS NOT NULL
         AND ultima_resposta_em > COALESCE(ultimo_inbound_em, '-infinity'::timestamptz)
         AND ultima_resposta_em < now() - interval '4 hours'
         AND janela_ate > now() + interval '10 minutes'
         AND (retomada_em IS NULL OR (retomada_em < ultima_resposta_em AND retomada_em < now() - interval '24 hours'))
         AND processando_desde IS NULL
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING c.*`,
    [limite],
  )
}
