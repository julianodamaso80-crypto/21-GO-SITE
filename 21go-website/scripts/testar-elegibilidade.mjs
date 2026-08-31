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

const { decidirElegibilidade, ANO_MINIMO, aceitaAno } = await import('../src/lib/elegibilidade.regras.ts')

test('Power confirmou plano — cota', () => {
  assert.deepEqual(
    decidirElegibilidade({ ano: 2020, powerAoVivo: true, allowlist: true }),
    { acao: 'cotar' },
  )
})

test('ano abaixo de 2006 nao passa NEM com o Power dando plano', () => {
  // Caso real 12/08/2026: Ford Ka GL 1.0i Zetec Rocam 2003 (id 1678) saiu cotado. O Power
  // devolve BASICO/Do Seu Jeito/VIP/PREMIUM pra ele — a trava do ano e do site, nao do Power.
  assert.deepEqual(
    decidirElegibilidade({ ano: 2003, powerAoVivo: true, allowlist: true }),
    { acao: 'nao_fazemos', motivo: 'ano' },
  )
  assert.deepEqual(
    decidirElegibilidade({ ano: 2005, powerAoVivo: true, allowlist: true }),
    { acao: 'nao_fazemos', motivo: 'ano' },
  )
})

test('2006 e o primeiro ano aceito', () => {
  assert.equal(ANO_MINIMO, 2006)
  assert.equal(aceitaAno(2006), true)
  assert.equal(aceitaAno(2005), false)
  assert.deepEqual(
    decidirElegibilidade({ ano: 2006, powerAoVivo: true, allowlist: true }),
    { acao: 'cotar' },
  )
})

test('ano que nao deu pra resolver nao dispensa cliente no escuro', () => {
  assert.equal(aceitaAno(null), true)
  assert.equal(aceitaAno(Number.NaN), true)
  assert.deepEqual(
    decidirElegibilidade({ ano: null, powerAoVivo: true, allowlist: true }),
    { acao: 'cotar' },
  )
})

test('Power confirmou plano mas a allowlist esta velha — o Power vence, cota', () => {
  // Caso real: BYD Dolphin Mini (id 12717) cotava no Power e a allowlist de 3 dias bloqueava.
  assert.deepEqual(
    decidirElegibilidade({ ano: 2020, powerAoVivo: true, allowlist: false }),
    { acao: 'cotar' },
  )
})

test('Power confirmou que NAO ha plano — ai sim dispensa', () => {
  assert.deepEqual(
    decidirElegibilidade({ ano: 2020, powerAoVivo: false, allowlist: true }),
    { acao: 'nao_fazemos', motivo: 'model' },
  )
})

test('Power mudo + suspeita da allowlist — consultor, NUNCA "nao fazemos"', () => {
  const r = decidirElegibilidade({ ano: 2020, powerAoVivo: null, allowlist: false })
  assert.equal(r.acao, 'consultor')
  assert.notEqual(r.acao, 'nao_fazemos')
})

test('Power mudo — consultor, mesmo sem suspeita nenhuma', () => {
  // Mudou em 31/08/2026 (ordem do dono: "vc sempre vai seguir o power"). Antes o site cotava
  // pela tabela local quando o Power nao respondia — e era ai que ele inventava plano e preco.
  // Medido: em 47 versoes de 10 marcas o Power respondeu 47 vezes, entao isto quase nunca dispara.
  for (const allowlist of [true, null, false]) {
    assert.deepEqual(
      decidirElegibilidade({ ano: 2020, powerAoVivo: null, allowlist }),
      { acao: 'consultor', motivo: 'elegibilidade_indisponivel' },
    )
  }
})

test('nenhuma combinacao dispensa cliente sem o Power ter dito "nao"', () => {
  for (const allowlist of [true, false, null]) {
    const r = decidirElegibilidade({ ano: 2020, powerAoVivo: null, allowlist })
    assert.notEqual(r.acao, 'nao_fazemos', `allowlist=${allowlist} dispensou cliente no escuro`)
  }
})

