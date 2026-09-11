import 'server-only'

/**
 * Consulta de placa via API Brasil — endpoint /consulta/veiculos/credits.
 *
 * Esse é o MESMO endpoint que o backend do CRM (crm-21go) já usa em produção
 * (ver crm-21go/backend/src/modules/plate-lookup/plate-lookup.service.ts).
 * Tipo "fipe" (R$ 0,06 nesta conta). A de R$ 0,10 ("fipe-chassi") foi removida pra sempre.
 *
 * Usado como 2ª etapa da cascata em plate-lookup.ts quando o PowerCRM
 * encontra o veículo mas não retorna valor FIPE (`fipeValue: 0`).
 *
 * REGRA ABSOLUTA: valor FIPE NUNCA pode ser zero/null. Se a API Brasil
 * também não retornar valor confiável, retornamos null e quem chama TEM
 * que mandar pra atendimento humano.
 *
 * Configuração: só APIBRASIL_TOKEN (Bearer JWT). Esse endpoint NÃO
 * exige DeviceToken — é cobrado por crédito direto.
 */

const APIBRASIL_ENDPOINT =
  'https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits'
const TIMEOUT_MS = 10000

const APIBRASIL_TOKEN = process.env.APIBRASIL_TOKEN || ''

export interface ApiBrasilVehicleResult {
  fipeValue: number
  marca: string
  modelo: string
  ano: string
  cor?: string
  codFipe?: string
  combustivel?: string
  cilindrada?: number
  chassi?: string
  categoria?: string
  source: 'apibrasil'
}

/**
 * Estrutura retornada pelo endpoint /consulta/veiculos/credits.
 * Validada via testes em 2026-05-07 com placa KPO6E94 (Montana 2013).
 */
interface ApiBrasilCreditsResponse {
  error?: boolean
  message?: string
  status_code?: number
  balance?: string
  balance_before?: string
  tax?: string
  valor_consulta?: number
  /** 'fipe' devolve a lista direto; o formato antigo ('fipe-chassi') vinha em `resultados`. */
  data?: ResultadoApiBrasil[] | { resultados?: ResultadoApiBrasil[] }
}

interface ResultadoApiBrasil {
  anoFabricacao?: number
  anoModelo?: string | number
  categoria?: string
  chassi?: string
  codigoFipe?: string
  combustivel?: string
  cor?: string
  historico?: Array<{ mes: string; valor: number }>
  marca?: string
  mesReferencia?: string
  modelo?: string
  principal?: boolean
  valor?: number
}

/**
 * A consulta de R$ 0,10 ('fipe-chassi') foi removida pra sempre por ordem do dono (11/09/2026) —
 * ele quer so a de R$ 0,03, que NAO existe nesta conta (tipos medidos: fipe R$ 0,06, fipe-chassi
 * R$ 0,10, agregados-basica R$ 0,14). A 'fipe' fica pronta e DESLIGADA ate ele autorizar
 * (APIBRASIL_FIPE=on). Desligada, a cascata segue sem API Brasil: Parallelum pelo codFipe do
 * Power, senao atendimento/confirmacao.
 */
export function isApiBrasilConfigured(): boolean {
  return Boolean(APIBRASIL_TOKEN) && process.env.APIBRASIL_FIPE === 'on'
}

/**
 * Consulta placa na API Brasil. Retorna null se:
 *   - credenciais não configuradas
 *   - placa não encontrada / sem resultados
 *   - resposta sem FIPE válido (fipeValue <= 0)
 *
 * Caller TEM que tratar null como "API Brasil não resolveu" e seguir
 * pra próxima etapa da cascata (Parallelum / atendimento humano).
 */
export async function lookupApiBrasilByPlate(
  placa: string,
): Promise<ApiBrasilVehicleResult | null> {
  if (!APIBRASIL_TOKEN) {
    console.warn('[apibrasil] APIBRASIL_TOKEN ausente — pulando')
    return null
  }

  const normalized = (placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.length !== 7) return null

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let raw: ApiBrasilCreditsResponse | null = null
  try {
    const res = await fetch(APIBRASIL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${APIBRASIL_TOKEN}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        // NUNCA 'fipe-chassi' (R$ 0,10) — ordem do dono, 11/09/2026: "apaga isso pra sempre".
        // 'fipe' custa R$ 0,06 nesta conta (medido em 11/09) e so roda com APIBRASIL_FIPE=on.
        tipo: 'fipe',
        placa: normalized,
        homolog: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`[apibrasil] HTTP ${res.status}: ${txt.slice(0, 200)}`)
      return null
    }
    raw = (await res.json().catch(() => null)) as ApiBrasilCreditsResponse | null
  } catch (err) {
    console.warn('[apibrasil] erro/timeout:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(t)
  }

  if (!raw || raw.error) {
    console.warn('[apibrasil] resposta com error:', raw?.message)
    return null
  }

  // 'fipe' devolve a lista direto em `data`; o formato antigo vinha em `data.resultados`.
  const resultados = Array.isArray(raw.data) ? raw.data : raw.data?.resultados
  if (!resultados || resultados.length === 0) {
    console.warn('[apibrasil] sem resultados pra placa', normalized)
    return null
  }

  // Prefere o resultado marcado como `principal: true`.
  // Se nenhum for principal, escolhe o de maior `valor` (fallback).
  const principal = resultados.find((r) => r.principal) ||
    [...resultados].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))[0]

  const fipeValue = principal.valor || 0
  if (fipeValue <= 0) {
    console.warn('[apibrasil] resultado sem valor FIPE valido:', principal.modelo)
    return null
  }

  const ano = String(principal.anoModelo ?? principal.anoFabricacao ?? '').match(/(\d{4})/)?.[1] || ''

  // categoria: API Brasil retorna "carro" / "moto" / "caminhao"
  const cat = (principal.categoria || '').toLowerCase()
  const categoria = cat.includes('moto')
    ? 'MOTOCICLETA'
    : cat.includes('caminh')
      ? 'CAMINHAO'
      : 'AUTOMOVEL'

  console.log(
    `[apibrasil] OK placa=${normalized} fipe=R$${fipeValue} (${principal.marca} ${principal.modelo} ${ano}) custo=R$${raw.tax ?? '0,06'}`,
  )

  return {
    fipeValue,
    marca: String(principal.marca || '').trim(),
    modelo: String(principal.modelo || '').trim(),
    ano,
    cor: principal.cor ? String(principal.cor) : undefined,
    codFipe: principal.codigoFipe ? String(principal.codigoFipe) : undefined,
    combustivel: principal.combustivel ? String(principal.combustivel) : undefined,
    cilindrada: undefined,
    chassi: principal.chassi ? String(principal.chassi) : undefined,
    categoria,
    source: 'apibrasil',
  }
}
