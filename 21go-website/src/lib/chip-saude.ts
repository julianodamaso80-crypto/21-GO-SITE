/**
 * Antes de mandar qualquer coisa: esse chip está de pé, e é dele mesmo?
 *
 * ─── A duplicidade que derruba número ────────────────────────────────────────
 *
 * O mesmo número conectado em DUAS instâncias ao mesmo tempo gera conflito de
 * device: o WhatsApp devolve 401 e o chip "mal loga e cai". Já foi a causa raiz
 * de uma sequência de quedas neste projeto, e a regra que ficou é uma só:
 * 1 número = 1 instância aberta.
 *
 * Em 09/09/2026 o `Leticya_Boletos` (5521969620781) estava aberto junto com o
 * `sitelet1234`, no mesmo número. Por isso a checagem virou código: um chip
 * duplicado é tirado do rodízio em vez de queimar tentando enviar.
 *
 * Sem a chave global da Evolution não dá pra enxergar as outras instâncias —
 * nesse caso só o estado da própria instância é conferido, e fica o aviso no
 * log.
 */

import { CHIPS, chaveDo, type ChipRecuperacao } from '@/lib/chips-recuperacao'

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL || 'https://evolution.sinistro21go.site'

const TIMEOUT_MS = 8000

export interface SaudeChip {
  chip: ChipRecuperacao
  apto: boolean
  motivo: string
}

async function buscar(url: string, apikey: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { apikey }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Instâncias abertas por número, pra flagrar o mesmo número em duas. */
async function numerosDuplicados(): Promise<Set<string>> {
  const global = process.env.EVOLUTION_GLOBAL_KEY
  if (!global) {
    console.warn('[chip-saude] sem EVOLUTION_GLOBAL_KEY — duplicidade não checada')
    return new Set()
  }
  const data = await buscar(`${EVOLUTION_API_URL}/instance/fetchInstances`, global)
  if (!Array.isArray(data)) return new Set()

  const abertasPorNumero = new Map<string, number>()
  for (const bruto of data) {
    const i = (bruto as { instance?: Record<string, unknown> }).instance ||
      (bruto as Record<string, unknown>)
    const estado = i.connectionStatus || i.status
    const dono = i.ownerJid || i.owner
    if (estado !== 'open' || typeof dono !== 'string') continue
    const numero = dono.split('@')[0]
    abertasPorNumero.set(numero, (abertasPorNumero.get(numero) || 0) + 1)
  }

  const duplicados = new Set<string>()
  for (const [numero, quantas] of abertasPorNumero) {
    if (quantas > 1) duplicados.add(numero)
  }
  return duplicados
}

async function estaAberta(chip: ChipRecuperacao): Promise<boolean> {
  const data = await buscar(
    `${EVOLUTION_API_URL}/instance/connectionState/${chip.instancia}`,
    chaveDo(chip),
  )
  const estado = (data as { instance?: { state?: string } } | null)?.instance?.state
  return estado === 'open'
}

/** O estado de cada chip do rodízio, na ordem em que foram declarados. */
export async function saudeDosChips(): Promise<SaudeChip[]> {
  const duplicados = await numerosDuplicados()

  return Promise.all(
    CHIPS.map(async (chip): Promise<SaudeChip> => {
      if (!chaveDo(chip)) {
        return { chip, apto: false, motivo: `${chip.envChave} não configurada` }
      }
      if (duplicados.has(chip.numero)) {
        return {
          chip,
          apto: false,
          motivo: `número ${chip.numero} aberto em mais de uma instância — resolver antes de usar`,
        }
      }
      if (!(await estaAberta(chip))) {
        return { chip, apto: false, motivo: 'instância não está open' }
      }
      return { chip, apto: true, motivo: 'ok' }
    }),
  )
}
