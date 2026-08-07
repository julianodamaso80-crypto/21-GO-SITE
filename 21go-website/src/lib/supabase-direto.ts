import 'server-only'
import { Client } from 'pg'

/**
 * Gravacao de lead pela porta dos fundos: conexao direta no Postgres.
 *
 * Por que existe (06/08/2026): o site grava lead pela API REST do Supabase (PostgREST). Quando
 * o banco fica ocupado — e ele fica, porque o CRM sincroniza 159 mil negociacoes do Power no
 * MESMO banco — o PostgREST nao consegue carregar o schema cache e devolve 503 em tudo. O lead
 * do cliente virava `[lead] Falha persistir no Supabase: upsertLead falhou` e sumia do nosso
 * registro. Em 05/08 isso apagou 4 horas de leads (19h-23h): o PowerCRM recebeu 17, o nosso
 * banco registrou zero.
 *
 * O Postgres em si continuava de pe o tempo todo (medido: conecta em 217 ms e responde). Quem
 * cai e a camada REST. Entao a saida e falar com o banco direto, igual o CRM faz.
 *
 * NAO substitui o caminho normal: e so o plano B de quem ja falhou. O lead do cliente nunca
 * depende disto para ser atendido — ele vai pro PowerCRM antes, no caminho critico.
 */

const URL_BANCO = process.env.SUPABASE_DB_URL || ''

/** Curto de proposito: se o banco esta ruim, insistir aqui so segura a resposta do site. */
const TIMEOUT_MS = 8000

export function gravacaoDiretaConfigurada(): boolean {
  return !!URL_BANCO
}

/**
 * Insere (ou atualiza) o lead direto na tabela, pelas colunas que importam para atendimento e
 * atribuicao. De proposito NAO replica as ~80 colunas do upsert normal: o que faltar aqui o
 * webhook e a proxima atualizacao preenchem. O que nao pode faltar e o cliente.
 */
export async function upsertLeadDireto(row: Record<string, unknown>): Promise<string | null> {
  if (!URL_BANCO) return null

  const colunas = [
    'id', 'company_id', 'nome', 'telefone', 'whatsapp', 'email', 'cpf',
    'placa_interesse', 'marca_interesse', 'modelo_interesse', 'ano_interesse',
    'valor_fipe_consultado', 'cotacao_valor', 'cotacao_plano', 'fipe_codigo',
    'origem', 'status', 'etapa_funil', 'trk', 'event_id',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbp', 'fbc', 'ga_client_id', 'external_id',
    'referrer', 'landing_page', 'ip_address', 'user_agent',
    'quotation_code', 'negotiation_code', 'evolution_instance',
    'conversion_value_cents', 'carro_app', 'leilao', 'seguro_atual',
    'created_at', 'updated_at',
  ].filter((c) => row[c] !== undefined)

  const valores = colunas.map((c) => row[c] ?? null)
  const marcadores = colunas.map((_, i) => `$${i + 1}`).join(', ')
  const atualiza = colunas
    .filter((c) => c !== 'id' && c !== 'trk' && c !== 'created_at')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ')

  const sql = `
    INSERT INTO public.leads (${colunas.join(', ')})
    VALUES (${marcadores})
    ON CONFLICT (trk) DO UPDATE SET ${atualiza}
    RETURNING id`

  // Host/usuario separados de proposito, NAO `connectionString`: a URL do Supabase vem com
  // `sslmode=require` e o pg 8.22 trata isso como `verify-full`, entao o certificado deles
  // (self-signed na cadeia) derruba a conexao com SELF_SIGNED_CERT_IN_CHAIN — e o objeto `ssl`
  // passado junto e ignorado. Medido em 06/08/2026: com connectionString falha 8 de 8; com os
  // campos separados conecta em 217 ms.
  const u = new URL(URL_BANCO)
  const cliente = new Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
    statement_timeout: TIMEOUT_MS,
  } as never)

  try {
    await cliente.connect()
    const r = await cliente.query(sql, valores)
    return (r.rows?.[0]?.id as string) ?? null
  } finally {
    await cliente.end().catch(() => {})
  }
}
