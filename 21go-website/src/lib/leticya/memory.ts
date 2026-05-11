import 'server-only'
import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { leticyaDb } from './db'

/**
 * Memória persistente da Leticya (Mem0-style, self-hosted).
 *
 * - extractFacts: pega último turno (msg do cliente + resposta da Leticya)
 *   e usa Haiku pra extrair fatos relevantes em formato estruturado.
 *   Persiste em chat.contact_facts.
 *
 * - recallFacts: dado contact_id, retorna fatos ativos (sem expiração).
 *   Já é exposto como tool `recallMemory` em tools.ts.
 *
 * Custo médio: ~$0.0005 por extração (Haiku rápido).
 */

const FactSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z.string().describe('Fato curto sobre o cliente, em PT-BR'),
        category: z.enum([
          'VEHICLE_INTEREST',  // veículo mencionado: marca/modelo/ano/placa
          'OBJECTION',          // objeção feita: preço, prazo, confiança
          'PERSONAL',           // info pessoal: cidade, profissão, família
          'FINANCIAL',          // info financeira: orçamento, parcelamento
          'COMPETITOR',         // mencionou seguro/concorrente
          'PREFERENCE',         // preferência: plano, cobertura
          'CONTACT_INFO',       // canal preferido, horário
          'OTHER',
        ]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(5)
    .describe('Lista de no máximo 5 fatos NOVOS e RELEVANTES sobre o cliente'),
})

interface MessagePair {
  user_message: string
  agent_response: string
}

export async function extractFacts(
  pair: MessagePair,
  contactId: string,
  apiKey: string,
  runId: string | null,
): Promise<{ inserted: number; facts: z.infer<typeof FactSchema>['facts'] }> {
  const openrouter = createOpenRouter({ apiKey })

  const prompt = `Conversa entre cliente e Leticya (atendente virtual da 21Go):

CLIENTE: ${pair.user_message}

LETICYA: ${pair.agent_response}

Extraia até 5 fatos NOVOS e ESPECÍFICOS sobre o cliente que vão ajudar a Leticya em conversas futuras. Foque em:
- Veículo mencionado (marca/modelo/ano/placa)
- Objeções feitas (preço, prazo, desconfiança)
- Info pessoal relevante (cidade, profissão, família)
- Concorrentes ou produtos mencionados
- Preferências (plano, cobertura desejada)

Se não houver fatos relevantes, retorne array vazio. Não invente. Cada fato deve ser CURTO (1 frase) e VERIFICÁVEL na conversa.`

  let parsed: z.infer<typeof FactSchema>
  try {
    const result = await generateObject({
      model: openrouter('anthropic/claude-haiku-4.5'),
      schema: FactSchema,
      prompt,
      temperature: 0.2,
    })
    parsed = result.object
  } catch {
    return { inserted: 0, facts: [] }
  }

  if (parsed.facts.length === 0) {
    return { inserted: 0, facts: [] }
  }

  // Persiste em chat.contact_facts
  const db = leticyaDb()
  let inserted = 0
  for (const f of parsed.facts) {
    const { error } = await db
      .schema('chat')
      .from('contact_facts')
      .insert({
        contact_id: contactId,
        company_id: 'company-21go',
        fact: f.fact,
        category: f.category,
        confidence: f.confidence,
        source_type: 'AGENT_IA',
        source_run_id: runId,
        is_active: true,
      })
    if (!error) inserted++
  }

  return { inserted, facts: parsed.facts }
}

export interface RecallResult {
  facts: Array<{
    fact: string
    category: string
    confidence: number
    created_at: string
  }>
}

export async function recallFacts(
  contactId: string,
  topK = 8,
): Promise<RecallResult> {
  const db = leticyaDb()
  const { data } = await db
    .schema('chat')
    .from('contact_facts')
    .select('fact, category, confidence, created_at')
    .eq('contact_id', contactId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(topK)
  return { facts: data ?? [] }
}
