import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase do BANCO NOVO (super-banco da Leticya).
 * Schema default = ai (pra agents/runs/actions/knowledge/conversation_chunks).
 * Pra outros schemas usar .schema('core'), .schema('chat'), etc.
 */

const URL = process.env.SUPABASE_NEW_URL || 'https://dsclaxtvcbbuxmtmpxpf.supabase.co'
const SR =
  process.env.SUPABASE_NEW_SERVICE_ROLE || process.env.SUPABASE_NEW_SERVICE_ROLE_KEY

let _client: SupabaseClient | null = null

export function leticyaDb(): SupabaseClient {
  if (!URL || !SR) {
    throw new Error(
      'Leticya DB não configurada: SUPABASE_NEW_URL e SUPABASE_NEW_SERVICE_ROLE ausentes',
    )
  }
  if (!_client) {
    _client = createClient(URL, SR, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'ai' },
      global: { headers: { 'x-app': '21go-leticya' } },
    })
  }
  return _client
}
