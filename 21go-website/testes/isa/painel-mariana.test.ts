import { test } from 'node:test'
import assert from 'node:assert/strict'
import { painelDoBot, IDENTIDADE_ISA } from '../../src/lib/isa/identidade.regras.ts'
import { ETIQUETAS, etiquetasDoBot } from '../../src/lib/isa/etiquetas.regras.ts'
import { MARIANA } from './_mariana.ts'

test('Isa: o painel de sempre (Isa, 98004-0964, 4824, etiquetas da casa)', () => {
  assert.deepEqual(painelDoBot(IDENTIDADE_ISA, etiquetasDoBot(IDENTIDADE_ISA)), {
    nome: 'Isa',
    numero: '98004-0964',
    humano: '4824',
    etiquetas: ETIQUETAS,
  })
})

test('Mariana: nome, numero, Gabriel e as etiquetas dela vem do servidor', () => {
  const p = painelDoBot(MARIANA, etiquetasDoBot(MARIANA))
  assert.equal(p.nome, 'Mariana')
  assert.equal(p.numero, '96653-0011')
  assert.equal(p.humano, 'Gabriel')
  assert.ok(p.etiquetas.some((e) => e.id === 'gabriel' && e.nome === 'Falando com Gabriel'))
  assert.ok(!p.etiquetas.some((e) => e.id === 'leticya' || e.id === 'guilherme'))
})
