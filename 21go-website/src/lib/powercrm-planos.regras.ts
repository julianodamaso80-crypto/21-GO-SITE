/**
 * Regra de leitura dos planos do PowerCRM. Fica separada do client (`powercrm-planos.ts`,
 * que e server-only) pra poder ser testada sem subir o Next — mesmo motivo do
 * `cobertura.regras.ts` no CRM.
 */

/**
 * Monitoramento e "Roubo e Furto + Ass 24h" sao rastreador/cobertura parcial — o site nao vende
 * nenhum dos dois. Criterio do dono (31/07/2026): so vale o veiculo que faz aparecer plano de
 * protecao de verdade (BASICO, Do Seu Jeito, VIP, VIP SUV, VIP ESPECIAIS, VIP MOTOS, PREMIUM).
 *
 * Compara pelo COMECO do nome de proposito: "ROUBO E FURTO + Ass 24h + Monitoramento" nao pode
 * passar por protecao so porque contem "Roubo e Furto", nem ser confundido com monitoramento
 * puro porque termina em "Monitoramento".
 */
export function ePlanoDeProtecao(nome: string): boolean {
  const n = nome.trim().toLowerCase()
  if (!n) return false
  return !n.startsWith('monitoramento') && !n.startsWith('roubo e furto')
}
