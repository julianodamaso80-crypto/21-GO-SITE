#!/usr/bin/env node --test
/**
 * Guarda-corpo da regra de "faz / nao faz". Roda com:
 *   node --test scripts/testar-elegibilidade.mjs
 *
 * Existe por causa de 06/08/2026: cliente ouviu "nao fazemos esse veiculo" de um carro que a
 * 21Go faz. A causa foi lista mantida por fora do Power decidindo sozinha. Estes testes travam
 * o principio que o dono definiu no mesmo dia: o site segue 100% o Power, e so o Power
 * dispensa cliente.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

const { decidirElegibilidade } = await import('../src/lib/elegibilidade.regras.ts')

test('Power confirmou plano — cota', () => {
  assert.deepEqual(
    decidirElegibilidade({ powerAoVivo: true, allowlist: true }),
    { acao: 'cotar' },
  )
})

test('Power confirmou plano mas a allowlist esta velha — o Power vence, cota', () => {
  // Caso real: BYD Dolphin Mini (id 12717) cotava no Power e a allowlist de 3 dias bloqueava.
  assert.deepEqual(
    decidirElegibilidade({ powerAoVivo: true, allowlist: false }),
    { acao: 'cotar' },
  )
})

test('Power confirmou que NAO ha plano — ai sim dispensa', () => {
  assert.deepEqual(
    decidirElegibilidade({ powerAoVivo: false, allowlist: true }),
    { acao: 'nao_fazemos', motivo: 'model' },
  )
})

test('Power mudo + suspeita da allowlist — consultor, NUNCA "nao fazemos"', () => {
  const r = decidirElegibilidade({ powerAoVivo: null, allowlist: false })
  assert.equal(r.acao, 'consultor')
  assert.notEqual(r.acao, 'nao_fazemos')
})

test('Power mudo sem suspeita — cota (API que pisca nao pode derrubar venda)', () => {
  assert.deepEqual(
    decidirElegibilidade({ powerAoVivo: null, allowlist: true }),
    { acao: 'cotar' },
  )
  assert.deepEqual(
    decidirElegibilidade({ powerAoVivo: null, allowlist: null }),
    { acao: 'cotar' },
  )
})

test('nenhuma combinacao dispensa cliente sem o Power ter dito "nao"', () => {
  for (const allowlist of [true, false, null]) {
    const r = decidirElegibilidade({ powerAoVivo: null, allowlist })
    assert.notEqual(r.acao, 'nao_fazemos', `allowlist=${allowlist} dispensou cliente no escuro`)
  }
})

