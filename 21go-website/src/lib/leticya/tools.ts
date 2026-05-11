import 'server-only'
import { z } from 'zod'
import { tool } from 'ai'
import { searchKnowledge, searchConversations } from './rag'
import { leticyaDb } from './db'
import { lookupFipePrice, listMarcas, listModelos, listAnos } from '@/lib/fipe-lookup'
import { findPrice, getApplicablePlans, PRICING_TABLES, PLAN_INFO, type PlanId } from '@/data/pricing'

/**
 * 7 tools que a Leticya pode chamar via Vercel AI SDK 5.
 * Cada tool tem schema Zod (validação input/output) + execute (lógica).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify — classifica intent + sentimento + tier (step 0 obrigatório)
// ─────────────────────────────────────────────────────────────────────────────
export const classifyTool = tool({
  description:
    'Classifica a mensagem do cliente em intent + sentimento + tier de complexidade. SEMPRE chamar primeiro, antes de qualquer outra tool.',
  inputSchema: z.object({
    intent: z.enum([
      'SAUDACAO',
      'COTACAO',
      'DUVIDA_PLANO',
      'DUVIDA_PROCESSO',
      'OBJECAO_PRECO',
      'OBJECAO_OUTRA',
      'CANCELAMENTO',
      'SINISTRO',
      'RECLAMACAO',
      'PEDE_HUMANO',
      'OUTRO',
    ]).describe('Intenção principal da mensagem'),
    sentiment: z.enum(['POSITIVO', 'NEUTRO', 'NEGATIVO']).describe('Sentimento'),
    tier: z.enum(['low', 'mid', 'high']).describe(
      'low=saudacao/smalltalk; mid=cotacao/duvida normal; high=objecao forte/fechamento/valor alto',
    ),
    needs_escalation: z.boolean().describe(
      'true se cliente pede humano OU sinistro OU cancelamento OU reclamação séria',
    ),
  }),
  execute: async (input) => input, // a classificação é o output da tool em si
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. searchKnowledge — RAG na knowledge base (planos, FAQ, brand, blogs)
// ─────────────────────────────────────────────────────────────────────────────
export const searchKnowledgeTool = tool({
  description:
    'Busca informações oficiais da 21Go (planos, coberturas, vistoria, mutualismo, FAQ, comparações com seguro). Use quando precisar de fato concreto sobre o produto/empresa.',
  inputSchema: z.object({
    query: z.string().describe('Query de busca em português natural'),
    source: z
      .enum(['BLOG', 'PLANOS', 'AGENT_PLAYBOOK', 'BRAND_GUIDE'])
      .optional()
      .describe('Filtrar por tipo de fonte (opcional)'),
    top_k: z.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ query, source, top_k }) => {
    const hits = await searchKnowledge(query, { topK: top_k, source })
    return hits.map((h) => ({
      source: h.source,
      doc: h.source_doc_id,
      content: h.content,
      score: Number(h.rrf_score.toFixed(4)),
    }))
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. searchConversations — RAG nas 1.533 conversas reais com clientes
// ─────────────────────────────────────────────────────────────────────────────
export const searchConversationsTool = tool({
  description:
    'Busca trechos de CONVERSAS REAIS anteriores com clientes (memória institucional do vendedor). Use pra ver "como o vendedor humano respondeu situação parecida". Filtros: outcome (won/lost/in_progress), vehicle_type, only_with_price.',
  inputSchema: z.object({
    query: z.string().describe('Query de busca em português natural'),
    outcome: z.enum(['won', 'lost', 'in_progress']).optional(),
    vehicle_type: z.enum(['carro', 'moto', 'suv', 'especial', 'desconhecido']).optional(),
    only_with_price: z.boolean().default(false),
    top_k: z.number().int().min(1).max(10).default(5),
  }),
  execute: async (i) => {
    const hits = await searchConversations(i.query, {
      topK: i.top_k,
      outcome: i.outcome,
      vehicleType: i.vehicle_type,
      onlyWithPrice: i.only_with_price,
    })
    return hits.map((h) => ({
      content: h.content,
      outcome: h.outcome,
      vehicle: h.vehicle_type,
      msgs: h.msg_count,
      score: Number(h.rrf_score.toFixed(4)),
    }))
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. recallMemory — busca fatos do contato (Mem0-style)
// ─────────────────────────────────────────────────────────────────────────────
export const recallMemoryTool = tool({
  description:
    'Recupera fatos já conhecidos sobre este contato (preferências, objeções anteriores, veículo mencionado). Use no início pra personalizar.',
  inputSchema: z.object({
    contact_id: z.string().describe('UUID do contato'),
    top_k: z.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ contact_id, top_k }) => {
    const db = leticyaDb()
    const { data, error } = await db
      .schema('chat')
      .from('contact_facts')
      .select('fact, category, confidence, created_at')
      .eq('contact_id', contact_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(top_k)
    if (error) return { facts: [], error: error.message }
    return { facts: data ?? [] }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. lookupFipe — consulta FIPE (cascata existente)
// ─────────────────────────────────────────────────────────────────────────────
export const lookupFipeTool = tool({
  description:
    'Consulta tabela FIPE pra um veículo. Use quando cliente passar marca/modelo/ano. Retorna valor FIPE oficial e planos aplicáveis.',
  inputSchema: z.object({
    kind: z.enum(['carros', 'motos']),
    marca: z.string().describe('Nome da marca exatamente como aparece na FIPE (ex: "Honda", "VW - VolksWagen")'),
    modelo: z.string().describe('Nome do modelo (ex: "CG 160 Fan FlexOne")'),
    ano: z.string().describe('Ano-combustível (ex: "2024 Gasolina", "Zero KM Flex")'),
  }),
  execute: async ({ kind, marca, modelo, ano }) => {
    // Resolve códigos via listMarcas/listModelos/listAnos
    const marcas = await listMarcas(kind)
    const m = marcas.find((x) => x.name.toLowerCase().includes(marca.toLowerCase()))
    if (!m) return { ok: false, error: `marca "${marca}" não encontrada` }

    const modelos = await listModelos(kind, m.code)
    const md = modelos.find((x) => x.name.toLowerCase().includes(modelo.toLowerCase()))
    if (!md) return { ok: false, error: `modelo "${modelo}" não encontrado em ${m.name}` }

    const anos = await listAnos(kind, m.code, md.code)
    const a = anos.find((x) => x.name.toLowerCase().includes(ano.toLowerCase()))
    if (!a) return { ok: false, error: `ano "${ano}" não encontrado pra ${md.name}` }

    const r = await lookupFipePrice(kind, m.code, md.code, a.code)
    if (!r.success) return { ok: false, error: r.error }
    return {
      ok: true,
      fipe_value: r.vehicle.fipeValue,
      fipe_code: r.vehicle.fipeCode,
      vehicle: r.vehicle,
      applicable_plans: r.plans?.map((p) => ({
        id: p.id,
        name: p.name,
        monthly: p.monthly,
        popular: p.popular,
      })),
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. getPlanPrice — pega cota mensal exata de um plano por valor FIPE
// ─────────────────────────────────────────────────────────────────────────────
export const getPlanPriceTool = tool({
  description:
    'Retorna a cota mensal EXATA de um plano dado o valor FIPE. NUNCA invente preço — sempre chame esta tool.',
  inputSchema: z.object({
    plan_id: z
      .enum(['basico', 'do-seu-jeito', 'vip', 'premium', 'suv', 'moto-400', 'moto-1000', 'especial'])
      .describe('ID do plano'),
    fipe_value: z.number().positive().describe('Valor FIPE em reais (ex: 45000)'),
  }),
  execute: async ({ plan_id, fipe_value }) => {
    const table = PRICING_TABLES[plan_id as PlanId]
    if (!table) return { ok: false, error: `plano ${plan_id} desconhecido` }
    const price = findPrice(table, fipe_value)
    if (price == null) {
      return {
        ok: false,
        error: `valor FIPE R$${fipe_value.toLocaleString('pt-BR')} fora das faixas do plano ${plan_id}`,
      }
    }
    const info = PLAN_INFO[plan_id as PlanId]
    return {
      ok: true,
      plan_id,
      plan_name: info?.name ?? plan_id,
      monthly_brl: price,
      fipe_value,
      popular: info?.popular ?? false,
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. escalateHuman — registra escalation pra você atender
// ─────────────────────────────────────────────────────────────────────────────
export const escalateHumanTool = tool({
  description:
    'Sinaliza que esta conversa precisa de atendimento humano. Use quando: cliente pede explicitamente, sinistro em andamento, cancelamento, valor da cota >R$1.500/mês, mais de 2 objeções fortes seguidas, assunto jurídico, ou pergunta tecnica fora da knowledge base.',
  inputSchema: z.object({
    contact_id: z.string().nullable().describe('UUID do contato (null se ainda não persistido)'),
    conversation_id: z.string().nullable(),
    reason: z.enum([
      'PEDIDO_EXPLICITO',
      'SINISTRO',
      'CANCELAMENTO',
      'VALOR_ALTO',
      'OBJECOES_REPETIDAS',
      'FORA_DA_BASE',
      'JURIDICO',
      'RECLAMACAO',
    ]),
    urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
    notes: z.string().describe('Resumo do que rolou e por que precisa humano'),
  }),
  execute: async (i) => {
    const db = leticyaDb()
    const { data, error } = await db.from('escalations').insert({
      contact_id: i.contact_id,
      conversation_id: i.conversation_id,
      reason: i.reason,
      urgency: i.urgency,
      notes: i.notes,
      status: 'PENDING',
    }).select('id').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, escalation_id: data.id, status: 'criada — humano vai assumir' }
  },
})

// ─── Bundle pra exportar pra streamText ───
import { leticyaToolsV2 } from './tools-v2'

export const leticyaTools = {
  classify: classifyTool,
  searchKnowledge: searchKnowledgeTool,
  searchConversations: searchConversationsTool,
  recallMemory: recallMemoryTool,
  lookupFipe: lookupFipeTool,
  getPlanPrice: getPlanPriceTool,
  escalateHuman: escalateHumanTool,
  // v2 — destiladas de 263 conversas reais
  ...leticyaToolsV2,
}
