import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { esquecerConsultor, resolverConsultor } from '../consultor'
import { sendText } from '../whatsapp'
import { avisar } from '../whatsapp-avisos'

/**
 * O WhatsApp do proprio consultor, conectado por QR no painel dele.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * O unico numero conectado era o da casa (`site4824`). Por isso o site vendido
 * nao podia disparar nada: qualquer mensagem chegava ao cliente assinada
 * "consultora leticya" e o lead que o consultor pagou pra ter era abordado por
 * outra pessoa (REGRA 0.1). Com o chip DELE conectado, o motivo da proibicao
 * deixa de existir para o site dele.
 *
 * ⚠️ Criar instancia exige a chave GLOBAL da Evolution (`EVOLUTION_GLOBAL_KEY`),
 * nao a chave de instancia que o site usa pra enviar: com a de instancia o
 * `/instance/create` responde 401.
 *
 * ⚠️ Um numero em duas instancias `open` ao mesmo tempo da device conflict 401 e
 * o chip "mal loga e cai" — foi o que derrubou o numero da casa por semanas.
 * Por isso `desconectar` faz logout ANTES de delete, e nunca criamos uma segunda
 * instancia pro mesmo consultor.
 */

const URL_EVO = process.env.EVOLUTION_API_URL || ''
const CHAVE_GLOBAL = process.env.EVOLUTION_GLOBAL_KEY || ''
const WEBHOOK = 'https://21go.com.br/api/webhooks/evolution'

export type EstadoConexao = 'conectado' | 'conectando' | 'desconectado' | 'sem_instancia'

export function nomeDaInstancia(consultorSlug: string): string {
  return `parceiro_${consultorSlug}`
}

export function configurado(): boolean {
  return Boolean(URL_EVO && CHAVE_GLOBAL)
}

