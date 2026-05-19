/**
 * Cliente Supabase admin (service_role) — usado por todos os repositories.
 * Usa REST/PostgREST. NUNCA expor service_role no frontend.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { child } from '../lib/logger.js';

const log = child('db:supabase');

// Tipo intencionalmente solto — usamos schema customizado 'seo' e helpers nao-genericos.
// Em TS estrito, tipar com SupabaseClient<DB, 'seo'> exigiria gerar tipos do banco
// (out of scope nesta fase). Os repositories validam o shape via Zod/checks proprios.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabase(): any {
  if (_client) return _client;
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Pendente de credencial: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao definidos');
  }
  _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'seo' }, // default — repositories de outros schemas usam .schema('core')
    global: {
      headers: { 'x-application-name': 'seo-worker' },
    },
  });
  log.info({ url: config.SUPABASE_URL }, 'supabase client iniciado (schema=seo)');
  return _client;
}

/** Helper pra rodar SQL via REST RPC quando precisar de algo nao expressivel em PostgREST */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    log.error({ fn, args, err: error.message }, 'rpc erro');
    throw new Error(`rpc ${fn} falhou: ${error.message}`);
  }
  return data as T;
}
