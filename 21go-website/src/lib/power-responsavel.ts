import 'server-only'
import { getNegotiation } from '@/lib/powercrm'

/**
 * responsibleId da negociacao no Power; null se nao deu pra ler (nunca segura o lead por isso).
 *
 * Placa presa com outro consultor (dono, 14/09/2026): o Power cria a cotacao, mas a negociacao
 * nasce com o responsibleId dele, e a mensagem dos 5 min (Isa e Mariana) le esta coluna. Usada
 * pelo site da casa (vehicle/lead) e pelo site de parceiro (parceiro/lead). Movida de
 * vehicle/lead/route.ts sem mudar nada.
 */
export async function responsavelNoPower(negotiationCode: string | undefined, leadId: string): Promise<string | null> {
  if (!negotiationCode || !process.env.POWERAPI_TOKEN) return null
  try {
    const r = await getNegotiation(negotiationCode, leadId)
    const raw = r.raw as { responsibleId?: unknown } | null | undefined
    const id = typeof raw?.responsibleId === 'string' ? raw.responsibleId.trim() : ''
    return id || null
  } catch (err) {
    console.warn('[lead] responsavel no Power nao lido:', err instanceof Error ? err.message : err)
    return null
  }
}
