import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehSoCumprimento } from '../../src/lib/isa/venda.regras.ts'
import { IDENTIDADE_ISA, nomesDoCumprimento } from '../../src/lib/isa/identidade.regras.ts'
import { MARIANA } from './_mariana.ts'

const AMOSTRA = ['oi', 'oi isa', 'Oi Isa!', 'leticya?', 'boa tarde, isa', 'oi mariana', 'gabriel', 'tudo bem? cobre roubo?', 'Tudo bem', 'oi 21go', 'entendi, Leticya']

test('na Isa, "oi isa" e "leticya?" continuam sendo so cumprimento', () => {
  const nomes = nomesDoCumprimento(IDENTIDADE_ISA)
  for (const t of AMOSTRA) assert.equal(ehSoCumprimento(t, nomes), ehSoCumprimento(t), t)
  assert.equal(ehSoCumprimento('oi isa'), true)
  assert.equal(ehSoCumprimento('oi mariana'), false)
})

test('Mariana: "oi mariana" e "gabriel" sao so cumprimento; "oi isa" nao e nome dela', () => {
  const nomes = nomesDoCumprimento(MARIANA)
  assert.equal(ehSoCumprimento('oi mariana', nomes), true)
  assert.equal(ehSoCumprimento('Oi Mariana, bom dia!', nomes), true)
  assert.equal(ehSoCumprimento('gabriel', nomes), true)
  assert.equal(ehSoCumprimento('oi isa', nomes), false)
  assert.equal(ehSoCumprimento('oi mariana, quanto fica?', nomes), false)
  assert.equal(ehSoCumprimento('Tudo bem', nomes), false)
})
