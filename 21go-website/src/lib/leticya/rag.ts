// @ts-nocheck — modulo Leticya v2 em shadow mode (nao dispara WhatsApp). Validacao TS desativada ate refactor da tipagem do AI SDK.
import 'server-only'
import { embedQuery, vecToPgString } from './embeddings'
import { leticyaDb } from './db'

/**
 * Hybrid Search (vector + tsvector PT-BR + RRF) sobre:
 * - ai.knowledge_chunks (60 MDX + brand-guide + agente-pre-venda + planos)
 * - ai.conversation_chunks (1.533 mensagens reais agrupadas em janelas)
 *
 * Tudo passa pelas funções SQL hybrid_search_knowledge e
 * hybrid_search_conversations (RRF k=60).
 */

export interface KnowledgeHit {
  id: string
  source: string
  source_doc_id: string
  content: string
  metadata: Record<string, unknown>
  rrf_score: number
  vec_rank: number | null
  bm_rank: number | null
}

export interface ConversationHit {
  id: string
  conversation_id: string
  contact_id: string | null
  content: string
  outcome: string
  vehicle_type: string | null
  contains_price: boolean
  contains_fipe: boolean
  msg_count: number
  metadata: Record<string, unknown>
  rrf_score: number
}

export async function searchKnowledge(
  query: string,
  opts: { topK?: number; source?: string } = {},
): Promise<KnowledgeHit[]> {
  const topK = opts.topK ?? 5
  const embedding = await embedQuery(query)
  const db = leticyaDb()
  const { data, error } = await db.rpc('hybrid_search_knowledge', {
    query_text: query,
    query_embedding: vecToPgString(embedding),
    top_k: topK,
    source_filter: opts.source ?? null,
  })
  if (error) throw new Error(`searchKnowledge: ${error.message}`)
  return (data ?? []) as KnowledgeHit[]
}

export async function searchConversations(
  query: string,
  opts: {
    topK?: number
    outcome?: 'won' | 'lost' | 'in_progress'
    vehicleType?: 'carro' | 'moto' | 'suv' | 'especial' | 'desconhecido'
    onlyWithPrice?: boolean
  } = {},
): Promise<ConversationHit[]> {
  const topK = opts.topK ?? 5
  const embedding = await embedQuery(query)
  const db = leticyaDb()
  const { data, error } = await db.rpc('hybrid_search_conversations', {
    query_text: query,
    query_embedding: vecToPgString(embedding),
    top_k: topK,
    outcome_filter: opts.outcome ?? null,
    vehicle_type_filter: opts.vehicleType ?? null,
    only_with_price: opts.onlyWithPrice ?? false,
  })
  if (error) throw new Error(`searchConversations: ${error.message}`)
  return (data ?? []) as ConversationHit[]
}
