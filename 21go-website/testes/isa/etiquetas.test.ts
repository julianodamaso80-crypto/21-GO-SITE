import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETIQUETAS, normalizarEtiquetas, etiquetaValida } from '../../src/lib/isa/etiquetas.regras.ts'

test('as etiquetas que o dono pediu existem', () => {
  const nomes = ETIQUETAS.map((e) => e.nome)
  for (const n of ['Falta documento', 'Vistoria', 'Quente', 'Frio', 'Vai fechar']) assert.ok(nomes.includes(n), n)
})

test('so etiqueta conhecida entra, sem repetir e na ordem oficial', () => {
  assert.deepEqual(normalizarEtiquetas(['frio', 'quente', 'frio', 'inventada', 3]), ['quente', 'frio'])
  assert.deepEqual(normalizarEtiquetas('quente'), [])
  assert.deepEqual(normalizarEtiquetas([]), [])
  assert.equal(etiquetaValida('vistoria'), true)
  assert.equal(etiquetaValida('toString'), false)
  assert.equal(etiquetaValida(''), false)
})

test('etiqueta "avaria": o carro tem amassado e a Leticya vai avaliar pelas fotos (dono, 12/09/2026)', async () => {
  const { ETIQUETAS, normalizarEtiquetas } = await import('../../src/lib/isa/etiquetas.regras.ts')
  assert.ok(ETIQUETAS.some((e) => e.id === 'avaria'), 'a etiqueta existe')
  assert.deepEqual(normalizarEtiquetas(['avaria']), ['avaria'])
})
