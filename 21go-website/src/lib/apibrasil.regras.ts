/**
 * Onde a API Brasil poe a lista de veiculos. O tipo 'fipe' (R$ 0,06) devolve em `data.data`
 * (medido em 11/09/2026); o antigo 'fipe-chassi' devolvia em `data.resultados`.
 */

export interface ResultadoApiBrasil {
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

export function resultadosDaApiBrasil(data: unknown): ResultadoApiBrasil[] {
  if (Array.isArray(data)) return data
  const d = (data ?? {}) as { data?: unknown; resultados?: unknown }
  if (Array.isArray(d.data)) return d.data
  if (Array.isArray(d.resultados)) return d.resultados
  return []
}
