import 'server-only'
import { WHATSAPP_TARGETS, type WhatsAppTarget } from './constants'

/**
 * Rodízio dos números de WhatsApp que recebem os contatos do site, com failover
 * automático pro número que estiver no ar.
 *
 * REGRA (decisão do dono, 2026-08-03):
 *  1. Com os três chips no ar: a cada 4 contatos, 2 caem no 4882, 1 no 5734 e
 *     1 no 4824. Fila fixa [4882, 4882, 5734, 4824] — não é sorteio, pra
 *     proporção não desandar em volume baixo.
 *  2. Se um cair, o tráfego dele se redistribui entre os que sobraram. O site
 *     nunca pode mandar cliente pra número derrubado.
 *
 * O estado de cada chip vem da Evolution (`/instance/connectionState/<inst>`),
 * que responde `{"instance":{"state":"open"}}` quando o chip está conectado.
 * Cada instância exige a SUA apikey — a chave de uma devolve 401 na outra.
 */

const PROBE_TIMEOUT_MS = 2500
/** Enquanto o cache está fresco, nenhum clique bate na Evolution. */
const CACHE_TTL_MS = 60_000
/** Passado isso, o cache velho para de ser aceito mesmo sem resposta nova. */
const STALE_MAX_MS = 10 * 60_000

const EVOLUTION_URL =
  process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'

export interface TargetHealth {
  number: string
  instance: string
  online: boolean
  /** Estado cru da Evolution ("open", "close", "connecting") ou o erro. */
  state: string
  checkedAt: number
}

interface HealthCache {
  health: Map<string, TargetHealth>
  updatedAt: number
}

let cache: HealthCache | null = null
let inFlight: Promise<HealthCache> | null = null
let cursor = 0

function apiKeyFor(target: WhatsAppTarget): string {
  return process.env[target.apiKeyEnv] || ''
}

/** Consulta a Evolution. Qualquer falha conta como offline pra este chip. */
async function probe(target: WhatsAppTarget): Promise<TargetHealth> {
  const base: Omit<TargetHealth, 'online' | 'state'> = {
    number: target.number,
    instance: target.instance,
    checkedAt: Date.now(),
  }

  const apikey = apiKeyFor(target)
  if (!apikey) {
    // Sem chave não dá pra CONFIRMAR que o chip está conectado, e lead só vai
    // pra número confirmado no Evolution (regra do dono, 2026-08-03). Fica de
    // fora do rodízio até a env aparecer — o alerta abaixo é o que denuncia o
    // erro de configuração.
    console.warn(
      `[wa] ${target.number}: env ${target.apiKeyEnv} ausente — fora do rodízio até configurar`,
    )
    return { ...base, online: false, state: 'sem-apikey' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(target.instance)}`,
      { headers: { apikey }, signal: controller.signal, cache: 'no-store' },
    )
    if (!res.ok) {
      return { ...base, online: false, state: `http-${res.status}` }
    }
    const data = (await res.json()) as { instance?: { state?: string } }
    const state = data?.instance?.state || 'desconhecido'
    return { ...base, online: state === 'open', state }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'erro'
    return { ...base, online: false, state: reason }
  } finally {
    clearTimeout(timer)
  }
}

async function refresh(): Promise<HealthCache> {
  const results = await Promise.all(WHATSAPP_TARGETS.map(probe))
  const health = new Map(results.map((r) => [r.number, r]))
  cache = { health, updatedAt: Date.now() }

  const offline = results.filter((r) => !r.online)
  if (offline.length) {
    console.warn(
      `[wa] chip fora do ar: ${offline.map((o) => `${o.number}(${o.state})`).join(', ')}`,
    )
  }
  return cache
}

/** Uma revalidação por vez — muitos cliques simultâneos não viram N requests. */
function refreshOnce(): Promise<HealthCache> {
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function getHealth(): Promise<HealthCache> {
  const age = cache ? Date.now() - cache.updatedAt : Infinity

  // Cache fresco: responde na hora.
  if (cache && age < CACHE_TTL_MS) return cache

  // Cache morno: usa o que tem e revalida por fora, pro clique não esperar.
  if (cache && age < STALE_MAX_MS) {
    void refreshOnce()
    return cache
  }

  // Sem cache utilizável (primeiro clique após deploy, ou Evolution muda tempo
  // demais): vale esperar o probe pra não mandar ninguém pro número errado.
  return refreshOnce()
}

/**
 * Devolve o próximo número do rodízio, pulando os que estiverem fora do ar.
 * Lead só vai pra chip com `state: "open"` confirmado no Evolution.
 *
 * Exceção única (decisão do dono, 2026-08-03): se TODOS estiverem fora, devolve
 * o primeiro assim mesmo. Instância caída no Evolution não quer dizer WhatsApp
 * morto — o número segue funcionando no celular da consultora, ela só não
 * recebe pelo sistema. Melhor isso do que site sem botão de contato.
 */
export async function pickWhatsAppTarget(): Promise<WhatsAppTarget> {
  // Alvo único: não há escolha a fazer, então não se consulta a Evolution. Isso
  // tira do caminho do clique a única dependência externa que podia atrasar ou
  // falhar — o cliente vai pro WhatsApp mesmo com a Evolution fora do ar.
  if (WHATSAPP_TARGETS.length === 1) return WHATSAPP_TARGETS[0]

  const { health } = await getHealth()
  const online = WHATSAPP_TARGETS.filter((t) => health.get(t.number)?.online !== false)

  if (online.length === 0) {
    console.error('[wa] TODOS os chips fora do ar — mandando pro primeiro mesmo assim')
    return WHATSAPP_TARGETS[0]
  }

  // Um só no ar: leva tudo, sem rodízio.
  if (online.length === 1) return online[0]

  // Todos no ar: fila com as fatias (2 do 4882, 1 do 5734, 1 do 4824).
  const queue = online.flatMap((t) =>
    Array.from({ length: Math.max(1, t.share) }, () => t),
  )
  const target = queue[cursor % queue.length]
  cursor += 1
  return target
}

/** Estado atual pra diagnóstico (`/api/wa/status`). Força uma checagem nova. */
export async function whatsappStatus(): Promise<{
  targets: TargetHealth[]
  online: string[]
  checkedAt: number
}> {
  const { health, updatedAt } = await refreshOnce()
  const targets = [...health.values()]
  return {
    targets,
    online: targets.filter((t) => t.online).map((t) => t.number),
    checkedAt: updatedAt,
  }
}
