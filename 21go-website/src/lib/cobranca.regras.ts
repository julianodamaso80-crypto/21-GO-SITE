/**
 * As regras de data da cobranca — puras, sem `server-only`, pra poderem ser
 * testadas fora do Next (mesmo motivo de `powercrm-planos.regras.ts`).
 *
 * `lib/asaas.ts` reexporta o que esta aqui: quem importa continua importando de
 * la, este arquivo e so onde a regra mora.
 */

/** Depois de pago, ninguem e cobrado de novo antes disto. Ordem do dono. */
export const DIAS_DO_CICLO = 30

/**
 * A data que o consultor REALMENTE tem que pagar — a unica que pode disparar
 * aviso ou corte.
 *
 * ─── Duas verdades que brigam ────────────────────────────────────────────────
 *
 * 1. *"quem pagou tem 30 dias de site"* — uma parcela que ficou aberta por
 *    descasamento do Asaas nao pode cobrar de novo o mes que ja foi pago. O caso
 *    que provou isso e o hugoaguiar: pagou em 14/08/2026, o Pix caiu na parcela
 *    de 17/09 e a de 17/08 ficou OVERDUE pra sempre. Olhando so a parcela, ele e
 *    um caloteiro de um mes e leva corte; olhando o pagamento, esta em dia.
 *
 * 2. *"cobrar o cliente na data certa e nao data errada"* — a mensagem manda o
 *    LINK do boleto junto. Se ela anuncia 11/09 e o boleto diz 10/09, o
 *    consultor le duas datas diferentes na mesma mensagem.
 *
 * ─── Como as duas convivem ───────────────────────────────────────────────────
 *
 * O piso dos 30 dias vale quando a parcela aberta **ja venceu** (OVERDUE) ou
 * quando nao ha parcela nenhuma. Uma parcela que ainda nao venceu (PENDING) e
 * um compromisso futuro com data acordada: ela manda, e o piso nao a empurra.
 *
 * Isso apareceu em 08/09/2026, quando o vencimento do `andersonagripino` virou
 * dia 10 fixo: ele pagou em 12/08, o piso dava 11/09 e o boleto, 10/09.
 *
 * ⚠️ O piso NUNCA antecipa nada — ele so adia. Parcela futura mais distante que
 * o piso continua valendo pela data dela.
 */
export function vencimentoEfetivo(
  vencimentoAberto: string | null,
  ultimoPagamentoEm: string | null,
  statusDaAberta: string | null,
): string | null {
  if (!ultimoPagamentoEm) return vencimentoAberto

  const trintaDepois = new Date(`${ultimoPagamentoEm.slice(0, 10)}T00:00:00`)
  trintaDepois.setDate(trintaDepois.getDate() + DIAS_DO_CICLO)
  const pisoDoCiclo = trintaDepois.toISOString().slice(0, 10)

  if (!vencimentoAberto) return pisoDoCiclo

  // Parcela que ainda nao venceu: a data dela e a verdade que o consultor ve no
  // boleto. Sem esta linha, um vencimento acordado que caia menos de 30 dias
  // depois do ultimo pagamento seria anunciado com a data errada.
  if (statusDaAberta === 'PENDING') return vencimentoAberto

  return vencimentoAberto > pisoDoCiclo ? vencimentoAberto : pisoDoCiclo
}
