import { test } from 'node:test'
import assert from 'node:assert/strict'
import { procuraNoFunilDaCasa } from '../../src/lib/power-fila.regras.ts'

test('lead da Mariana nunca procura no funil da Leticya; os da casa procuram', () => {
  assert.equal(procuraNoFunilDaCasa('mariana_whatsapp'), false)
  assert.equal(procuraNoFunilDaCasa('site_organico'), true)
  assert.equal(procuraNoFunilDaCasa('isa_whatsapp'), true)
  assert.equal(procuraNoFunilDaCasa(null), true)
})