async function evo(
  caminho: string,
  init: RequestInit = {},
): Promise<{ status: number; corpo: Record<string, unknown> | null }> {
  const r = await fetch(`${URL_EVO}${caminho}`, {
    ...init,
    headers: { apikey: CHAVE_GLOBAL, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null
  return { status: r.status, corpo }
}

function traduzir(bruto: unknown): EstadoConexao {
  const s = String(bruto ?? '').toLowerCase()
  if (s === 'open') return 'conectado'
  if (s === 'connecting') return 'conectando'
  return 'desconectado'
}

export async function estadoDaConexao(consultorSlug: string): Promise<{
  estado: EstadoConexao
  numero: string | null
}> {
  const { data } = await supabaseAdmin()
    .from('sites_consultor')
    .select('evolution_instancia, evolution_numero, evolution_url, evolution_chave')
    .eq('slug', consultorSlug)
    .maybeSingle()

  const instancia = (data?.evolution_instancia as string) || null
  if (!instancia) return { estado: 'sem_instancia', numero: null }

  const url = (data?.evolution_url as string) || URL_EVO
  const chave = (data?.evolution_chave as string) || CHAVE_GLOBAL
  const r = await fetch(`${url}/instance/connectionState/${instancia}`, { headers: { apikey: chave } })
  if (r.status === 404) return { estado: 'sem_instancia', numero: null }
  const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null

  const dentro = (corpo?.instance ?? corpo) as Record<string, unknown> | null
  return {
    estado: traduzir(dentro?.state ?? dentro?.connectionStatus),
    numero: (data?.evolution_numero as string) ?? null,
  }
}

/**
 * Devolve o QR pra ele ler. Se a instancia ja existe mas caiu, reaproveita —
 * criar de novo geraria uma segunda instancia pro mesmo numero.
 */
export async function gerarQrCode(consultorSlug: string): Promise<{
  qr: string | null
  estado: EstadoConexao
}> {
  if (!configurado()) return { qr: null, estado: 'sem_instancia' }
  const instancia = nomeDaInstancia(consultorSlug)

  const atual = await evo(`/instance/connectionState/${instancia}`)
  const existe = atual.status !== 404

  if (existe) {
    const dentro = (atual.corpo?.instance ?? atual.corpo) as Record<string, unknown> | null
    const estado = traduzir(dentro?.state ?? dentro?.connectionStatus)
    if (estado === 'conectado') {
      await guardarInstancia(consultorSlug, instancia)
      return { qr: null, estado }
    }
    // Caiu: pede QR novo sem recriar a instancia.
    const { corpo } = await evo(`/instance/connect/${instancia}`)
    const qr = (corpo?.base64 as string) || ((corpo?.qrcode as Record<string, unknown>)?.base64 as string) || null
    return { qr, estado: 'conectando' }
  }

  /**
   * ⚠️ NADA de `webhook` aqui dentro.
   *
   * Esta versao da Evolution responde 400 ("Cannot read properties of
   * undefined") quando o `create` leva o objeto de webhook junto — medido em
   * 20/08/2026, contra 201 sem ele. O webhook e configurado logo depois, no
   * endpoint proprio.
   */
  const { corpo } = await evo('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: instancia,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })

  const qr = ((corpo?.qrcode as Record<string, unknown>)?.base64 as string) || (corpo?.base64 as string) || null
  if (!qr) {
    console.error('[whatsapp-proprio] create sem QR:', JSON.stringify(corpo).slice(0, 300))
    return { qr: null, estado: 'desconectado' }
  }

  await definirWebhook(instancia)
  await guardarInstancia(consultorSlug, instancia)
  return { qr, estado: 'conectando' }
}

/** Sem isto, mensagem recebida no chip dele nao chega ao nosso sistema. */
async function definirWebhook(instancia: string): Promise<void> {
  const { status } = await evo(`/webhook/set/${instancia}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: WEBHOOK,
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'],
      },
    }),
  })
  if (status >= 400) console.warn(`[whatsapp-proprio] webhook/set devolveu ${status}`)
}

async function guardarInstancia(consultorSlug: string, instancia: string): Promise<void> {
  await supabaseAdmin()
    .from('sites_consultor')
    .update({ evolution_instancia: instancia })
    .eq('slug', consultorSlug)
  esquecerConsultor(consultorSlug)
}

/** Chamado quando o painel detecta que conectou: guarda o numero e a data. */
export async function marcarConectado(consultorSlug: string): Promise<string | null> {
  const instancia = nomeDaInstancia(consultorSlug)
  const { corpo } = await evo('/instance/fetchInstances')
  const lista = Array.isArray(corpo) ? corpo : ((corpo as { instances?: unknown[] })?.instances ?? [])

  let numero: string | null = null
  for (const bruta of lista as Record<string, unknown>[]) {
    const i = (bruta.instance ?? bruta) as Record<string, unknown>
    if ((i.instanceName ?? i.name) !== instancia) continue
    const dono = (i.owner ?? i.number ?? '') as string
    numero = dono ? dono.replace(/\D/g, '').replace(/^(\d+)$/, '$1') : null
  }

  await supabaseAdmin()
    .from('sites_consultor')
    .update({
      evolution_instancia: instancia,
      evolution_conectado_em: new Date().toISOString(),
      evolution_numero: numero,
    })
    .eq('slug', consultorSlug)
  esquecerConsultor(consultorSlug)
  return numero
}

/** O interruptor de falar com o cliente pelo numero dele. */
export async function lerEnvioAoCliente(consultorSlug: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('sites_consultor')
    .select('enviar_ao_cliente')
    .eq('slug', consultorSlug)
    .maybeSingle()
  return Boolean(data?.enviar_ao_cliente)
}

export async function definirEnvioAoCliente(consultorSlug: string, ligado: boolean): Promise<void> {
  await supabaseAdmin()
    .from('sites_consultor')
    .update({ enviar_ao_cliente: ligado })
    .eq('slug', consultorSlug)
  esquecerConsultor(consultorSlug)
}

export async function desconectar(consultorSlug: string): Promise<void> {
  const instancia = nomeDaInstancia(consultorSlug)
  // Logout ANTES do delete: numero que fica `open` em duas instancias entra em
  // device conflict e passa a cair sozinho.
  await evo(`/instance/logout/${instancia}`, { method: 'DELETE' }).catch(() => {})
  await evo(`/instance/delete/${instancia}`, { method: 'DELETE' }).catch(() => {})

  await supabaseAdmin()
    .from('sites_consultor')
    .update({ evolution_instancia: null, evolution_conectado_em: null, evolution_numero: null })
    .eq('slug', consultorSlug)
  esquecerConsultor(consultorSlug)
}

/**
 * A conta que deve enviar pelo site deste consultor: a dele, se conectada.
 * `null` = usa a da casa (ou nao envia, conforme a regra de quem chama).
 */
export async function contaDoConsultor(
  consultorSlug: string,
): Promise<{ instancia: string; chave: string; url: string } | null> {
  const { data } = await supabaseAdmin()
    .from('sites_consultor')
    .select('evolution_instancia, evolution_url, evolution_chave')
    .eq('slug', consultorSlug)
    .maybeSingle()

  const instancia = (data?.evolution_instancia as string) || null
  if (!instancia) return null

  // Conta conectada a mao noutro servidor Evolution: url e chave proprias.
  const url = (data?.evolution_url as string) || URL_EVO
  const chave = (data?.evolution_chave as string) || CHAVE_GLOBAL
  if (!url || !chave) return null

  // So envia por chip que esta de pe — mandar pra instancia caida some com a
  // mensagem sem erro nenhum.
  try {
    const r = await fetch(`${url}/instance/connectionState/${instancia}`, { headers: { apikey: chave } })
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
    const dentro = (j?.instance ?? j) as Record<string, unknown> | null
    if (traduzir(dentro?.state ?? dentro?.connectionStatus) !== 'conectado') return null
  } catch {
    return null
  }

  return { instancia, chave, url }
}

/**
 * Avisa o consultor que entrou gente nova pra indicar por ele.
 *
 * Pelo numero DELE quando conectado; senao pela instancia de avisos da casa.
 * Cadastro de indicador que ninguem ve e rede que nao cresce: ele precisa saber
 * pra ativar a pessoa no mesmo dia.
 */
export async function avisarIndicadorNovo(dados: {
  consultorSlug: string
  nome: string
  whatsapp: string
  link: string
}): Promise<void> {
  const consultor = await resolverConsultor(dados.consultorSlug)
  if (!consultor?.whatsapp) return

  const texto =
    `🤝 *Entrou gente nova pra te indicar*

` +
    `*${dados.nome}*
` +
    `WhatsApp: ${dados.whatsapp}

` +
    `Link de divulgação dele(a):
${dados.link}

` +
    `Todo lead que entrar por esse link aparece no seu painel no nome dele(a).`

  const conta = await contaDoConsultor(dados.consultorSlug)
  try {
    if (conta) {
      await sendText(consultor.whatsapp, texto, conta)
      return
    }
  } catch (err) {
    console.warn('[indicador] aviso pela conta do consultor falhou:', err instanceof Error ? err.message : err)
  }
  await avisar(consultor.whatsapp, texto)
}
