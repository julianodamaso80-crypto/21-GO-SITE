import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETIQUETAS,
  ETIQUETAS_FORA_DA_FILA,
  etiquetasDoBot,
  etiquetasForaDaFila,
  normalizarEtiquetas,
  etiquetaValida,
  etiquetasParaGravar,
} from '../../src/lib/isa/etiquetas.regras.ts'
import { IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

test('na Isa a lista e a de sempre', () => {
  assert.deepEqual(etiquetasDoBot(IDENTIDADE_ISA), ETIQUETAS)
  assert.deepEqual(etiquetasForaDaFila(), [...ETIQUETAS_FORA_DA_FILA])
})

test('Mariana: Gabriel no lugar da Leticya, mesma posicao e cor, e sem Guilherme', () => {
  const lista = etiquetasDoBot(MARIANA)
  assert.deepEqual(
    lista.map((e) => e.id),
    ['urgente', 'quente', 'gabriel', 'pensando', 'documento', 'vistoria', 'fechou', 'consultor', 'frio'],
  )
  const gabriel = lista.find((e) => e.id === 'gabriel')
  const leticya = ETIQUETAS.find((e) => e.id === 'leticya')
  assert.equal(gabriel?.nome, 'Falando com Gabriel')
  assert.equal(gabriel?.cor, leticya?.cor)
  assert.equal(gabriel?.claro, leticya?.claro)
  assert.ok(!lista.some((e) => /Leticya|Guilherme/.test(e.nome)))
})

test('Mariana: as regras da lista usam a lista dela', () => {
  const lista = etiquetasDoBot(MARIANA)
  assert.deepEqual([...etiquetasForaDaFila(lista)].sort(), ['consultor', 'documento', 'fechou', 'frio', 'gabriel', 'pensando', 'vistoria'])
  assert.deepEqual(normalizarEtiquetas(['leticya', 'gabriel', 'guilherme', 'frio'], lista), ['gabriel', 'frio'])
  assert.equal(etiquetaValida('gabriel', lista), true)
  assert.equal(etiquetaValida('leticya', lista), false)
  assert.equal(etiquetaValida('guilherme', lista), false)
  assert.deepEqual(etiquetasParaGravar(['gabriel'], ['avaria'], lista), ['gabriel', 'avaria'])
})
