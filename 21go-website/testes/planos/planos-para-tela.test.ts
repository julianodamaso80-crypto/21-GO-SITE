import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descontoDeLeilao } from '../../src/lib/powercrm-planos.regras.ts'

/*
 * O preco mostrado passa a ser o do Power. O leilao/remarcado continua "descendo uma faixa"
 * (regra do dono, 29/07/2026), so que como DESCONTO aplicado sobre o preco do Power — assim,
 * se os dois divergirem, quem manda no valor continua sendo o Power.
 *
 * Faixas do VIP usadas aqui: 65-70k = 329,55 | 70-75k = 359,04.
 */
const VIP = [
  { min: 60001, max: 65000, price: 314.99 },
  { min: 65001, max: 70000, price: 329.55 },
  { min: 70001, max: 75000, price: 359.04 },
]

test('desconto de leilao e a diferenca pra faixa de baixo', () => {
  // BMW X1 sDrive20i 2013, FIPE 72.784: Power cobra 359,04; de leilao sai 329,55
  assert.equal(Number(descontoDeLeilao(VIP, 72784).toFixed(2)), 29.49)
  assert.equal(Number((359.04 - descontoDeLeilao(VIP, 72784)).toFixed(2)), 329.55)
})

test('primeira faixa e piso: nao desce mais', () => {
  assert.equal(descontoDeLeilao(VIP, 62000), 0)
})

test('FIPE fora da tabela nao inventa desconto', () => {
  assert.equal(descontoDeLeilao(VIP, 999999), 0)
  assert.equal(descontoDeLeilao(VIP, 0), 0)
  assert.equal(descontoDeLeilao(undefined, 72784), 0)
})

test('faixa fora de curva nunca deixa o leilao mais caro', () => {
  // Existe de verdade na tabela SUV: 75-80k = 470,00 e 80-85k = 421,80
  const SUV = [
    { min: 75001, max: 80000, price: 470.0 },
    { min: 80001, max: 85000, price: 421.8 },
  ]
  assert.equal(descontoDeLeilao(SUV, 82000), 0)
})
