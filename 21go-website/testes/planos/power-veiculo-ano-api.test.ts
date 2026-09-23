import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anoDoVeiculoPelaApi } from '../../src/lib/power-veiculo.regras.ts'

/*
 * Medido em 23/09/2026 nas cotacoes DmKwk1XE (Celta 2013) e DV8KYY7E (CG 125 2011): o
 * /api/quotation/update so grava o ano modelo com `carModel` (id do modelo) e `carModelYear`
 * (o ANO, 2013) na MESMA chamada. `mdlYr`, o id do /cmy (146) ou o ano sozinho: 200 e ignorado.
 */

test('modelo e ano vao juntos, com o ano de verdade', () => {
  assert.deepEqual(anoDoVeiculoPelaApi({ modeloId: 1952, anoModelo: 2013 }), { carModel: 1952, carModelYear: 2013 })
})

test('sem modelo nao adianta mandar o ano', () => {
  assert.equal(anoDoVeiculoPelaApi({ modeloId: undefined, anoModelo: 2013 }), null)
})

test('sem ano, ou Zero KM (32000), nao manda nada', () => {
  assert.equal(anoDoVeiculoPelaApi({ modeloId: 1952, anoModelo: null }), null)
  assert.equal(anoDoVeiculoPelaApi({ modeloId: 1952, anoModelo: 32000 }), null)
})
