import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarWhatsapp,
  mascararTelefone,
  formatarTelefone,
} from '../../src/lib/painel/formato.ts'

test('normaliza celular digitado de qualquer jeito', () => {
  assert.equal(normalizarWhatsapp('(21) 99220-8062'), '5521992208062')
  assert.equal(normalizarWhatsapp('+55 21 99220-8062'), '5521992208062')
  assert.equal(normalizarWhatsapp('21992208062'), '5521992208062')
})

test('numero curto demais nao passa', () => {
  assert.equal(normalizarWhatsapp('9922'), null)
  assert.equal(normalizarWhatsapp(''), null)
})

test('mascara mostra DDD e 4 ultimos — o resto nao', () => {
  assert.equal(mascararTelefone('5521992208062'), '(21) *****-8062')
})

test('mascara aguenta valor estranho sem estourar', () => {
  assert.equal(mascararTelefone(''), '—')
  assert.equal(mascararTelefone('123'), '—')
})

test('admin ve o numero inteiro, legivel', () => {
  assert.equal(formatarTelefone('5521992208062'), '(21) 99220-8062')
  assert.equal(formatarTelefone('552133334444'), '(21) 3333-4444')
})
