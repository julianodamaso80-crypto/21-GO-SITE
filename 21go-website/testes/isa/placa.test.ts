import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placaNoTexto } from '../../src/lib/isa/placa.regras.ts'

test('acha a placa do jeito que o cliente digita (o caso do HB20 inventado)', () => {
  assert.equal(placaNoTexto('Pyv8i13'), 'PYV8I13')
  assert.equal(placaNoTexto('a placa é rkm-7j62'), 'RKM7J62')
  assert.equal(placaNoTexto('RKM 7J62'), 'RKM7J62')
  assert.equal(placaNoTexto('placa antiga ABC1234 ok'), 'ABC1234')
  assert.equal(placaNoTexto('📎 foto do veículo: Onix branco (placa QWE4R56)'), 'QWE4R56')
})

test('nao confunde com outras coisas', () => {
  assert.equal(placaNoTexto('quanto fica o plano?'), null)
  assert.equal(placaNoTexto('meu telefone é 21992208062'), null)
  assert.equal(placaNoTexto('R$ 437,00 por mês'), null)
  assert.equal(placaNoTexto('Minha simulação: https://21go.site/api/pdfs/lead_abc1234x'), null)
  assert.equal(placaNoTexto(''), null)
  assert.equal(placaNoTexto(null), null)
})

test('duas placas: vale a ultima (o cliente corrigiu)', () => {
  assert.equal(placaNoTexto('RKM7J62\nops, é PYV8I13'), 'PYV8I13')
})

test('o 9 do celular: from sem o 9 vira a grafia do lead; fixo e outros paises ficam (13/09/2026)', async () => {
  const { telefoneCanonico, variantesDoTelefone } = await import('../../src/lib/isa/telefone.regras.ts')
  assert.equal(telefoneCanonico('558896490972'), '5588996490972')
  assert.equal(telefoneCanonico('5588996490972'), '5588996490972')
  assert.equal(telefoneCanonico('552133334444'), '552133334444') // fixo
  assert.equal(telefoneCanonico('5521992208062'), '5521992208062')
  assert.equal(telefoneCanonico('+55 (88) 96490-972'), '5588996490972')
  assert.deepEqual(variantesDoTelefone('558896490972'), ['5588996490972', '558896490972'])
  assert.deepEqual(variantesDoTelefone('552133334444'), ['552133334444'])
  assert.deepEqual(variantesDoTelefone(''), [])
})
