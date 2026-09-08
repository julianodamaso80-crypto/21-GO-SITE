import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vencimentoEfetivo } from '../../src/lib/cobranca.regras.ts'

/*
 * A data que pode disparar aviso e corte. Os casos abaixo sao todos reais.
 */

test('hugoaguiar: parcela OVERDUE orfa nao cobra de novo quem pagou', () => {
  // 14/08/2026: pagou, mas o Pix caiu na parcela de setembro e a de 17/08 ficou
  // aberta pra sempre. Olhando so a parcela, ele e caloteiro de um mes.
  assert.equal(vencimentoEfetivo('2026-08-17', '2026-08-14', 'OVERDUE'), '2026-09-13')
})

test('andersonagripino: parcela PENDING no dia combinado manda na data', () => {
  // Pagou 12/08 e o vencimento dele virou dia 10 (ordem do dono, 08/09/2026).
  // O piso dos 30 dias daria 11/09 — mas a mensagem tem que anunciar a data do
  // boleto cujo link ela manda junto, senao diz 11 e o boleto diz 10.
  assert.equal(vencimentoEfetivo('2026-09-10', '2026-08-12', 'PENDING'), '2026-09-10')
})

test('sem parcela aberta: sobra o piso do ciclo (pagamento + 30)', () => {
  // A Renata, 21/08/2026: pagou e o Asaas ainda nao gerou a proxima parcela.
  assert.equal(vencimentoEfetivo(null, '2026-08-21', null), '2026-09-20')
})

test('quem nunca pagou: vale a parcela, sem piso nenhum', () => {
  assert.equal(vencimentoEfetivo('2026-09-15', null, 'PENDING'), '2026-09-15')
})

test('nada em aberto e nunca pagou: nao ha data', () => {
  assert.equal(vencimentoEfetivo(null, null, null), null)
})

test('OVERDUE anterior ao pagamento continua protegida mesmo com folga grande', () => {
  // Parcela velha de julho aberta, pagamento em agosto: o piso e quem manda.
  assert.equal(vencimentoEfetivo('2026-07-10', '2026-08-20', 'OVERDUE'), '2026-09-19')
})

test('PENDING futura mais distante que o piso: vale a parcela', () => {
  // O piso nunca ANTECIPA — so protege. Parcela em 16/10 com pagamento em 08/09
  // (o manghi): piso 08/10, parcela 16/10, vence a parcela.
  assert.equal(vencimentoEfetivo('2026-10-16', '2026-09-08', 'PENDING'), '2026-10-16')
})
