import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NUMEROS_OFICIAIS, numerosOficiais, extrairTelefones, validarNumeros } from '../../src/lib/isa/validador.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const sem = { dinheiro: [], pct: [] }

test('na Isa a lista de numeros oficiais e a de sempre', () => {
  assert.deepEqual(numerosOficiais(IDENTIDADE_ISA.humano.telefone), NUMEROS_OFICIAIS)
})

test('Mariana: o Gabriel passa, a Leticya nao; sede, 0800 e CNPJ continuam', () => {
  const oficiais = numerosOficiais(MARIANA.humano.telefone)
  assert.ok(oficiais.includes('21990954964'))
  assert.ok(!oficiais.includes('21969454824'))
  for (const n of ['08002345555', '08009418589', '21965700021', '40902817000170']) assert.ok(oficiais.includes(n), n)
  assert.equal(validarNumeros('chama o gabriel: 21 99095-4964', sem, oficiais).ok, true)
  assert.equal(validarNumeros('chama a leticya: 21 96945-4824', sem, oficiais).ok, false)
  assert.deepEqual(extrairTelefones('21 96945-4824', oficiais), ['21 96945-4824'])
})
