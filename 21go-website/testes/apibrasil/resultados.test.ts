import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultadosDaApiBrasil } from '../../src/lib/apibrasil.regras.ts'

// Resposta real do tipo 'fipe' (R$ 0,06) pra KZO9E03, 11/09/2026: a lista vem em data.data.
const real = {
  error: false,
  tax: '0,060',
  data: {
    data: [
      { anoModelo: '2019', categoria: 'carro', codigoFipe: '003464-9', marca: 'Ford', modelo: 'Ka 1.5 Sedan SE 12V Flex 4p Aut.', principal: true, valor: 52754 },
      { anoModelo: '2019', categoria: 'carro', codigoFipe: '003459-2', marca: 'Ford', modelo: 'Ka 1.5 Sedan SE', valor: 49591 },
    ],
    veiculo: {},
  },
}

test("tipo 'fipe': acha a lista em data.data", () => {
  const r = resultadosDaApiBrasil(real.data)
  assert.equal(r.length, 2)
  assert.equal(r[0].valor, 52754)
})

test('formatos antigos continuam lidos; sem lista = vazio', () => {
  assert.equal(resultadosDaApiBrasil([{ valor: 1 }]).length, 1)
  assert.equal(resultadosDaApiBrasil({ resultados: [{ valor: 1 }] }).length, 1)
  assert.deepEqual(resultadosDaApiBrasil(undefined), [])
  assert.deepEqual(resultadosDaApiBrasil({ veiculo: {} }), [])
})
