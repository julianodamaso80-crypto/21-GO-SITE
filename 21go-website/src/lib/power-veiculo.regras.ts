/**
 * Conferencia do veiculo que o PowerCRM gravou na cotacao. Separada do route (server-only)
 * pra ser testada sem subir o Next.
 *
 * Placa, modelo e ano modelo sao obrigatorios na cotacao (dono, 22/09/2026): sem placa a
 * busca do consultor nao acha o lead. Em 21/09 a Ana (Duster 2015) nasceu "Boreal Zero KM"
 * sem placa e outro consultor cadastrou a placa dela em outro CRM.
 */

export interface VeiculoLidoDoPower {
  plate?: string | null
  carModel?: string | null
  carModelYear?: string | null
}

export interface VeiculoEsperado {
  placa?: string | null
  modelo?: string | null
  anoModelo?: number | null
}

export interface Divergencia {
  campo: 'placa' | 'modelo' | 'ano'
  esperado: string
  lido: string
}

const normalizarPlaca = (s?: string | null) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const normalizarModelo = (s?: string | null) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim()

/**
 * Ano modelo que vai pro Power. Sem ano modelo, repete o de fabricacao (dono, 22/09/2026).
 * Nunca inventa: 32000 e o codigo FIPE de zero-km, nao um ano.
 */
export function anoModeloParaPower(p: { anoModelo?: number | null; anoFabricacao?: number | null }): number | null {
  const valido = (n?: number | null) => (n && n >= 1900 && n <= 2100 ? n : null)
  return valido(p.anoModelo) ?? valido(p.anoFabricacao)
}

/** O que o Power gravou diferente do que o site sabe. Campo que o site nao sabe nao e cobrado. */
export function divergenciasDoVeiculo(lido: VeiculoLidoDoPower, esperado: VeiculoEsperado): Divergencia[] {
  const out: Divergencia[] = []

  const placa = normalizarPlaca(esperado.placa)
  if (placa && normalizarPlaca(lido.plate) !== placa) {
    out.push({ campo: 'placa', esperado: placa, lido: lido.plate || '(vazia)' })
  }

  const modelo = normalizarModelo(esperado.modelo)
  if (modelo && normalizarModelo(lido.carModel) !== modelo) {
    out.push({ campo: 'modelo', esperado: esperado.modelo || '', lido: lido.carModel || '(vazio)' })
  }

  const ano = esperado.anoModelo
  if (ano && !(lido.carModelYear || '').trim().startsWith(String(ano))) {
    out.push({ campo: 'ano', esperado: String(ano), lido: lido.carModelYear || '(vazio)' })
  }

  return out
}
